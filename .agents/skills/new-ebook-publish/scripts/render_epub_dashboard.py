#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "typer",
#     "rich",
# ]
# ///

# ─── How to run ───
# 1. Install uv (if not installed):
#      curl -LsSf https://astral.sh/uv/install.sh | sh
# 2. Run directly (no venv, no pip install needed):
#      uv run render_epub_dashboard.py
# 3. Or make executable and run:
#      chmod +x render_epub_dashboard.py && ./render_epub_dashboard.py
# ──────────────────

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Final

import typer
from rich import print as rprint

VAULT_ROOT: Final = Path("/Users/minje/Documents/Obsidian Vault")
DEFAULT_OUTPUT: Final = VAULT_ROOT / "3_출판 및 SNS" / "new-ebook-publish_EPUB_대시보드.md"
RUN_STATE_DIR: Final = VAULT_ROOT / "7_AI시스템" / "자동화프로젝트" / "출판자동화시스템" / "state" / "publish_runs"

DASHBOARD = """---
created: 2026-06-22
updated: {{UPDATED_DATE}}
tags: [대시보드, 전자책, EPUB, new-ebook-publish]
source: codex
cssclasses:
  - wide-page
---

# new-ebook-publish EPUB 대시보드

`/new-ebook-publish`가 만드는 EPUB 중심 출판 대시보드입니다. 표지, EPUB ISBN, 권장 분량 밴드, 내용 밀도 품질 점수, 5사 유통 상태를 한 화면에서 확인합니다.

## 운영 요약

{{RUN_SUMMARY}}

## 핵심 지표

```dataviewjs
const pages = dv.pages('"3_출판 및 SNS/전자책원고"').where(p => p.file.name === "_meta" && p.epub)
const platforms = ["kyobo", "aladin", "yes24", "millie", "ridi"]
const count = rows => rows.length
const status = (p, key) => p[key] || "draft"
const doneDist = p => platforms.filter(name => ["review", "live"].includes(status(p, `epub_dist_${name}_status`))).length
const blocked = p => [
  p.content_quality_final_status,
  p.chapter_similarity_status,
  p.korean_naturalness_status,
  p.reader_value_status,
  p.cover_metaphor_status,
  p.epub_isbn_status,
  p.human_review_status,
  ...platforms.map(name => p[`epub_dist_${name}_status`])
].some(v => ["blocked_content_contract", "blocked_similarity", "blocked_korean_quality", "blocked_reader_value", "duplicate_risk", "revision_required", "rejected"].includes(v))
dv.table(["항목", "수량"], [
  ["EPUB 책", count(pages)],
  ["내용 밀도 통과", count(pages.where(p => p.content_quality_final_status === "pass" && Number(p.content_quality_final_score || 0) >= 85))],
  ["품질 통과", count(pages.where(p => p.content_quality_final_status === "pass"))],
  ["사람 검수 승인", count(pages.where(p => p.human_review_status === "approved"))],
  ["사람 검수 대기(pending)", count(pages.where(p => p.human_review_status === "pending"))],
  ["사람 검수 반려(rejected)", count(pages.where(p => p.human_review_status === "rejected"))],
  ["EPUB ISBN 발급", count(pages.where(p => p.epub_isbn_status === "issued"))],
  ["유통 카테고리 선택", count(pages.where(p => p.distribution_category_status === "selected"))],
  ["5사 심사/판매 완료", count(pages.where(p => doneDist(p) === 5))],
  ["보류/차단", count(pages.where(blocked))]
])
```

## EPUB 출판 현황

```dataviewjs
const pages = dv.pages('"3_출판 및 SNS/전자책원고"')
  .where(p => p.file.name === "_meta" && p.epub)
  .sort(p => p.publication_date, "desc")
const platforms = ["kyobo", "aladin", "yes24", "millie", "ridi"]
const slug = p => p.file.folder.split("/").pop()
const price = v => v ? Number(v).toLocaleString("ko-KR") + "원" : "—"
const badge = v => {
  if (v === "pass" || v === "issued" || v === "live" || v === "approved") return "✅ " + v
  if (v === "review" || v === "applied") return "📡 " + v
  if (v === "pending") return "⏳ " + v
  if (["ready", "draft", "", null, undefined].includes(v)) return "🚀 " + (v || "ready")
  return "⚠️ " + v
}
const coverCell = p => {
  const coverPath = p.cover ? p.file.folder + "/" + p.cover : null
  if (!coverPath) return "—"
  const file = app.vault.getAbstractFileByPath(coverPath)
  if (!file) return "—"
  const img = document.createElement("img")
  img.src = app.vault.getResourcePath(file)
  img.style.height = "104px"
  img.style.borderRadius = "4px"
  img.style.boxShadow = "0 1px 5px rgba(0,0,0,.2)"
  return img
}
const dist = p => platforms.map(name => badge(p[`epub_dist_${name}_status`] || "draft")).join(" · ")
dv.table(
  ["표지", "책", "출간/가격", "EPUB ISBN", "분량", "품질", "사람 검수", "카테고리", "유통"],
  pages.map(p => [
    coverCell(p),
    [dv.fileLink(p.file.path, false, p.title || slug(p)), p.author || "—"].join("\\n"),
    [p.publication_date || "—", price(p.price)].join("\\n"),
    [p.epub_isbn || "—", badge(p.epub_isbn_status || "ready")].join("\\n"),
    [String(p.content_body_chars || "미검수"), badge(p.content_length_status || "미검수")].join("\\n"),
    [`${p.content_quality_final_score || "—"}점`, badge(p.content_quality_final_status || "미검수"), `반복률 ${p.content_repeated_start_ratio || "—"}`, badge(p.chapter_similarity_status || "미검수"), badge(p.korean_naturalness_status || "미검수"), badge(p.reader_value_status || "미검수"), badge(p.cover_metaphor_status || "미기록")].join("\\n"),
    [badge(p.human_review_status || "미검수"), p.human_review_date || "—"].join("\\n"),
    [badge(p.distribution_category_status || "미선택"), p.distribution_category_primary || "—"].join("\\n"),
    dist(p)
  ])
)
```

## 보류 큐

```dataview
TABLE WITHOUT ID
  link(file.path, title) AS "책",
  content_body_chars AS "본문 글자 수",
  content_quality_final_score AS "품질 점수",
  content_quality_final_status AS "최종 품질",
  content_repeated_start_ratio AS "반복률",
  chapter_similarity_status AS "중복/유사도",
  korean_naturalness_status AS "한국어",
  reader_value_status AS "독자 가치",
  cover_metaphor_status AS "표지 콘셉트"
FROM "3_출판 및 SNS/전자책원고"
WHERE file.name = "_meta" AND epub AND (
  content_quality_final_status != "pass" OR
  chapter_similarity_status != "pass" OR
  korean_naturalness_status != "pass" OR
  reader_value_status != "pass" OR
  cover_metaphor_status = "duplicate_risk"
)
SORT file.mtime DESC
```

## 사람 검수 홀드 큐 (pending·rejected)

`human_review_status: approved` 전에는 ISBN 신청·5사 유통이 코드 레벨에서 차단됩니다 (readiness stage 3·4 + preflight-live).

```dataview
TABLE WITHOUT ID
  link(file.path, title) AS "책",
  human_review_status AS "검수 상태",
  human_review_date AS "검수일",
  content_quality_final_score AS "품질 점수",
  cover_meta_match_status AS "표지↔메타",
  epub_isbn_status AS "ISBN 상태"
FROM "3_출판 및 SNS/전자책원고"
WHERE file.name = "_meta" AND epub AND (human_review_status = "pending" OR human_review_status = "rejected")
SORT file.mtime DESC
```

## ISBN·5사 유통 상세

```dataview
TABLE WITHOUT ID
  link(file.path, title) AS "책",
  epub_isbn AS "EPUB ISBN",
  epub_isbn_status AS "ISBN 상태",
  epub_dist_kyobo_status AS "교보",
  epub_dist_aladin_status AS "알라딘",
  epub_dist_yes24_status AS "YES24",
  epub_dist_millie_status AS "밀리",
  epub_dist_ridi_status AS "리디",
  distribution_category_status AS "카테고리 상태",
  distribution_category_primary AS "1차 카테고리",
  distribution_category_fallback AS "대체 카테고리",
  cover_metaphor AS "표지 은유"
FROM "3_출판 및 SNS/전자책원고"
WHERE file.name = "_meta" AND epub
SORT publication_date DESC
```

## 플랫폼별 카테고리 상세

```dataview
TABLE WITHOUT ID
  link(file.path, title) AS "책",
  kyobo_category AS "교보",
  ridi_category AS "리디",
  yes24_category AS "YES24",
  aladin_category AS "알라딘",
  millie_category AS "밀리",
  distribution_category_reason AS "선택 근거"
FROM "3_출판 및 SNS/전자책원고"
WHERE file.name = "_meta" AND epub
SORT publication_date DESC
```
"""


