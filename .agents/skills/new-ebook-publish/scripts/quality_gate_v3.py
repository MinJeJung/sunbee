from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal, Protocol, TypedDict

IssueGroup = Literal["content", "format"]

LONG_PARAGRAPH_CHARS: Final = 1_000
MIN_PATTERN_REPETITIONS: Final = 6
MARKDOWN_TABLE_RE: Final = re.compile(r"(?m)^\s*\|[^\n|]+\|[^\n]+\|\s*$")
EMPTY_LIST_RE: Final = re.compile(r"(?m)^[ \t]*(?:[-*+]|\d+[.)])[ \t]*$")
REFERENCE_RE: Final = re.compile(r"(표|그림|이미지)\s*(\d+)\s*(?:을|를|에서|의|로|처럼|참고|참조)")
DEFINITION_RE: Final = re.compile(r"(?m)^\s*(표|그림|이미지)\s*(\d+)\s*[:.\-]")
ACTION_MARKERS: Final = ("단계", "기준", "사례", "예시", "수치", "체크리스트", "실행", "측정")
FILLER_MARKERS: Final = (
    "중요하다는 점",
    "중요한 점을 기억",
    "다양한 방식으로 활용",
    "도움이 될 수 있습니다",
    "살펴볼 필요가 있습니다",
    "기억해야 합니다",
)
RHETORICAL_PATTERNS: Final = (
    ("why_question", re.compile(r"^왜\s+[^?？]{2,80}(?:일까요|할까요|필요할까요)[?？]")),
    ("how_question", re.compile(r"^어떻게\s+[^?？]{2,80}(?:할 수 있을까요|해야 할까요)[?？]")),
    ("what_question", re.compile(r"^무엇(?:이|을)\s+[^?？]{2,80}(?:일까요|할까요)[?？]")),
    ("then_question", re.compile(r"^그렇다면\s+[^?？]{2,80}(?:일까요|할까요|해야 할까요)[?？]")),
)


class ChapterView(Protocol):
    name: str
    text: str


class IssuePayload(TypedDict):
    code: str
    chapter: str
    count: int
    excerpt: str
    repair: str


class RepairPayload(TypedDict):
    gate_version: int
    epub_sha256: str | None
    content: list[IssuePayload]
    format: list[IssuePayload]


@dataclass(frozen=True, slots=True)
class RepairIssue:
    code: str
    chapter: str
    count: int
    excerpt: str
    repair: str

    def to_payload(self) -> IssuePayload:
        return {
            "code": self.code,
            "chapter": self.chapter,
            "count": self.count,
            "excerpt": self.excerpt,
            "repair": self.repair,
        }


@dataclass(frozen=True, slots=True)
class V3Report:
    content: tuple[RepairIssue, ...] = ()
    format: tuple[RepairIssue, ...] = ()

    @property
    def has_issues(self) -> bool:
        return bool(self.content or self.format)


def _excerpt(text: str, limit: int = 180) -> str:
    flat = re.sub(r"\s+", " ", text).strip()
    return flat if len(flat) <= limit else f"{flat[: limit - 1]}…"


def _paragraphs(text: str) -> list[str]:
    return [paragraph.strip() for paragraph in text.splitlines() if paragraph.strip()]


def _reference_issues(chapters: Sequence[ChapterView]) -> list[RepairIssue]:
    all_text = "\n".join(chapter.text for chapter in chapters)
    definitions = {(match.group(1), match.group(2)) for match in DEFINITION_RE.finditer(all_text)}
    issues: list[RepairIssue] = []
    for chapter in chapters:
        missing = {(match.group(1), match.group(2)) for match in REFERENCE_RE.finditer(chapter.text)} - definitions
        for kind, number in sorted(missing):
            code = "missing_table_reference" if kind == "표" else "missing_image_reference"
            issues.append(
                RepairIssue(
                    code=code,
                    chapter=chapter.name,
                    count=1,
                    excerpt=f"{kind} {number}",
                    repair=f"{kind} {number}의 캡션과 실제 자산을 추가하거나 본문 참조를 제거할 것.",
                )
            )
    return issues


