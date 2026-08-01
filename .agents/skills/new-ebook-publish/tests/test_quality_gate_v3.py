from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import quality_gate  # noqa: E402


def clean_chapter(chapter: int) -> str:
    paragraphs: list[str] = []
    for index in range(380):
        paragraphs.append(
            f"{chapter}장 {index}번 사례는 고객 인터뷰 기록에서 문제를 찾는다. "
            f"담당자 {chapter}-{index}는 체크리스트의 판단 기준과 실행 단계를 비교하고, "
            f"측정값 {chapter * 1000 + index}를 근거로 다음 행동을 결정한다."
        )
    return "\n\n".join(paragraphs)


def malformed_chapter() -> str:
    rhetorical = "\n\n".join(
        f"왜 이 선택이 필요할까요? 중요한 점을 기억해야 합니다. 항목 {index}."
        for index in range(12)
    )
    filler = "\n\n".join("다양한 방식으로 활용할 수 있다는 점이 중요합니다." for _ in range(12))
    long_paragraph = "긴 문단은 " + "실행 맥락 없이 설명을 이어 갑니다. " * 70
    return "\n\n".join(
        (
            "표 7을 참고하면 순서를 알 수 있습니다. 그림 4에서 결과를 확인합니다.",
            "| 구분 | 내용 |\n| --- | --- |\n| A | B |",
            "-\n\n*\n\n1.",
            long_paragraph,
            rhetorical,
            filler,
        )
    )


def write_epub(book: Path, malformed: bool = False) -> Path:
    book.mkdir()
    epub = book / "book.epub"
    with zipfile.ZipFile(epub, "w") as archive:
        for chapter in range(1, 6):
            body = clean_chapter(chapter)
            if malformed and chapter == 1:
                body = f"{body}\n\n{malformed_chapter()}"
            html = f"<html><body><h1>{chapter}장</h1><p>{body}</p></body></html>"
            archive.writestr(f"EPUB/chapter{chapter}.xhtml", html)
    (book / "_meta.md").write_text("---\ntitle: 테스트\nepub: book.epub\n---\n", encoding="utf-8")
    (book / "reviewer_verdict.json").write_text(
        json.dumps(
            {"korean_naturalness_score": 90, "reader_value_score": 92, "verdict": "pass"},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return epub


def read_repair_hash(path: Path) -> str:
    match = re.search(r'"epub_sha256": "([0-9a-f]{64})"', path.read_text(encoding="utf-8"))
    assert match is not None
    return match.group(1)


def test_v3_detects_structured_content_and_format_defects() -> None:
    # Given
    chapters = [quality_gate.ChapterText(name="chapter1.md", text=malformed_chapter())]

    # When
    report = quality_gate.analyze_v3(chapters)

    # Then
    content_codes = {issue.code for issue in report.content}
    format_codes = {issue.code for issue in report.format}
    assert content_codes == {
        "missing_image_reference",
        "missing_table_reference",
        "low_information_density",
        "repeated_rhetorical_structure",
    }
    assert format_codes == {"empty_list_artifact", "long_paragraph", "markdown_table_leakage"}


def test_v3_clean_content_has_no_new_failures() -> None:
    # Given
    chapters = [quality_gate.ChapterText(name="chapter1.md", text=clean_chapter(1))]

    # When
    report = quality_gate.analyze_v3(chapters)

    # Then
    assert report.content == ()
    assert report.format == ()


def test_v3_preserves_empty_html_list_items_for_detection() -> None:
    # Given
    html = b"<html><body><ul><li></li></ul></body></html>"

    # When
    text = quality_gate.extract_html_text(html)
    report = quality_gate.analyze_v3([quality_gate.ChapterText(name="chapter.xhtml", text=text)])

    # Then
    assert {issue.code for issue in report.format} == {"empty_list_artifact"}


def test_v3_writes_grouped_repairs_bound_to_current_epub(tmp_path: Path) -> None:
    # Given
    book = tmp_path / "malformed"
    epub = write_epub(book, malformed=True)
    (book / "aaa-old.epub").write_bytes(b"stale")
    chapters, failures = quality_gate.load_chapters(book)
    result = quality_gate.evaluate(chapters, audit={"status": "pass", "pairwise": [], "failures": []}, verdict={"korean_naturalness_score": 90, "reader_value_score": 92, "verdict": "pass"}, load_failures=failures)

    # When
    quality_gate.write_reports(book, chapters, result, {"status": "pass", "pairwise": [], "failures": []}, None)

    # Then
    repair_text = (book / "repair_requests.json").read_text(encoding="utf-8")
    assert '"gate_version": 3' in repair_text
    assert read_repair_hash(book / "repair_requests.json") == hashlib.sha256(epub.read_bytes()).hexdigest()
    assert '"content": [' in repair_text
    assert '"format": [' in repair_text
    assert result.status == "blocked_content_quality_v3"


def test_v3_rewrites_stale_repair_hash_after_epub_changes(tmp_path: Path) -> None:
    # Given
    book = tmp_path / "changed"
    epub = write_epub(book, malformed=True)
    chapters, failures = quality_gate.load_chapters(book)
    audit = {"status": "pass", "pairwise": [], "failures": []}
    verdict = {"korean_naturalness_score": 90, "reader_value_score": 92, "verdict": "pass"}
    first = quality_gate.evaluate(chapters, audit=audit, verdict=verdict, load_failures=failures)
    quality_gate.write_reports(book, chapters, first, audit, None)
    stale_hash = read_repair_hash(book / "repair_requests.json")

    # When
    with zipfile.ZipFile(epub, "a") as archive:
        archive.writestr("EPUB/change.txt", "changed")
    quality_gate.write_reports(book, chapters, first, audit, None)

    # Then
    current_hash = read_repair_hash(book / "repair_requests.json")
    assert current_hash != stale_hash
    assert current_hash == hashlib.sha256(epub.read_bytes()).hexdigest()


@pytest.mark.parametrize("malformed, expected_exit", [(False, 0), (True, 2)])
def test_v3_cli_preserves_exit_contract(tmp_path: Path, malformed: bool, expected_exit: int) -> None:
    # Given
    book = tmp_path / ("bad" if malformed else "clean")
    write_epub(book, malformed=malformed)

    # When
    process = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts" / "quality_gate.py"),
            "--book-dir",
            str(book),
            "--skip-audit",
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    # Then
    assert process.returncode == expected_exit, process.stdout + process.stderr