def latest_run_summary() -> str:
    """Summarize the most recently updated publish run instead of a hardcoded
    snapshot that goes stale."""
    fallback = "- 실행 이력 없음 — `publish_orchestrator.py start`로 새 run을 시작하세요."
    if not RUN_STATE_DIR.exists():
        return fallback
    states = sorted(RUN_STATE_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    for path in states:
        try:
            state = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        books = state.get("books") or []
        blocked = sum(1 for book in books if str(book.get("status")) == "blocked")
        return "\n".join([
            f"- 최근 실행 기준: `{state.get('run_id', path.stem)}`",
            f"- 상태: `{state.get('status', '—')}` · 단계: `{state.get('current_stage', '—')}` · 진행률 {state.get('progress', 0)}%",
            f"- 대상 도서: {len(books)}권 (blocked {blocked}권)",
            f"- 마지막 갱신: {state.get('updated_at', '—')}",
            "- 실행 방식: 서지 등록과 5사 유통 모두 headless/background 기준",
        ])
    return fallback


def main(output: Path = DEFAULT_OUTPUT) -> None:
    text = DASHBOARD.replace("{{UPDATED_DATE}}", date.today().isoformat()).replace("{{RUN_SUMMARY}}", latest_run_summary())
    output.write_text(text, encoding="utf-8")
    rprint(f"wrote {output}")


if __name__ == "__main__":
    typer.run(main)
