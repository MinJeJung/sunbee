#!/usr/bin/env python3
"""장별 챕터를 codex exec 서브 세션으로 병렬 집필한다.

배경: 순차 집필(한 세션이 5장 role-play)은 권당 시간의 최대 병목이자
장 간 문장틀 중복(blocked_similarity)의 구조적 원인이었다 (quality_lessons R05).
각 장을 독립 codex 세션이 자기 브리프만 보고 쓰면 속도 ~5배 + 문형 중복 감소.

사용 (오케스트레이터가 실행):
  1) 책 폴더에 agents/briefs/writer_ch{N}_brief.md 를 장별로 작성
     — 필수 포함: 그 장의 아웃라인·chapter_uniqueness_map.md 배정(역할·구조 패턴·사례 도메인·시작 방식)·
       게이트 계약(약속·근거·실행성·자산·실패 처리·중복 방지)·리서치 참조 경로·활성 규칙 전문
  2) python3 parallel_chapter_writers.py --book-dir "<책 폴더>"
  3) 실패 장만 재실행: --chapters 2,4

출력: 장별 결과 JSON (stdout 마지막 줄). 전 장 성공 시 exit 0.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import TypedDict

CODEX_BINARY = os.environ.get("CODEX_BINARY", "/Applications/ChatGPT.app/Contents/Resources/codex")
CODEX_MODEL = os.environ.get("CODEX_MODEL", "gpt-5.6-sol")


class ChapterResult(TypedDict, total=False):
    chapter: int
    status: str
    detail: str
    chars: int
    evidence: bool


PROMPT_TEMPLATE = """당신은 이 책의 {chapter}장 전담 집필자(writer_ch{n})다. 아래 브리프 파일을 정독하고 그 지시만 따르라.

브리프: {brief_path}

집필 규칙:
1. 산출물은 이 폴더의 chapter{n}.md 하나다. 브리프의 아웃라인·고유성 맵 배정(역할·구조 패턴·사례 도메인·시작 방식)을 그대로 따른다.
2. 다른 장(chapter*.md)은 열어보지 않는다 — 장 간 문장틀 중복은 게이트 반려 1순위 원인이다. 일관성은 이후 교차 리뷰 단계가 담당한다.
3. 각 절은 새 인사이트·근거·한국 맥락 예시·독자 행동·자산 또는 실패 사례 중 4개 이상을 실질적으로 담는다. 분량을 채우기 위한 반복·요약 재탕은 금지한다.
4. 브리프에 포함된 게이트 계약과 EPUB 읽기 표면 규칙을 준수한다.
5. 완료 후 agents/writer_ch{n}.md 에 집필 증거(참고한 리서치 항목·구성 결정·고유성 맵 준수 내역)를 기록한다.
6. 두 파일을 모두 저장한 뒤 마지막 줄에 CHAPTER_DONE 만 출력한다.
"""


def visible_length(text: str) -> int:
    return len(re.sub(r"\s+", "", text))


def write_chapter(book_dir: Path, chapter: int, timeout_minutes: int) -> ChapterResult:
    brief = book_dir / "agents" / "briefs" / f"writer_ch{chapter}_brief.md"
    if not brief.is_file():
        return {"chapter": chapter, "status": "no_brief", "detail": str(brief)}
    prompt = PROMPT_TEMPLATE.format(chapter=chapter, n=chapter, brief_path=str(brief))
    try:
        process = subprocess.run(
            [CODEX_BINARY, "exec", "-m", CODEX_MODEL, "--skip-git-repo-check", "-C", str(book_dir), "-"],
            input=prompt, text=True, capture_output=True, timeout=timeout_minutes * 60,
        )
    except subprocess.TimeoutExpired:
        return {"chapter": chapter, "status": "timeout", "detail": f"{timeout_minutes}분 초과"}
    if process.returncode != 0:
        return {"chapter": chapter, "status": "error", "detail": (process.stderr or "")[-500:]}
    output = book_dir / f"chapter{chapter}.md"
    if not output.is_file():
        return {"chapter": chapter, "status": "missing_output", "detail": str(output)}
    chars = visible_length(output.read_text(encoding="utf-8"))
    evidence = book_dir / "agents" / f"writer_ch{chapter}.md"
    return {
        "chapter": chapter,
        "status": "ok",
        "chars": chars,
        "evidence": evidence.is_file(),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--book-dir", required=True, type=Path)
    parser.add_argument("--chapters", default="1,2,3,4,5", help="쉼표 구분 (실패 장만 재실행 시 사용)")
    parser.add_argument("--max-parallel", type=int, default=int(os.environ.get("WRITER_MAX_PARALLEL", "5")))
    parser.add_argument("--timeout-minutes", type=int, default=75)
    args = parser.parse_args()

    book_dir = args.book_dir.expanduser().resolve()
    if not (book_dir / "_meta.md").is_file() and not (book_dir / "outline.md").is_file():
        print(json.dumps({"error": f"책 폴더가 아님: {book_dir}"}, ensure_ascii=False))
        raise SystemExit(1)
    chapters = [int(token) for token in args.chapters.split(",") if token.strip()]

    results: list[ChapterResult] = []
    with ThreadPoolExecutor(max_workers=max(1, args.max_parallel)) as pool:
        futures = {pool.submit(write_chapter, book_dir, chapter, args.timeout_minutes): chapter
                   for chapter in chapters}
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            print(f"[writer_ch{result['chapter']}] {result['status']} {result.get('detail', result.get('chars', ''))}",
                  file=sys.stderr, flush=True)

    results.sort(key=lambda item: item["chapter"])
    failed = [result["chapter"] for result in results if result["status"] != "ok"]
    print(json.dumps({"results": results, "failed": failed}, ensure_ascii=False))
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()
