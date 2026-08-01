from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import cover_metaphor_ledger
import epub_publish_readiness
import quality_gate

PASSING_VERDICT = {
    "promise_resolution_score": 92,
    "new_information_score": 90,
    "source_accuracy_score": 95,
    "actionability_score": 92,
    "korean_naturalness_score": 88,
    "differentiation_score": 90,
    "reader_value_score": 91,
    "blocking_issues": [],
    "verdict": "pass",
}
PASSING_AUDIT = {"status": "pass", "pairwise": [], "failures": []}


def write_book(path: Path, chapters: list[str]) -> None:
    path.mkdir()
    (path / "_meta.md").write_text("---\ntitle: 테스트\nepub: ''\n---\n", encoding="utf-8")
    for index, text in enumerate(chapters, start=1):
        (path / f"chapter{index}.md").write_text(f"# {index}장\n{text}", encoding="utf-8")


def chapter_text(chapter: int) -> str:
    chapter_terms = {
        1: ("문제정의", "고객 인터뷰", "초안 보드"),
        2: ("자료정리", "근거 표", "파일 묶음"),
        3: ("검수기준", "오류 목록", "승인 체크"),
        4: ("업무적용", "실행 로그", "회의 기록"),
        5: ("운영확장", "월간 점검", "개선 노트"),
    }
    term_a, term_b, term_c = chapter_terms[chapter]
    lines: list[str] = []
    openers = ("첫 단계로", "다음 장면에서", "현장에서는", "검수자는", "운영자는", "마지막으로")
    for index in range(360):
        opener = openers[index % len(openers)]
        lines.append(
            f"{term_a} {index}번 장면은 {term_b}에서 출발한다. "
            f"{opener} {index}번 {term_c}를 만들고 체크리스트, 실행 단계, 판단 기준을 순서대로 채운다. "
            f"{term_b} 사례 {chapter}-{index}에서는 예시와 템플릿을 나누어 쓰며 결과를 다음 행동으로 연결한다."
        )
    return "\n".join(lines)


def load(book: Path) -> list[quality_gate.ChapterText]:
    chapters, failures = quality_gate.load_chapters(book)
    assert not failures
    return chapters


def test_quality_gate_warns_but_does_not_block_short_book() -> None:
    chapters = [quality_gate.ChapterText(name="chapter1.md", text=chapter_text(1)[:35_000])]
    result = quality_gate.evaluate(chapters, audit=PASSING_AUDIT, verdict=PASSING_VERDICT, book_type="quick")
    assert result.status == "pass"
    assert result.length_status == "warning_under_target"
    assert "blocked_under_minimum_length" not in result.failures


def test_quality_gate_requires_llm_review(tmp_path: Path) -> None:
    book = tmp_path / "long"
    write_book(book, [chapter_text(index) for index in range(1, 6)])
    result = quality_gate.evaluate(load(book), audit=PASSING_AUDIT)
    assert result.status == "needs_llm_review"
    assert result.body_chars >= 120_000


def test_quality_gate_passes_with_reviewer_verdict(tmp_path: Path) -> None:
    book = tmp_path / "long"
    write_book(book, [chapter_text(index) for index in range(1, 6)])
    result = quality_gate.evaluate(load(book), audit=PASSING_AUDIT, verdict=PASSING_VERDICT)
    assert result.status == "pass"
    assert result.failures == []


def test_quality_gate_uses_weighted_reader_value_contract(tmp_path: Path) -> None:
    book = tmp_path / "long"
    write_book(book, [chapter_text(index) for index in range(1, 6)])
    verdict = {**PASSING_VERDICT, "actionability_score": 40, "verdict": "fail"}
    result = quality_gate.evaluate(load(book), audit=PASSING_AUDIT, verdict=verdict)
    assert result.status == "blocked_reader_value"
    assert result.reader_value_score < 85


def test_quality_gate_blocks_explicit_content_contract_issue(tmp_path: Path) -> None:
    book = tmp_path / "long"
    write_book(book, [chapter_text(index) for index in range(1, 6)])
    verdict = {**PASSING_VERDICT, "blocking_issues": ["missing_promised_asset"], "verdict": "fail"}
    result = quality_gate.evaluate(load(book), audit=PASSING_AUDIT, verdict=verdict)
    assert result.status == "blocked_content_contract"


def test_quality_gate_blocks_on_failed_audit(tmp_path: Path) -> None:
    book = tmp_path / "long"
    write_book(book, [chapter_text(index) for index in range(1, 6)])
    failed_audit = {
        "status": "fail",
        "failures": ["chapter01.md vs chapter02.md sentence_shingle_jaccard=0.5 > 0.08"],
        "pairwise": [{"left": "chapter01.md", "right": "chapter02.md", "sentence_shingle_jaccard": 0.5, "shared_sentences": 30}],
        "repeated_across_chapters": [{"chapter_count": 5, "chapters": [], "sentence": "모든 장에 반복되는 문장"}],
        "boilerplate_hits": [],
    }
    chapters = load(book)
    result = quality_gate.evaluate(chapters, audit=failed_audit, verdict=PASSING_VERDICT)
    assert result.status == "blocked_similarity"
    requests = quality_gate.build_rewrite_requests(chapters, result, failed_audit, PASSING_VERDICT)
    assert "chapter01.md" in requests
    assert "모든 장에 반복되는 문장" in requests


