#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "typer",
#     "rich",
# ]
# ///

# ─── How to run ───
#   uv run epub_publish_readiness.py --book-dir "/path/to/book" [--stage all|content|artifact|isbn|distribution]
# Stage-gated publish readiness for one book. Exit 0 = requested stages green,
# exit 2 = red (failures listed). Writes publish_readiness_* fields to _meta.md.
#
# Stages (each hard-blocks the next):
#   1 content      — quality_gate v3 pass + fresh reviewer verdict
#   2 artifact     — book_artifact_auditor (epubcheck 포함) + colophon/ISBN/발행일/정가 정합 + 변환문구 금지
#   3 isbn         — 사람 검수 승인(human_review_status: approved) + SEOJI 신청 필수 필드 완비 + EPUB2 강제 + 풍부 메타 8필드
#   4 distribution — 사람 검수 승인 + 5사 카테고리 + 표지 규칙 + 표지 콘셉트 기록
# ──────────────────

from __future__ import annotations

import datetime as dt
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path
from typing import Final

import typer
from rich import print as rprint

ARTIFACT_AUDITOR: Final = Path(
    "/Users/minje/Documents/Obsidian Vault/7_AI시스템/자동화프로젝트/출판자동화시스템/book_artifact_auditor.py"
)
# 감사기는 pymupdf(fitz)가 필요 — 유통 자동화 venv의 파이썬을 우선 사용
AUDITOR_PYTHONS: Final = (
    Path("/Users/minje/Documents/Obsidian Vault/7_AI시스템/자동화프로젝트/ebook-distribution-epub/.venv/bin/python"),
    Path("/Users/minje/Documents/Obsidian Vault/7_AI시스템/자동화프로젝트/ebook-distribution/.venv/bin/python"),
)
CONVERSION_NOTICE: Final = "표는 EPUB 가독성을 위해"
# 풍부 메타 의무 필드 (사용자 표준: /book ISBN rich metadata)
ISBN_RICH_FIELDS: Final = ("subtitle", "summary", "toc", "isbn_author_intro", "isbn_keywords", "isbn_excerpt", "isbn_review", "isbn_remark")
PLATFORM_CATEGORY_FIELDS: Final = ("kyobo_category", "ridi_category", "yes24_category", "aladin_category", "millie_category")
STAGES: Final = ("content", "artifact", "isbn", "distribution")


def read_frontmatter(book_dir: Path) -> dict[str, str]:
    meta = book_dir / "_meta.md"
    if not meta.exists():
        return {}
    text = meta.read_text(encoding="utf-8")
    match = re.match(r"^---\n(.*?)\n---", text, re.S)
    if not match:
        return {}
    values: dict[str, str] = {}
    key = None
    for line in match.group(1).splitlines():
        if re.match(r"^[A-Za-z_][\w-]*\s*:", line):
            key, value = line.split(":", 1)
            key = key.strip()
            values[key] = value.strip().strip("'\"")
        elif key and line.startswith(" "):
            values[key] = (values[key] + " " + line.strip()).strip()
    return values


def compact_digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def korean_date(value: str) -> str:
    """2026-07-02 → 2026년 7월 2일 (판권지 표기)"""
    try:
        d = dt.date.fromisoformat(value)
    except ValueError:
        return ""
    return f"{d.year}년 {d.month}월 {d.day}일"


def epub_text_blobs(epub_path: Path) -> dict[str, str]:
    blobs: dict[str, str] = {}
    with zipfile.ZipFile(epub_path) as zf:
        for name in zf.namelist():
            if name.lower().endswith((".xhtml", ".html", ".opf")):
                blobs[name] = zf.read(name).decode("utf-8", errors="ignore")
    return blobs


# ── Stage 1: content ─────────────────────────────────────────────


def check_content(book_dir: Path, fm: dict[str, str]) -> list[str]:
    failures: list[str] = []
    if fm.get("content_quality_final_status") != "pass":
        failures.append(f"콘텐츠 최종 게이트 미통과: {fm.get('content_quality_final_status') or '미검수'} — quality_gate.py 실행 필요")
    if fm.get("content_quality_gate_version") != "3":
        failures.append("quality_gate v3 기준 검수 아님 — 구버전 pass는 무효, quality_gate.py 재실행 필요")
    verdict_path = book_dir / "reviewer_verdict.json"
    if not verdict_path.exists():
        failures.append("reviewer_verdict.json 없음 — content-quality-final-reviewer 미실행")
    else:
        # quality_gate와 동일한 신선도 판정: EPUB보다 최신이거나 body_sha1 일치
        # (표지·판권만 바뀐 재빌드는 재리뷰 불필요)
        sys.path.insert(0, str(Path(__file__).parent))
        import quality_gate  # noqa: PLC0415

        chapters, _ = quality_gate.load_chapters(book_dir)
        surface_issues = quality_gate.reader_surface_issues(chapters)
        if surface_issues:
            sample = surface_issues[0]
            failures.append(
                "독자 화면 오염 문구 감지: "
                f"{len(surface_issues)}종, 예: {sample.get('chapter')} / {sample.get('pattern')} / {sample.get('count')}건"
            )
        verdict, state = quality_gate.read_reviewer_verdict(book_dir, chapters)
        if verdict is None:
            failures.append(f"reviewer_verdict.json {state} — 재리뷰 필요 (본문 변경 감지)")
    return failures


