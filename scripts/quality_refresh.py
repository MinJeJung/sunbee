#!/usr/bin/env python3
"""출간 도서 품질 재감사 — "만들 때 한 번"이 아니라 "출간 후에도 주기적으로".

Loop Engineering의 관찰(Observe) 단계 담당:
  1. 전자책원고 폴더의 모든 책 _meta.md·reviewer_verdict.json·EPUB을 스캔한다.
  2. 현재 품질 기준(기준은 시간이 지나며 올라간다 — ratchet)에 못 미치는 책을
     "업그레이드 후보"로 선별해 data/quality-refresh.json에 기록한다.
  3. 대시보드가 이 파일을 읽어 후보 목록을 노출한다 → 사용자는 수정 요청 한 번으로
     재작업 루프에 태운다.

이 스크립트는 LLM을 호출하지 않는다(빠르고 무료) — 이미 기록된 게이트 점수와
결정적 검사(목차 링크·분량)만 본다. 점수 자체를 다시 매기는 재채점은 별도 단계.

실행:
  python3 scripts/quality_refresh.py                    # 기본 경로·기준
  python3 scripts/quality_refresh.py --min-naturalness 82  # 기준 상향(ratchet)
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BOOKS_ROOT = Path("/Users/minje/Documents/Obsidian Vault/3_출판 및 SNS/전자책원고")
DEFAULT_OUTPUT = PROJECT_ROOT / "data" / "quality-refresh.json"
KST = timezone(timedelta(hours=9))

FRONTMATTER_KEY = re.compile(r"^([A-Za-z0-9_]+):\s*(.*?)\s*$")


def _load_toc_validator():
    spec = importlib.util.spec_from_file_location(
        "validate_epub_toc", PROJECT_ROOT / "bridge" / "validate_epub_toc.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_frontmatter(meta_path: Path) -> dict[str, str]:
    """단일 행 key: value만 수집 — 여러 줄 값(toc 등)은 재감사에 불필요."""
    fields: dict[str, str] = {}
    try:
        lines = meta_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return fields
    if not lines or lines[0].strip() != "---":
        return fields
    for line in lines[1:]:
        if line.strip() == "---":
            break
        match = FRONTMATTER_KEY.match(line)
        if match:
            fields[match.group(1)] = match.group(2).strip().strip("'\"")
    return fields


def read_reviewer_verdict(book_dir: Path) -> dict:
    path = book_dir / "reviewer_verdict.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def newest_epub(book_dir: Path, declared: str) -> Path | None:
    if declared:
        candidate = book_dir / declared
        if candidate.is_file():
            return candidate
    epubs = sorted(book_dir.glob("*.epub"), key=lambda p: p.stat().st_mtime, reverse=True)
    return epubs[0] if epubs else None


def to_float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def audit_book(book_dir: Path, toc_validator, standards: dict) -> dict | None:
    meta_path = book_dir / "_meta.md"
    if not meta_path.is_file():
        return None
    meta = read_frontmatter(meta_path)
    verdict = read_reviewer_verdict(book_dir)
    epub = newest_epub(book_dir, meta.get("epub", ""))

    # hard = 지금 바로 고칠 실결함(깨진 목차·게이트 차단·점수 미달) — 대시보드 후보.
    # soft = 새 표준 대기(본문 차례 없음·품질 데이터 미기록) — 전면 재빌드를 강요하지
    #        않도록 별도 카운트로만 집계한다 (352권 전부 후보로 뜨는 노이즈 방지).
    hard: list[str] = []
    soft: list[str] = []
    naturalness = to_float(verdict.get("korean_naturalness_score"))
    reader_value = to_float(verdict.get("reader_value_score"))
    final_score = to_float(meta.get("content_quality_final_score"))
    body_chars = to_float(meta.get("content_body_chars"))

    gate_status = meta.get("content_quality_final_status", "")
    if gate_status and gate_status != "pass":
        hard.append(f"품질 게이트 상태 {gate_status}")
    elif not gate_status and not verdict:
        soft.append("품질 게이트 기록 없음 (구 파이프라인 도서)")
    if naturalness is not None and naturalness < standards["min_naturalness"]:
        hard.append(f"한국어 자연도 {naturalness:.0f} < 기준 {standards['min_naturalness']:.0f}")
    if reader_value is not None and reader_value < standards["min_reader_value"]:
        hard.append(f"독자 가치 {reader_value:.0f} < 기준 {standards['min_reader_value']:.0f}")
    if body_chars is not None and body_chars < standards["min_body_chars"]:
        hard.append(f"본문 {int(body_chars):,}자 < 기준 {standards['min_body_chars']:,}자")

    toc_result = None
    if epub is not None:
        try:
            toc_result = toc_validator.validate(str(epub))
        except Exception as error:  # noqa: BLE001 — 개별 책 실패가 전체 스캔을 끊지 않게
            toc_result = {"status": "error", "failures": [str(error)], "warnings": [], "checked": {}}
        if toc_result["status"] != "pass":
            preview = " / ".join(toc_result["failures"][:2]) or "검증 오류"
            hard.append(f"목차 링크 결함: {preview}")
        elif toc_result["checked"].get("body_toc_pages", 0) == 0:
            soft.append("본문 차례 페이지 없음 (신규 표준)")
    else:
        hard.append("EPUB 파일을 찾을 수 없음")

    return {
        "slug": book_dir.name,
        "title": meta.get("title") or book_dir.name,
        "epub": str(epub) if epub else None,
        "humanReviewStatus": meta.get("human_review_status") or None,
        "metrics": {
            "koreanNaturalness": naturalness,
            "readerValue": reader_value,
            "finalScore": final_score,
            "bodyChars": int(body_chars) if body_chars is not None else None,
            "tocStatus": toc_result["status"] if toc_result else "missing",
            "bodyTocPages": toc_result["checked"].get("body_toc_pages") if toc_result else None,
        },
        "reasons": hard,
        "softReasons": soft,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--books-root", default=str(DEFAULT_BOOKS_ROOT))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--min-naturalness", type=float, default=80.0,
                        help="한국어 자연도 하한 (게이트 통과선 78보다 높게 잡아 상향 압력 유지)")
    parser.add_argument("--min-reader-value", type=float, default=85.0)
    parser.add_argument("--min-body-chars", type=int, default=120_000)
    args = parser.parse_args()

    standards = {
        "min_naturalness": args.min_naturalness,
        "min_reader_value": args.min_reader_value,
        "min_body_chars": args.min_body_chars,
    }
    books_root = Path(args.books_root)
    if not books_root.is_dir():
        print(f"책 루트가 없습니다: {books_root}", file=sys.stderr)
        return 2

    toc_validator = _load_toc_validator()
    audits: list[dict] = []
    for book_dir in sorted(books_root.iterdir()):
        if not book_dir.is_dir() or book_dir.name.startswith(("_", ".")):
            continue
        audit = audit_book(book_dir, toc_validator, standards)
        if audit is not None:
            audits.append(audit)

    candidates = [audit for audit in audits if audit["reasons"]]
    candidates.sort(key=lambda a: (-len(a["reasons"]), a["title"]))
    soft_pending = sum(1 for audit in audits if not audit["reasons"] and audit["softReasons"])
    payload = {
        "generatedAt": datetime.now(KST).isoformat(timespec="seconds"),
        "standards": standards,
        "scanned": len(audits),
        "passed": len(audits) - len(candidates) - soft_pending,
        "softPending": soft_pending,
        "candidates": candidates,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(f".{os.getpid()}.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(output)
    print(f"재감사 완료: {len(audits)}권 스캔, 업그레이드 후보 {len(candidates)}권 → {output}")
    for candidate in candidates[:10]:
        print(f"- {candidate['title'][:44]}: {'; '.join(candidate['reasons'][:2])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