def test_quality_gate_blocks_low_reviewer_scores(tmp_path: Path) -> None:
    book = tmp_path / "long"
    write_book(book, [chapter_text(index) for index in range(1, 6)])
    verdict = {"korean_naturalness_score": 70, "reader_value_score": 80, "verdict": "fail"}
    result = quality_gate.evaluate(load(book), audit=PASSING_AUDIT, verdict=verdict)
    assert result.status == "blocked_korean_quality"
    assert "blocked_reader_value" in result.failures


def test_fail_verdict_blocks_even_with_passing_scores(tmp_path: Path) -> None:
    book = tmp_path / "long"
    write_book(book, [chapter_text(index) for index in range(1, 6)])
    verdict = {"korean_naturalness_score": 90, "reader_value_score": 90, "verdict": "fail"}
    result = quality_gate.evaluate(load(book), audit=PASSING_AUDIT, verdict=verdict)
    assert result.status == "blocked_reviewer_verdict"
    assert result.korean_naturalness_status == "pass"


def test_declared_epub_must_exist(tmp_path: Path) -> None:
    book = tmp_path / "missing-epub"
    book.mkdir()
    (book / "_meta.md").write_text("---\ntitle: 테스트\nepub: ghost.epub\n---\n", encoding="utf-8")
    chapters, failures = quality_gate.load_chapters(book)
    assert not chapters
    assert any(f.startswith("blocked_missing_epub") for f in failures)


def test_cover_ledger_marks_duplicate_risk_on_partial_match(tmp_path: Path) -> None:
    entries = [
        cover_metaphor_ledger.LedgerEntry(
            "A", "topic", "route map", "route map with three checkpoints", "forest, sky blue, white", "map line through open space", "now"
        )
    ]
    concept = cover_metaphor_ledger.CoverConcept(
        "route map journey", "route map with four checkpoints", "forest, sky blue, cream", "map line across cover"
    )
    assert cover_metaphor_ledger.collision_score(concept, entries) > 0


def test_palette_only_overlap_is_not_duplicate() -> None:
    entries = [
        cover_metaphor_ledger.LedgerEntry("A", "t", "folded checklist", "folded paper checklist", "ivory, navy, signal red", "centered", "now")
    ]
    concept = cover_metaphor_ledger.CoverConcept("workflow pipeline", "linked cards on conveyor", "ivory, navy, red", "title top")
    assert not cover_metaphor_ledger.is_duplicate(concept, entries)
    same_metaphor = cover_metaphor_ledger.CoverConcept("folded checklist", "different object", "green, gold", "left block")
    assert cover_metaphor_ledger.is_duplicate(same_metaphor, entries)


def test_cover_ledger_rejects_banned_families() -> None:
    concept = cover_metaphor_ledger.CoverConcept("node graph", "glowing node graph", "blue, purple", "center")
    assert cover_metaphor_ledger.collision_score(concept, []) >= 10


def test_suggest_reserves_and_avoids_collision(tmp_path: Path, monkeypatch) -> None:
    ledger = tmp_path / "ledger.json"
    first = cover_metaphor_ledger.suggest_concept([], "책 하나", "자동화")
    entry = cover_metaphor_ledger.LedgerEntry("책 하나", "자동화", first.metaphor, first.element, first.palette, first.layout, "now", status="reserved")
    cover_metaphor_ledger.write_entries(ledger, [entry])
    second = cover_metaphor_ledger.suggest_concept(cover_metaphor_ledger.read_entries(ledger), "책 둘", "자동화")
    assert second.metaphor != first.metaphor


def has_human_review_failure(failures: list[str]) -> bool:
    return any("human_review" in failure for failure in failures)


def test_human_review_gate_blocks_missing_pending_rejected() -> None:
    for status in ("", "pending", "rejected"):
        failures = epub_publish_readiness.check_human_review({"human_review_status": status})
        assert has_human_review_failure(failures), f"status={status!r}는 차단되어야 함"


def test_human_review_gate_requires_date_on_approval() -> None:
    assert has_human_review_failure(epub_publish_readiness.check_human_review({"human_review_status": "approved"}))
    assert epub_publish_readiness.check_human_review(
        {"human_review_status": "approved", "human_review_date": "2026-07-05"}
    ) == []


def test_isbn_stage_hard_fails_without_human_approval(tmp_path: Path) -> None:
    failures = epub_publish_readiness.check_isbn(tmp_path, {"human_review_status": "pending"})
    assert has_human_review_failure(failures)


def test_distribution_stage_hard_fails_without_human_approval(tmp_path: Path) -> None:
    failures = epub_publish_readiness.check_distribution(tmp_path, {"human_review_status": "rejected"})
    assert has_human_review_failure(failures)


def test_stages_pass_human_review_gate_when_approved(tmp_path: Path) -> None:
    fm = {"human_review_status": "approved", "human_review_date": "2026-07-05"}
    assert not has_human_review_failure(epub_publish_readiness.check_isbn(tmp_path, fm))
    assert not has_human_review_failure(epub_publish_readiness.check_distribution(tmp_path, fm))