# ── Stage 2: artifact ────────────────────────────────────────────


def check_artifact(book_dir: Path, fm: dict[str, str]) -> list[str]:
    failures: list[str] = []
    epub_name = fm.get("epub", "")
    epub_path = book_dir / epub_name
    if not epub_name or not epub_path.exists():
        return [f"EPUB 파일 없음: {epub_name or '(미지정)'}"]

    # 산출물 감사 (epubcheck + 제목페이지 + 표지 규격) — 기존 감사기 재사용.
    # pymupdf(fitz)가 있는 인터프리터로 실행 (uv 격리 파이썬에는 없음).
    if ARTIFACT_AUDITOR.exists():
        python_bin = next((str(p) for p in AUDITOR_PYTHONS if p.exists()), "python3")
        proc = subprocess.run(
            [python_bin, str(ARTIFACT_AUDITOR), "--book-dir", str(book_dir)],
            capture_output=True, text=True, timeout=900,
        )
        refreshed = read_frontmatter(book_dir)
        if refreshed.get("artifact_audit_status") != "pass":
            try:
                report = json.loads(proc.stdout[proc.stdout.index("{"):])
                audit_failures = report.get("failures", [])
            except (ValueError, json.JSONDecodeError):
                audit_failures = [(proc.stdout + proc.stderr)[-300:]]
            # 이 게이트는 EPUB 트랙 전용 — 구판 PDF 에디션 실패는 경고로 분리
            pdf_failures = [f for f in audit_failures if str(f).startswith("PDF")]
            epub_failures = [f for f in audit_failures if not str(f).startswith("PDF")]
            if epub_failures:
                failures.append(f"book_artifact_auditor 실패: {'; '.join(map(str, epub_failures))}")
            for warning in pdf_failures:
                rprint(f"  [yellow]⚠ PDF 에디션 경고(차단 안 함): {warning}[/yellow]")
    else:
        failures.append(f"book_artifact_auditor 없음: {ARTIFACT_AUDITOR}")

    try:
        blobs = epub_text_blobs(epub_path)
    except zipfile.BadZipFile:
        return failures + [f"EPUB 압축 손상: {epub_name}"]
    all_text = "\n".join(blobs.values())

    # 변환 안내 문구는 본문 노출 금지 (일러두기 1회까지 허용)
    notice_count = all_text.count(CONVERSION_NOTICE)
    if notice_count > 1:
        failures.append(f"변환 안내 문구 {notice_count}회 노출 (허용 1회) — 본문 표 변환 노트 제거 필요")

    # 마크다운 표 원문 누출 금지: 빌드가 표 확장을 끄므로 파이프 표는 원문 그대로 노출됨
    pipe_leak = len(re.findall(r"\|\s*-{2,}\s*\|", all_text)) + len(re.findall(r"(?:\S\s*\|\s*){3,}\S", all_text))
    if pipe_leak:
        failures.append(f"마크다운 표 원문 누출 의심 {pipe_leak}건 — 본문 표를 목록형으로 변환 필요")

    # 판권지 정합: ISBN·발행일·정가가 _meta와 일치해야 함
    # 주의: nav.xhtml 목차에도 "판권"이 등장하므로 판권지 본문 마커(펴낸곳/Copyright)로 식별
    colophon = next(
        (text for name, text in blobs.items() if "copyright" in name.lower()),
        "",
    )
    if not colophon:
        colophon = next((text for text in blobs.values() if "펴낸곳" in text), "")
    if not colophon:
        colophon = next((text for name, text in blobs.items() if "colophon" in name.lower()), "")
    if not colophon:
        failures.append("판권지 페이지를 EPUB에서 찾지 못함")
    else:
        epub_isbn = compact_digits(fm.get("epub_isbn", ""))
        if epub_isbn and epub_isbn not in compact_digits(colophon):
            failures.append(f"판권지 ISBN 불일치: _meta epub_isbn({fm.get('epub_isbn')})이 판권지에 없음")
        pub_date = korean_date(fm.get("publication_date", ""))
        if pub_date and pub_date not in colophon:
            failures.append(f"판권지 발행일 불일치: '{pub_date}' 표기가 판권지에 없음 (publication_date 단일 진실원)")
        price = fm.get("price", "")
        if price and f"{int(price):,}원" not in colophon:
            failures.append(f"판권지 정가 불일치: '{int(price):,}원' 표기가 판권지에 없음")

    # OPF 서지 메타 정합
    opf = next((text for name, text in blobs.items() if name.lower().endswith(".opf")), "")
    if opf:
        title = fm.get("title", "")
        if title and title not in opf:
            failures.append("OPF 메타데이터에 책 제목 없음")
        languages = re.findall(r"<dc:language[^>]*>([^<]+)</dc:language>", opf)
        if not any(lang.lower().startswith("ko") for lang in languages):
            failures.append(f"OPF dc:language가 ko 계열이 아님: {languages}")

    # 유통 사전검수를 여기서 미리 실행 — dispatch 시점 차단(사이클 13: 판권 파일명,
    # 교보 300KB 제한 등)을 artifact 단계에서 조기 발견한다.
    dist_dir = Path("/Users/minje/Documents/Obsidian Vault/7_AI시스템/자동화프로젝트/ebook-distribution-epub")
    platform_rules = dist_dir / "audit_epub_platform_rules.py"
    if platform_rules.exists():
        python_bin = str(dist_dir / ".venv" / "bin" / "python")
        if not Path(python_bin).exists():
            python_bin = "python3"
        proc = subprocess.run(
            [python_bin, "-c",
             "import sys; sys.path.insert(0, sys.argv[1]); "
             "from audit_epub_platform_rules import assert_epub_platform_rules; "
             "from pathlib import Path; "
             "assert_epub_platform_rules(Path(sys.argv[2]), sys.argv[3])",
             str(dist_dir), str(epub_path), book_dir.name],
            capture_output=True, text=True, timeout=300,
        )
        if proc.returncode != 0:
            detail = (proc.stderr or proc.stdout).strip().splitlines()
            failures.append("유통 플랫폼 사전검수 실패: " + " / ".join(detail[-4:]))
    return failures


