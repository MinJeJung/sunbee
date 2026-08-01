#!/usr/bin/env -S uv run --script
# noqa: SIZE_OK — one auditable CLI contract keeps scoring and report output synchronized
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
#      uv run quality_gate.py --book-dir "/path/to/book"
# 3. Exit codes: 0 = pass, 2 = blocked, 3 = needs_llm_review
# ──────────────────

from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
import zipfile
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Final

import typer
from rich import print as rprint

from quality_gate_v3 import V3Report, analyze_v3, current_epub_sha256, write_repair_requests

BOOK_LENGTH_RANGES: Final = {
    "quick": (40_000, 60_000),
    "standard": (60_000, 90_000),
    "deep": (90_000, 120_000),
}
QUALITY_WEIGHTS: Final = {
    "promise_resolution_score": 0.25,
    "new_information_score": 0.20,
    "source_accuracy_score": 0.15,
    "actionability_score": 0.20,
    "korean_naturalness_score": 0.10,
    "differentiation_score": 0.10,
}
MAX_REPEATED_START_RATIO: Final = 0.18
MIN_READER_VALUE_SCORE: Final = 85
MIN_KOREAN_NATURALNESS_SCORE: Final = 78
# Heuristic prefilter floors: only obviously broken text is blocked without an
# LLM verdict. The real judgment comes from reviewer_verdict.json.
HEURISTIC_KOREAN_FLOOR: Final = 60
HEURISTIC_VALUE_FLOOR: Final = 60
DEFAULT_AUDIT_SCRIPT: Final = Path("/Users/minje/.agents/skills/book/scripts/content_quality_audit.py")
SKIP_FILE_RE: Final = re.compile(r"(nav|toc|cover|title|copyright|colophon|isbn)", re.I)
BLOCK_TAGS: Final = frozenset({"p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "div", "section", "blockquote", "tr"})
ACTION_WORDS: Final = ("체크리스트", "단계", "방법", "기준", "사례", "예시", "템플릿", "실습", "주의", "판단", "실행")
AWKWARD_WORDS: Final = ("것입니다", "할 수 있습니다", "중요합니다", "다양한", "효율적", "활용할 수", "이를 통해")
READER_SURFACE_BLOCKERS: Final = {
    "handoff_index": re.compile(r"이관\d{3}"),
    "numbered_filler_marker": re.compile(r"(?:감사|점수|후속|리뷰|초진카드|분류메모|보관신호)\s*\d{3}"),
    "synthetic_item_marker": re.compile(r"[가-힣]{2,12}(?:항목|보강|전용추가)\s*\d{1,3}(?:번)?"),
    "clause_hash": re.compile(r"조항색인\s+\d{1,3}-[0-9a-f]{24,}", re.I),
    "long_hash": re.compile(r"\b[0-9a-f]{32,}\b", re.I),
    "review_record": re.compile(r"검토기록\s+\d+-\d+-\d+"),
    "sentence_id": re.compile(r"문장\d+-\d+"),
    "function_table_argument": re.compile(r"기능표 논쟁"),
    "nth_standard": re.compile(r"\d+번째 도입 기준"),
    "synthetic_review_triads": re.compile(r"점검하며[^.。!?]{0,120}근거는[^.。!?]{0,120}검토 질문은"),
}


class TextExtractor(HTMLParser):
    """Extract text while preserving paragraph boundaries so the structural
    audit can run paragraph-level duplicate checks on EPUB content."""

    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self._ignored_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in {"style", "script"}:
            self._ignored_depth += 1

    def handle_data(self, data: str) -> None:
        if self._ignored_depth:
            return
        cleaned = data.strip()
        if cleaned:
            self.parts.append(cleaned)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"style", "script"} and self._ignored_depth:
            self._ignored_depth -= 1
            return
        if self._ignored_depth:
            return
        if tag.lower() in BLOCK_TAGS and self.parts and self.parts[-1] != "\n\n":
            self.parts.append("\n\n")


@dataclass(frozen=True, slots=True)
class ChapterText:
    name: str
    text: str

    @property
    def char_count(self) -> int:
        return len(re.sub(r"\s+", "", self.text))

    @property
    def flat(self) -> str:
        return re.sub(r"\s+", " ", self.text).strip()


@dataclass(slots=True)  # noqa: MUTABLE_OK — intentional scoring accumulator
class QualityResult:
    status: str = "pass"
    score: int = 0
    body_chars: int = 0
    max_similarity: float = 0.0
    repeated_start_ratio: float = 0.0
    korean_naturalness_status: str = "pending"
    korean_naturalness_score: int = 0
    reader_value_status: str = "pending"
    reader_value_score: int = 0
    length_status: str = "pass"
    book_type: str = "standard"
    recommended_min_chars: int = 60_000
    recommended_max_chars: int = 90_000
    quality_dimensions: dict[str, int] = field(default_factory=dict)
    audit_status: str = "skipped"
    reviewer_status: str = "missing"
    reader_surface_status: str = "pass"
    reader_surface_issues: list[dict[str, Any]] = field(default_factory=list)
    failures: list[str] = field(default_factory=list)


def strip_frontmatter(text: str) -> str:
    return re.sub(r"^---\n.*?\n---\n", "", text, flags=re.S)


def read_meta(book_dir: Path) -> dict[str, str]:
    meta = book_dir / "_meta.md"
    if not meta.exists():
        return {}
    text = meta.read_text(encoding="utf-8")
    match = re.match(r"^---\n(.*?)\n---", text, re.S)
    if not match:
        return {}
    values: dict[str, str] = {}
    for line in match.group(1).splitlines():
        if ":" in line and not line.startswith(" "):
            key, value = line.split(":", 1)
            values[key.strip()] = value.strip().strip("'\"")
    return values


def extract_html_text(payload: bytes) -> str:
    source = payload.decode("utf-8", errors="ignore")
    empty_list_items = len(re.findall(r"<li\b[^>]*>\s*(?:<p\b[^>]*>\s*</p>\s*)?</li>", source, flags=re.I))
    parser = TextExtractor()
    parser.feed(source)
    text = " ".join(parser.parts)
    text = re.sub(r" ?\n\n ?", "\n\n", text)
    cleaned = re.sub(r"[ \t]+", " ", text).strip()
    return f"{cleaned}\n" + "-\n" * empty_list_items if empty_list_items else cleaned


def chapters_from_epub(epub_path: Path) -> list[ChapterText]:
    chapters: list[ChapterText] = []
    with zipfile.ZipFile(epub_path) as archive:
        names = sorted(n for n in archive.namelist() if n.lower().endswith((".html", ".xhtml")))
        for name in names:
            if SKIP_FILE_RE.search(Path(name).name):
                continue
            text = extract_html_text(archive.read(name))
            if len(text) >= 500:
                chapters.append(ChapterText(name=name, text=text))
    return chapters


def chapters_from_markdown(book_dir: Path) -> list[ChapterText]:
    chapters: list[ChapterText] = []
    for path in sorted(book_dir.glob("chapter*.md")):
        text = strip_frontmatter(path.read_text(encoding="utf-8", errors="ignore")).strip()
        if len(text) >= 500:
            chapters.append(ChapterText(name=path.name, text=text))
    return chapters


def load_chapters(book_dir: Path) -> tuple[list[ChapterText], list[str]]:
    """Return chapters plus hard failures. No silent EPUB→markdown fallback:
    if _meta.md declares an EPUB it must exist and be readable — the gate must
    judge the artifact that actually ships."""
    meta = read_meta(book_dir)
    epub_name = meta.get("epub", "")
    failures: list[str] = []
    if epub_name:
        epub_path = book_dir / epub_name
        if not epub_path.exists():
            return [], [f"blocked_missing_epub: declared epub not found: {epub_name}"]
        try:
            chapters = chapters_from_epub(epub_path)
        except zipfile.BadZipFile:
            return [], [f"blocked_missing_epub: unreadable epub (bad zip): {epub_name}"]
        if not chapters:
            return [], [f"blocked_missing_epub: no chapter content extracted from {epub_name}"]
        return chapters, failures
    epub_path = next(iter(sorted(book_dir.glob("*.epub"))), None)
    if epub_path:
        try:
            chapters = chapters_from_epub(epub_path)
            if chapters:
                return chapters, failures
        except zipfile.BadZipFile:
            failures.append(f"warning_bad_epub: {epub_path.name}")
    return chapters_from_markdown(book_dir), failures


def run_structural_audit(chapters: list[ChapterText], audit_script: Path) -> dict[str, Any]:
    """Run /book's content_quality_audit.py (single source of thresholds:
    shingle jaccard 0.08, shared sentences 8, sequence similarity 0.18,
    paragraph duplicates, boilerplate) on the extracted chapter text."""
    if not audit_script.exists():
        return {"status": "unavailable", "failures": [f"audit script missing: {audit_script}"]}
    with tempfile.TemporaryDirectory(prefix="quality-gate-") as tmp:
        workspace = Path(tmp)
        for index, chapter in enumerate(chapters, start=1):
            (workspace / f"chapter{index:02d}.md").write_text(chapter.text, encoding="utf-8")
        proc = subprocess.run(
            [sys.executable, str(audit_script), str(workspace), "--json"],
            capture_output=True,
            text=True,
            timeout=1800,
        )
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {"status": "unavailable", "failures": [f"audit produced no JSON (rc={proc.returncode}): {proc.stderr[:400]}"]}


def body_sha1(chapters: list[ChapterText]) -> str:
    import hashlib

    digest = hashlib.sha1()
    for chapter in chapters:
        digest.update(re.sub(r"\s+", "", chapter.text).encode("utf-8"))
    return digest.hexdigest()


def read_reviewer_verdict(book_dir: Path, chapters: list[ChapterText]) -> tuple[dict[str, Any] | None, str]:
    """Load reviewer_verdict.json written by the content-quality-final-reviewer
    agent. Freshness: the verdict is valid if it is newer than the EPUB (mtime)
    OR its recorded body_sha1 matches the current body text — so cover swaps,
    colophon ISBN updates, and other non-content rebuilds don't force a
    re-review, while any body change does."""
    path = book_dir / "reviewer_verdict.json"
    if not path.exists():
        return None, "missing"
    try:
        verdict = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None, "invalid"
    required = ("korean_naturalness_score", "reader_value_score", "verdict")
    if not all(key in verdict for key in required):
        return None, "invalid"
    meta = read_meta(book_dir)
    epub_name = meta.get("epub", "")
    if epub_name:
        epub_path = book_dir / epub_name
        if epub_path.exists() and epub_path.stat().st_mtime > path.stat().st_mtime:
            if verdict.get("body_sha1") != body_sha1(chapters):
                return None, "stale"
    return verdict, "ok"


def stamp_verdict_sha(book_dir: Path, verdict: dict[str, Any], chapters: list[ChapterText]) -> None:
    """After validating a fresh verdict, pin it to the reviewed body text."""
    sha = body_sha1(chapters)
    if verdict.get("body_sha1") == sha:
        return
    verdict["body_sha1"] = sha
    (book_dir / "reviewer_verdict.json").write_text(json.dumps(verdict, ensure_ascii=False, indent=2), encoding="utf-8")


def repeated_sentence_start_ratio(chapters: list[ChapterText]) -> float:
    starts: list[str] = []
    for chapter in chapters:
        sentences = re.split(r"[.!?。！？\n]+", chapter.flat)
        starts.extend(s.strip()[:18] for s in sentences if len(s.strip()) >= 18)
    if not starts:
        return 0.0
    repeated = len(starts) - len(set(starts))
    return repeated / len(starts)


def heuristic_reader_value(chapters: list[ChapterText]) -> int:
    chapter_scores: list[int] = []
    for chapter in chapters:
        hits = sum(1 for word in ACTION_WORDS if word in chapter.text)
        density = min(65, hits * 9)
        concrete = min(35, len(re.findall(r"\d+|[①-⑩]|첫째|둘째|셋째|예를 들어", chapter.text)) * 2)
        chapter_scores.append(min(100, density + concrete))
    return round(sum(chapter_scores) / max(1, len(chapter_scores)))


def heuristic_korean_naturalness(chapters: list[ChapterText]) -> int:
    text = " ".join(chapter.flat for chapter in chapters)
    sentences = [s.strip() for s in re.split(r"[.!?。！？\n]+", text) if len(s.strip()) >= 20]
    awkward_hits = sum(text.count(word) for word in AWKWARD_WORDS)
    ratio = awkward_hits / max(1, len(sentences))
    return max(0, min(100, round(100 - ratio * 120)))


def reader_surface_issues(chapters: list[ChapterText]) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    for chapter in chapters:
        for label, pattern in READER_SURFACE_BLOCKERS.items():
            matches = list(pattern.finditer(chapter.text))
            if not matches:
                continue
            first = matches[0]
            start = max(0, first.start() - 80)
            end = min(len(chapter.text), first.end() + 160)
            issues.append(
                {
                    "chapter": chapter.name,
                    "pattern": label,
                    "count": len(matches),
                    "excerpt": _shorten(chapter.text[start:end], 240),
                }
            )
    return issues


def audit_max_similarity(audit: dict[str, Any]) -> float:
    return max((row.get("sentence_shingle_jaccard", 0.0) for row in audit.get("pairwise", [])), default=0.0)


def evaluate(
    chapters: list[ChapterText],
    audit: dict[str, Any] | None = None,
    verdict: dict[str, Any] | None = None,
    load_failures: list[str] | None = None,
    book_type: str = "standard",
) -> QualityResult:
    result = QualityResult()
    normalized_book_type = book_type if book_type in BOOK_LENGTH_RANGES else "standard"
    recommended_min, recommended_max = BOOK_LENGTH_RANGES[normalized_book_type]
    result.book_type = normalized_book_type
    result.recommended_min_chars = recommended_min
    result.recommended_max_chars = recommended_max
    result.failures.extend(f for f in (load_failures or []) if not f.startswith("warning_"))
    result.body_chars = sum(chapter.char_count for chapter in chapters)
    result.repeated_start_ratio = repeated_sentence_start_ratio(chapters)
    result.reader_surface_issues = reader_surface_issues(chapters)
    if result.reader_surface_issues:
        result.reader_surface_status = "blocked_reader_surface_quality"
        result.failures.append("blocked_reader_surface_quality")

    if result.body_chars < recommended_min:
        result.length_status = "warning_under_target"
    elif result.body_chars > recommended_max:
        result.length_status = "warning_over_target"
    else:
        result.length_status = "target"

    # 2) Structural originality gate (shared thresholds with /book audit)
    similarity_blocked = False
    if audit is not None:
        result.audit_status = str(audit.get("status", "unavailable"))
        result.max_similarity = audit_max_similarity(audit)
        if result.audit_status == "fail":  # noqa: IF_VARIANT_OK — external status is open-ended
            similarity_blocked = True
            result.failures.append("blocked_similarity")
        elif result.audit_status == "unavailable":
            result.failures.append("blocked_audit_unavailable")
    if result.repeated_start_ratio > MAX_REPEATED_START_RATIO:
        if not similarity_blocked:
            result.failures.append("blocked_similarity")
        similarity_blocked = True

    # 3) Korean naturalness / reader value — heuristic floors block obvious
    #    failures; otherwise the LLM reviewer verdict decides.
    heuristic_korean = heuristic_korean_naturalness(chapters)
    heuristic_value = heuristic_reader_value(chapters)
    if verdict is not None:
        result.reviewer_status = "ok"
        result.korean_naturalness_score = int(verdict.get("korean_naturalness_score", 0))
        fallback_value = int(verdict.get("reader_value_score", 0))
        result.quality_dimensions = {
            key: int(verdict.get(key, fallback_value))
            for key in QUALITY_WEIGHTS
        }
        result.reader_value_score = round(sum(result.quality_dimensions[key] * weight for key, weight in QUALITY_WEIGHTS.items()))
        if result.korean_naturalness_score < MIN_KOREAN_NATURALNESS_SCORE:
            result.korean_naturalness_status = "blocked_korean_quality"
            result.failures.append("blocked_korean_quality")
        else:
            result.korean_naturalness_status = "pass"
        if result.reader_value_score < MIN_READER_VALUE_SCORE:
            result.reader_value_status = "blocked_reader_value"
            result.failures.append("blocked_reader_value")
        else:
            result.reader_value_status = "pass"
        blocking_issues = verdict.get("blocking_issues") or []
        if blocking_issues:
            result.failures.append("blocked_content_contract")
        # Catch-all: scores can pass while the reviewer still flags a fatal
        # flaw (e.g. broken chapter references) — a fail verdict always blocks.
        if str(verdict.get("verdict")) == "fail" and not any(f in result.failures for f in ("blocked_korean_quality", "blocked_reader_value", "blocked_content_contract")):
            result.failures.append("blocked_reviewer_verdict")
    else:
        result.korean_naturalness_score = heuristic_korean
        result.reader_value_score = heuristic_value
        if heuristic_korean < HEURISTIC_KOREAN_FLOOR:
            result.korean_naturalness_status = "blocked_korean_quality"
            result.failures.append("blocked_korean_quality")
        else:
            result.korean_naturalness_status = "needs_llm_review"
        if heuristic_value < HEURISTIC_VALUE_FLOOR:
            result.reader_value_status = "blocked_reader_value"
            result.failures.append("blocked_reader_value")
        else:
            result.reader_value_status = "needs_llm_review"

    if analyze_v3(chapters).has_issues:
        result.failures.append("blocked_content_quality_v3")

    result.failures = list(dict.fromkeys(result.failures))
    blocked = [f for f in result.failures if f.startswith("blocked_")]
    if blocked:
        result.status = blocked[0]
    elif verdict is None:
        result.status = "needs_llm_review"
    else:
        result.status = "pass"

    result.score = result.reader_value_score if verdict is not None else round(result.korean_naturalness_score * 0.3 + result.reader_value_score * 0.7)
    return result


def _shorten(text: str, limit: int = 160) -> str:
    flat = re.sub(r"\s+", " ", text).strip()
    return flat if len(flat) <= limit else flat[: limit - 1] + "…"


def build_rewrite_requests(chapters: list[ChapterText], result: QualityResult, audit: dict[str, Any] | None, verdict: dict[str, Any] | None) -> str:
    """Turn gate failures into concrete, per-chapter rewrite instructions that
    can be sent back to the book's writer thread verbatim."""
    lines = ["# Rewrite Requests", "", f"- status: {result.status}", f"- failures: {', '.join(result.failures) or 'none'}", ""]
    if result.length_status != "target":
        direction = "약속한 내용이 빠졌는지 확인하되 분량을 채우기 위한 문장을 추가하지 말 것" if result.length_status == "warning_under_target" else "반복 설명과 낮은 정보 밀도 문단을 압축 편집할 것"
        lines += ["## 권장 분량 안내", "", f"- 현재 본문 {result.body_chars:,}자 / {result.book_type} 권장 {result.recommended_min_chars:,}~{result.recommended_max_chars:,}자.", f"- {direction}.", ""]
    if audit and audit.get("status") == "fail":
        lines += ["## 장 간 중복 제거 (구조적 독창성 감사 실패)", ""]
        for failure in audit.get("failures", [])[:15]:
            lines.append(f"- {failure}")
        lines.append("")
        pairs = sorted(audit.get("pairwise", []), key=lambda r: -(r.get("sentence_shingle_jaccard", 0)))[:3]
        for pair in pairs:
            heavy = pair.get("sentence_shingle_jaccard", 0) > 0.04 or pair.get("shared_sentences", 0) > 8
            if heavy:
                lines.append(f"- `{pair['left']}` ↔ `{pair['right']}`: 공유 문장 {pair.get('shared_sentences', 0)}개, shingle jaccard {pair.get('sentence_shingle_jaccard', 0)}. 두 장 중 하나는 제목·섹션 구조만 남기고 새 예시와 새 흐름으로 재작성할 것.")
            elif pair.get("shared_sentences", 0):
                lines.append(f"- `{pair['left']}` ↔ `{pair['right']}`: 공유 문장 {pair.get('shared_sentences', 0)}개 — 아래 반복 문장 목록의 해당 문장만 장별 고유 문장으로 교체하면 됨 (전면 재작성 불필요).")
        for row in audit.get("repeated_across_chapters", [])[:8]:
            lines.append(f"- {row['chapter_count']}개 장에서 반복: “{_shorten(row['sentence'])}” — 한 곳만 남기고 각 장에 맞는 고유 문장으로 교체.")
        for hit in audit.get("boilerplate_hits", [])[:5]:
            lines.append(f"- 금지 보일러플레이트 (`{hit['file']}`): “{_shorten(hit['excerpt'])}” — 삭제 후 장 고유 도입문으로 교체.")
        lines.append("")
    if result.repeated_start_ratio > MAX_REPEATED_START_RATIO:
        lines += ["## 문장 시작 다양화", "", f"- 동일한 첫 18자로 시작하는 문장 비율 {result.repeated_start_ratio:.2%} (허용 {MAX_REPEATED_START_RATIO:.0%}). 도입부 패턴을 장마다 다르게 쓸 것.", ""]
    if "blocked_reader_surface_quality" in result.failures:
        lines += ["## 독자 화면 오염 제거", "", "- 아래 문구는 내부 식별자·기계적 분량 채우기 문장으로 판단되어 유통 금지입니다. 해당 절은 단순 삭제가 아니라 독자가 바로 쓸 수 있는 사례, 체크리스트, 판단 기준으로 다시 작성할 것.", ""]
        for issue in result.reader_surface_issues[:20]:
            lines.append(f"- `{issue['chapter']}` {issue['pattern']} {issue['count']}건: “{issue['excerpt']}”")
        if len(result.reader_surface_issues) > 20:
            lines.append(f"- 추가 {len(result.reader_surface_issues) - 20}건")
        lines.append("")
    if "blocked_korean_quality" in result.failures:
        lines += ["## 한국어 자연스러움", "", f"- 점수 {result.korean_naturalness_score} (기준 {MIN_KOREAN_NATURALNESS_SCORE}). 번역투·기계적 종결(‘~할 수 있습니다’ 반복)·상투어를 줄이고 능동형 문장으로 교체.", ""]
    if "blocked_reader_value" in result.failures:
        lines += ["## 독자 가치 보강", "", f"- 점수 {result.reader_value_score} (기준 {MIN_READER_VALUE_SCORE}). 각 장에 실행 가능한 방법·수치 기준·실패 사례·템플릿을 추가할 것.", ""]
    if "blocked_content_contract" in result.failures:
        lines += ["## 약속한 콘텐츠 누락", "", "- 출처 없는 최신 사실, 미표시 합성 사례, 독자 톤 불일치, 반복 구조, 약속한 자산 누락, 내부 표식을 모두 해소할 것.", ""]
    if verdict:
        issues = verdict.get("issues") or []
        requests = verdict.get("rewrite_requests") or []
        if issues or requests:
            lines += ["## 리뷰어 지적 사항", ""]
            lines += [f"- {issue}" for issue in issues[:15]]
            lines += [f"- [재작성] {request}" for request in requests[:15]]
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def update_meta(book_dir: Path, result: QualityResult) -> None:
    path = book_dir / "_meta.md"
    if not path.exists():
        rprint(f"[yellow]warning: {path} not found — meta fields not recorded[/yellow]")
        return
    text = path.read_text(encoding="utf-8")
    similarity_pass = result.audit_status == "pass" and result.repeated_start_ratio <= MAX_REPEATED_START_RATIO
    updates = {
        "content_quality_gate_version": "4",
        "content_quality_final_status": result.status,
        "content_quality_final_score": str(result.score),
        "content_quality_failures": " | ".join(result.failures) if result.failures else "none",
        "content_body_chars": str(result.body_chars),
        "content_repeated_start_ratio": f"{result.repeated_start_ratio:.4f}",
        "content_length_status": result.length_status,
        "content_book_type": result.book_type,
        "content_recommended_chars": f"{result.recommended_min_chars}-{result.recommended_max_chars}",
        "chapter_similarity_status": "pass" if similarity_pass else ("blocked_similarity" if result.audit_status == "fail" or result.repeated_start_ratio > MAX_REPEATED_START_RATIO else result.audit_status),
        "korean_naturalness_status": result.korean_naturalness_status,
        "reader_value_status": result.reader_value_status,
        "reader_surface_quality_status": result.reader_surface_status,
        "content_quality_final_report": "content_quality_final_review.md",
        "chapter_similarity_report": "chapter_similarity_report.json",
        "reader_value_scorecard": "reader_value_scorecard.md",
        "content_quality_metrics": "content_quality_metrics.json",
    }
    if result.status != "pass":
        updates["content_rewrite_requests"] = "rewrite_requests.md"
    for key, value in updates.items():
        if re.search(rf"^{re.escape(key)}:", text, flags=re.M):
            text = re.sub(rf"^{re.escape(key)}:.*$", f"{key}: {value}", text, flags=re.M)
        else:
            text = text.replace("---\n", f"---\n{key}: {value}\n", 1)
    path.write_text(text, encoding="utf-8")


def write_reports(book_dir: Path, chapters: list[ChapterText], result: QualityResult, audit: dict[str, Any] | None, verdict: dict[str, Any] | None) -> None:
    v3_report: V3Report = analyze_v3(chapters)
    epub_name = read_meta(book_dir).get("epub", "")
    epub_path = book_dir / epub_name if epub_name else next(iter(sorted(book_dir.glob("*.epub"))), None)
    pairwise = (audit or {}).get("pairwise", [])
    (book_dir / "chapter_similarity_report.json").write_text(
        json.dumps({"pairs": pairwise, "max_shingle_jaccard": result.max_similarity, "audit_status": result.audit_status}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    metrics = {
        "status": result.status,
        "score": result.score,
        "body_chars": result.body_chars,
        "book_type": result.book_type,
        "recommended_chars": {"min": result.recommended_min_chars, "max": result.recommended_max_chars},
        "length_status": result.length_status,
        "chapter_chars": {chapter.name: chapter.char_count for chapter in chapters},
        "repeated_start_ratio": round(result.repeated_start_ratio, 4),
        "audit_status": result.audit_status,
        "audit_failures": (audit or {}).get("failures", []),
        "reviewer_status": result.reviewer_status,
        "korean_naturalness_score": result.korean_naturalness_score,
        "reader_value_score": result.reader_value_score,
        "quality_dimensions": result.quality_dimensions,
        "reader_surface_status": result.reader_surface_status,
        "reader_surface_issues": result.reader_surface_issues,
        "failures": result.failures,
    }
    (book_dir / "content_quality_metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    repair_path = book_dir / "repair_requests.json"
    if v3_report.has_issues:
        write_repair_requests(repair_path, v3_report, current_epub_sha256(epub_path))
    elif repair_path.exists():
        repair_path.unlink()
    if result.status == "pass":
        stale = book_dir / "rewrite_requests.md"
        if stale.exists():
            stale.unlink()
    else:
        (book_dir / "rewrite_requests.md").write_text(build_rewrite_requests(chapters, result, audit, verdict), encoding="utf-8")


def main(
    book_dir: Path = typer.Option(..., exists=True, file_okay=False, dir_okay=True),
    audit_script: Path = typer.Option(DEFAULT_AUDIT_SCRIPT, help="content_quality_audit.py from the /book skill"),
    skip_audit: bool = typer.Option(False, help="Skip the structural originality audit (tests only)"),
) -> None:
    chapters, load_failures = load_chapters(book_dir)
    if not chapters:
        rprint(f"[bold red]blocked[/bold red] no chapter content found: {'; '.join(load_failures) or 'empty book dir'}")
        raise typer.Exit(code=2)
    audit = None if skip_audit else run_structural_audit(chapters, audit_script)
    verdict, reviewer_state = read_reviewer_verdict(book_dir, chapters)
    result = evaluate(chapters, audit=audit, verdict=verdict, load_failures=load_failures, book_type=read_meta(book_dir).get("book_type", "standard"))
    result.reviewer_status = reviewer_state if verdict is None else "ok"
    if verdict is not None:
        stamp_verdict_sha(book_dir, verdict, chapters)
    write_reports(book_dir, chapters, result, audit, verdict)
    update_meta(book_dir, result)
    rprint(f"[bold]{result.status}[/bold] score={result.score} chars={result.body_chars} audit={result.audit_status} reviewer={result.reviewer_status}")
    if result.failures:
        rprint(f"failures: {', '.join(result.failures)}")
    if result.status == "needs_llm_review":
        rprint("run the content-quality-final-reviewer agent to produce reviewer_verdict.json, then rerun this gate")
        raise typer.Exit(code=3)
    if result.status != "pass":
        raise typer.Exit(code=2)


if __name__ == "__main__":
    typer.run(main)