def _rhetorical_issue(chapter: ChapterView, paragraphs: list[str]) -> RepairIssue | None:
    signatures: list[str] = []
    for paragraph in paragraphs:
        for signature, pattern in RHETORICAL_PATTERNS:
            if pattern.search(paragraph):
                signatures.append(signature)
                break
    count = max((signatures.count(signature) for signature, _ in RHETORICAL_PATTERNS), default=0)
    if count < MIN_PATTERN_REPETITIONS:
        return None
    return RepairIssue(
        code="repeated_rhetorical_structure",
        chapter=chapter.name,
        count=count,
        excerpt="같은 수사 질문으로 시작하는 문단이 반복됨",
        repair="반복 질문을 삭제하고 사례, 반론, 절차 등 서로 다른 문단 구조로 재작성할 것.",
    )


def _density_issue(chapter: ChapterView, paragraphs: list[str]) -> RepairIssue | None:
    filler = [
        paragraph
        for paragraph in paragraphs
        if any(marker in paragraph for marker in FILLER_MARKERS)
        and not re.search(r"\d", paragraph)
        and not any(marker in paragraph for marker in ACTION_MARKERS)
    ]
    if len(filler) < MIN_PATTERN_REPETITIONS:
        return None
    return RepairIssue(
        code="low_information_density",
        chapter=chapter.name,
        count=len(filler),
        excerpt=_excerpt(filler[0]),
        repair="상투적 설명을 수치, 조건, 사례, 판단 기준 또는 실행 단계로 교체할 것.",
    )


def _format_issues(chapter: ChapterView, paragraphs: list[str]) -> list[RepairIssue]:
    issues: list[RepairIssue] = []
    table_matches = list(MARKDOWN_TABLE_RE.finditer(chapter.text))
    if table_matches:
        issues.append(RepairIssue("markdown_table_leakage", chapter.name, len(table_matches), _excerpt(table_matches[0].group(0)), "파이프 표를 EPUB 표 또는 읽기 쉬운 목록과 문장으로 변환할 것."))
    empty_matches = []
    lines = chapter.text.splitlines()
    offsets: list[int] = []
    cursor = 0
    for line in lines:
        offsets.append(cursor)
        cursor += len(line) + 1
    for match in EMPTY_LIST_RE.finditer(chapter.text):
        line_index = max(0, chapter.text[: match.start()].count("\n"))
        previous = next((lines[i].strip() for i in range(line_index - 1, -1, -1) if lines[i].strip()), "")
        following = next((lines[i].strip() for i in range(line_index + 1, len(lines)) if lines[i].strip()), "")
        token = match.group(0).strip()
        if token == "-" and following and (previous.endswith(":") or not re.match(r"^(?:[-*+]|\d+[.)])\s", following)):
            continue
        if token[:-1].isdigit():
            continue
        empty_matches.append(match)
    if empty_matches:
        issues.append(RepairIssue("empty_list_artifact", chapter.name, len(empty_matches), _excerpt(empty_matches[0].group(0)), "내용 없는 목록 항목을 삭제하거나 완전한 항목으로 채울 것."))
    long_paragraphs = [paragraph for paragraph in paragraphs if len(re.sub(r"\s+", "", paragraph)) > LONG_PARAGRAPH_CHARS]
    if long_paragraphs:
        issues.append(RepairIssue("long_paragraph", chapter.name, len(long_paragraphs), _excerpt(long_paragraphs[0]), "문단을 하나의 주장 또는 절차 단위로 나누고 소제목을 추가할 것."))
    return issues


def analyze_v3(chapters: Sequence[ChapterView]) -> V3Report:
    content = _reference_issues(chapters)
    formatting: list[RepairIssue] = []
    for chapter in chapters:
        paragraphs = _paragraphs(chapter.text)
        rhetorical = _rhetorical_issue(chapter, paragraphs)
        density = _density_issue(chapter, paragraphs)
        if rhetorical is not None:
            content.append(rhetorical)
        if density is not None:
            content.append(density)
        formatting.extend(_format_issues(chapter, paragraphs))
    return V3Report(content=tuple(content), format=tuple(formatting))


def current_epub_sha256(epub_path: Path | None) -> str | None:
    if epub_path is None or not epub_path.exists():
        return None
    return hashlib.sha256(epub_path.read_bytes()).hexdigest()


def write_repair_requests(path: Path, report: V3Report, epub_sha256: str | None) -> None:
    payload: RepairPayload = {
        "gate_version": 3,
        "epub_sha256": epub_sha256,
        "content": [issue.to_payload() for issue in report.content],
        "format": [issue.to_payload() for issue in report.format],
    }
    _ = path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