def check_human_review(fm: dict[str, str]) -> list[str]:
    """사람 품질 검수 게이트 (생산/유통 경계) — SKILL.md의 코디네이터 규칙을 코드로 강제.

    `human_review_status: approved`가 아니면 ISBN 신청·5사 유통을 하드 차단한다.
    승인은 Codex 리더 스레드에서만 뒤집을 수 있고, 승인 시 human_review_date(KST)도 함께 기록되어야 한다.
    """
    status = fm.get("human_review_status", "")
    if status != "approved":
        return [
            f"사람 품질 검수 미승인: human_review_status={status or '미기록'} — "
            "Codex 리더 스레드 승인 후 approved 기록 필요 (pending/rejected 상태에서는 ISBN·유통 진행 금지)"
        ]
    if not fm.get("human_review_date"):
        return ["human_review_date 미기록 — 승인 시 KST 날짜를 _meta.md에 함께 기록해야 함"]
    return []


# ── Stage 3: isbn ────────────────────────────────────────────────


def check_isbn(book_dir: Path, fm: dict[str, str]) -> list[str]:
    failures: list[str] = []
    failures.extend(check_human_review(fm))
    required = ("title", "author", "publisher", "publication_date", "price", "kdc", "cover")
    missing = [key for key in required if not fm.get(key)]
    if missing:
        failures.append(f"ISBN 신청 기본 필드 누락: {', '.join(missing)}")
    rich_missing = [key for key in ISBN_RICH_FIELDS if not fm.get(key)]
    if rich_missing:
        failures.append(f"풍부 메타 필드 누락(사용자 표준 8필드): {', '.join(rich_missing)}")
    summary = fm.get("summary", "")
    if summary and len(summary) < 200:
        failures.append(f"summary가 너무 짧음({len(summary)}자) — 200자 이상 필요")
    form_detail = (fm.get("epub_isbn_form_detail") or "").upper()
    if form_detail != "EPUB2":
        failures.append(f"epub_isbn_form_detail이 EPUB2가 아님({form_detail or '미설정'}) — 사용자 표준은 EPUB2 명시")
    # 표지↔메타 서지 정합 (ISBN 반려 1순위 사유): LLM이 cover.jpg를 판독해
    # 제목·부제·저자 일치를 확인하고 기록한 필드를 코드로 강제한다.
    if fm.get("cover_meta_match_status") != "pass":
        failures.append(
            f"표지↔메타 정합 미확인: cover_meta_match_status={fm.get('cover_meta_match_status') or '미기록'} — "
            "cover.jpg를 판독해 title/subtitle/author 일치 확인 후 pass 기록 필요 (불일치 시 표지 또는 메타 수정)"
        )
    try:
        dt.date.fromisoformat(fm.get("publication_date", ""))
    except ValueError:
        failures.append(f"publication_date 형식 오류: {fm.get('publication_date')}")
    status = fm.get("epub_isbn_status", "")
    if status and status not in ("draft", "ready", "applied", "issued"):
        failures.append(f"epub_isbn_status 비정상: {status}")
    if compact_digits(fm.get("isbn", "")) and compact_digits(fm.get("isbn", "")) == compact_digits(fm.get("epub_isbn", "")):
        failures.append("PDF ISBN과 EPUB ISBN이 동일 — 별도 발급 필요")
    return failures


# ── Stage 4: distribution ────────────────────────────────────────


def check_distribution(book_dir: Path, fm: dict[str, str]) -> list[str]:
    failures: list[str] = []
    failures.extend(check_human_review(fm))
    if fm.get("distribution_category_status") != "selected":
        failures.append(f"유통 카테고리 미선택: {fm.get('distribution_category_status') or '미선택'}")
    else:
        missing = [key for key in PLATFORM_CATEGORY_FIELDS if not fm.get(key)]
        if missing:
            failures.append(f"플랫폼 카테고리 누락: {', '.join(missing)}")
    cover = fm.get("cover", "")
    if not cover.endswith(".jpg"):
        failures.append(f"표지가 소문자 .jpg가 아님: {cover} (5사 공통 규칙)")
    elif not (book_dir / cover).exists():
        failures.append(f"표지 파일 없음: {cover}")
    if fm.get("cover_metaphor_status") != "pass":
        failures.append(f"표지 콘셉트 미기록/중복위험: {fm.get('cover_metaphor_status') or '미기록'}")
    if not compact_digits(fm.get("epub_isbn", "")):
        failures.append("epub_isbn 미배정 — ISBN 번호 배정 후 유통 진행 (SEOJI 최종 issued 대기는 불필요)")
    return failures


CHECKS: Final = {
    "content": check_content,
    "artifact": check_artifact,
    "isbn": check_isbn,
    "distribution": check_distribution,
}


def update_meta(book_dir: Path, status: str, failed_stage: str, failures: list[str]) -> None:
    path = book_dir / "_meta.md"
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    updates = {
        "publish_readiness_status": status,
        "publish_readiness_failed_stage": failed_stage or "none",
        "publish_readiness_at": dt.datetime.now().isoformat(timespec="seconds"),
    }
    for key, value in updates.items():
        if re.search(rf"^{re.escape(key)}:", text, flags=re.M):
            text = re.sub(rf"^{re.escape(key)}:.*$", f"{key}: {value}", text, flags=re.M)
        else:
            text = text.replace("---\n", f"---\n{key}: {value}\n", 1)
    path.write_text(text, encoding="utf-8")
    (book_dir / "publish_readiness_report.json").write_text(
        json.dumps({"status": status, "failed_stage": failed_stage, "failures": failures}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main(
    book_dir: Path = typer.Option(..., exists=True, file_okay=False, dir_okay=True),
    stage: str = typer.Option("all", help="all | content | artifact | isbn | distribution (해당 단계까지 순차 검사)"),
) -> None:
    fm = read_frontmatter(book_dir)
    if not fm:
        rprint("[bold red]red[/bold red] _meta.md 없음 또는 frontmatter 파싱 실패")
        raise typer.Exit(code=2)
    targets = STAGES if stage == "all" else STAGES[: STAGES.index(stage) + 1] if stage in STAGES else None
    if targets is None:
        rprint(f"[bold red]unknown stage: {stage}[/bold red]")
        raise typer.Exit(code=1)
    all_failures: list[str] = []
    failed_stage = ""
    for name in targets:
        failures = CHECKS[name](book_dir, fm)
        icon = "✓" if not failures else "✗"
        rprint(f"[bold]{icon} {name}[/bold]" + ("" if not failures else f" — {len(failures)}건"))
        for failure in failures:
            rprint(f"  - {failure}")
        if failures:
            all_failures.extend(f"[{name}] {f}" for f in failures)
            failed_stage = name
            break  # 단계 실패 시 이후 단계 진행 금지 (하드 게이트)
    status = "green" if not all_failures else "red"
    update_meta(book_dir, status, failed_stage, all_failures)
    rprint(f"[bold]{'🟢 green' if status == 'green' else '🔴 red'}[/bold] ({', '.join(targets)})")
    if status != "green":
        raise typer.Exit(code=2)


if __name__ == "__main__":
    typer.run(main)
