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
#      uv run cover_metaphor_ledger.py suggest --title "책 제목" --topic "주제"
#    suggest reserves the concept immediately (race-safe for parallel book
#    threads). Confirm it after cover acceptance:
#      uv run cover_metaphor_ledger.py record --title "책 제목" --metaphor ... --element ... --palette ... --layout ...
# ──────────────────

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Final

import typer
from rich import print as rprint

SKILL_DIR: Final = Path(__file__).resolve().parents[1]
DEFAULT_LEDGER: Final = SKILL_DIR / "references" / "cover_metaphor_ledger.json"
RECENT_WINDOW: Final = 20
# (metaphor, element, palette, layout)
METAPHORS: Final = (
    ("folded checklist", "folded paper checklist", "crisp white, black, signal red", "centered object with wide margin"),
    ("modular blocks", "stacked colored blocks", "deep green, ivory, orange", "bottom-weighted editorial grid"),
    ("marked calendar", "desk calendar with one marked day", "charcoal, warm yellow, cyan", "large title top, object lower third"),
    ("switch panel", "single toggle switch panel", "navy, white, lime", "left title block, right object"),
    ("bridge diagram", "minimal bridge line drawing", "teal, black, pale gray", "horizontal axis layout"),
    ("sealed document", "document with simple shield seal", "crimson, cream, graphite", "premium centered typography"),
    ("tool tray", "organized desktop tool tray", "royal blue, white, orange", "object-led flat lay"),
    ("window stack", "overlapping clean app windows", "purple, mint, black", "diagonal layered composition"),
    ("route map", "route map with three checkpoints", "forest, sky blue, white", "map line through open space"),
    ("signal meter", "simple analog signal meter", "black, yellow, red", "bold object below title"),
    ("compass rose", "hand-drawn compass on grid paper", "burnt orange, slate, cream", "corner-anchored object with title band"),
    ("key and lock", "oversized flat key beside keyhole", "mustard, charcoal, white", "split-screen vertical halves"),
    ("growth ring", "tree growth rings cross-section", "walnut brown, sage, ivory", "full-bleed texture with title plate"),
    ("paper boat", "folded paper boat on flat waves", "cobalt, white, coral", "horizon line lower third"),
    ("hourglass", "minimal hourglass with sand bands", "terracotta, sand, deep teal", "tall centered object, title split"),
    ("ladder of drawers", "open filing drawers ascending", "olive, cream, brick red", "stepped diagonal composition"),
    ("magnifier on page", "magnifying glass over document lines", "ink blue, paper white, amber", "close-up object with generous whitespace"),
    ("speech bubbles", "two interlocking speech bubbles", "coral, cream, midnight", "overlapping shapes center field"),
    ("scale balance", "two-pan balance scale", "graphite, gold, off-white", "symmetric composition, title above"),
    ("puzzle corner", "two joining puzzle pieces", "emerald, blush, charcoal", "corner join with diagonal title"),
    ("lighthouse beam", "small lighthouse with light cone", "night navy, beam yellow, white", "beam crossing title area"),
    ("seedling pot", "single seedling in numbered pot", "leaf green, clay, cream", "small object, oversized typography"),
    ("gear pair", "two meshing flat gears", "steel blue, rust, ivory", "mechanical detail upper half"),
    ("open book path", "open book with road emerging", "plum, gold, cream", "surreal object centered"),
)
# Concept families the skill forbids repeating (recently overused shelf looks).
BANNED_FAMILIES: Final = (
    "node graph",
    "network graph",
    "cursor block",
    "document stack",
    "stairs",
    "ladder climb",
    "ai brain",
    "brain circuit",
    "blue-purple network",
    "beige minimalist",
    "ivory minimalist field",
)
# Topic keyword → preferred metaphors (small nudge so covers relate to content).
TOPIC_AFFINITY: Final = {
    "자동화": ("switch panel", "gear pair", "tool tray"),
    "루틴": ("marked calendar", "hourglass", "growth ring"),
    "시간": ("marked calendar", "hourglass"),
    "투자": ("signal meter", "scale balance", "growth ring"),
    "재테크": ("signal meter", "scale balance"),
    "창업": ("seedling pot", "paper boat", "route map"),
    "부업": ("seedling pot", "tool tray"),
    "마케팅": ("speech bubbles", "lighthouse beam"),
    "브랜딩": ("lighthouse beam", "speech bubbles"),
    "글쓰기": ("magnifier on page", "open book path", "folded checklist"),
    "교육": ("open book path", "seedling pot", "route map"),
    "학습": ("open book path", "route map"),
    "검수": ("magnifier on page", "sealed document"),
    "보안": ("key and lock", "sealed document"),
    "계약": ("sealed document", "scale balance"),
    "협업": ("puzzle corner", "speech bubbles", "bridge diagram"),
    "에이전트": ("gear pair", "window stack", "modular blocks"),
    "프롬프트": ("folded checklist", "window stack"),
    "데이터": ("signal meter", "modular blocks"),
}


@dataclass(frozen=True, slots=True)
class CoverConcept:
    metaphor: str
    element: str
    palette: str
    layout: str


@dataclass(frozen=True, slots=True)
class LedgerEntry:
    title: str
    topic: str
    metaphor: str
    element: str
    palette: str
    layout: str
    recorded_at: str
    status: str = "recorded"


def tokens(value: str) -> set[str]:
    return set(re.findall(r"[가-힣a-z0-9]+", value.lower()))


def token_overlap(left: str, right: str) -> float:
    left_tokens, right_tokens = tokens(left), tokens(right)
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / min(len(left_tokens), len(right_tokens))


def read_entries(path: Path) -> list[LedgerEntry]:
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload.get("entries", [])
    entries: list[LedgerEntry] = []
    for row in rows:
        if isinstance(row, dict):
            entries.append(LedgerEntry(
                *(str(row.get(key, "")) for key in ("title", "topic", "metaphor", "element", "palette", "layout", "recorded_at")),
                status=str(row.get("status", "recorded")),
            ))
    return entries


def write_entries(path: Path, entries: list[LedgerEntry]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"entries": [asdict(entry) for entry in entries]}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def candidate_pool() -> list[CoverConcept]:
    return [CoverConcept(*item) for item in METAPHORS]


def collision_score(concept: CoverConcept, recent: list[LedgerEntry]) -> int:
    """Partial-match collision: token overlap catches 'purple network' vs
    'blue-purple network', not just exact-normalized equality."""
    score = 0
    for entry in recent:
        if token_overlap(concept.metaphor, entry.metaphor) >= 0.6:
            score += 4
        if token_overlap(concept.element, entry.element) >= 0.6:
            score += 3
        if len(tokens(concept.palette) & tokens(entry.palette)) >= 2:
            score += 2
        if token_overlap(concept.layout, entry.layout) >= 0.6:
            score += 1
    for family in BANNED_FAMILIES:
        if token_overlap(concept.metaphor, family) >= 0.6 or token_overlap(concept.element, family) >= 0.6:
            score += 10
    return score


def is_duplicate(concept: CoverConcept, recent: list[LedgerEntry]) -> bool:
    """A cover is a duplicate only when its identity (metaphor/element) repeats
    or a banned family is hit. Palette/layout-only overlaps merely raise the
    ranking cost in suggest() — many covers legitimately share tones."""
    for family in BANNED_FAMILIES:
        if token_overlap(concept.metaphor, family) >= 0.6 or token_overlap(concept.element, family) >= 0.6:
            return True
    for entry in recent:
        if token_overlap(concept.metaphor, entry.metaphor) >= 0.6 or token_overlap(concept.element, entry.element) >= 0.6:
            return True
    return False


def affinity_bonus(concept: CoverConcept, title: str, topic: str) -> int:
    text = f"{title} {topic}"
    bonus = 0
    for keyword, metaphors in TOPIC_AFFINITY.items():
        if keyword in text and concept.metaphor in metaphors:
            bonus += 2
    return bonus


def suggest_concept(entries: list[LedgerEntry], title: str, topic: str) -> CoverConcept:
    recent = entries[-RECENT_WINDOW:]
    seed = sum(ord(ch) for ch in f"{title}{topic}")
    pool = candidate_pool()
    ranked = sorted(
        pool,
        key=lambda item: (
            collision_score(item, recent) - affinity_bonus(item, title, topic),
            (pool.index(item) + seed) % len(pool),
        ),
    )
    return ranked[0]


def update_meta(book_dir: Path, entry: LedgerEntry, status: str) -> None:
    meta = book_dir / "_meta.md"
    if not meta.exists():
        return
    text = meta.read_text(encoding="utf-8")
    updates = {
        "cover_metaphor": entry.metaphor,
        "cover_main_element": entry.element,
        "cover_palette": entry.palette,
        "cover_layout": entry.layout,
        "cover_metaphor_status": status,
    }
    for key, value in updates.items():
        if re.search(rf"^{re.escape(key)}:", text, flags=re.M):
            text = re.sub(rf"^{re.escape(key)}:.*$", f"{key}: {value}", text, flags=re.M)
        else:
            text = text.replace("---\n", f"---\n{key}: {value}\n", 1)
    meta.write_text(text, encoding="utf-8")


app = typer.Typer()


@app.command()
def suggest(
    title: str = typer.Option(...),
    topic: str = "",
    ledger: Path = DEFAULT_LEDGER,
    reserve: bool = typer.Option(True, help="Immediately reserve the concept so parallel book threads never receive the same suggestion"),
) -> None:
    entries = read_entries(ledger)
    concept = suggest_concept(entries, title, topic)
    if reserve:
        stamped = LedgerEntry(title, topic, concept.metaphor, concept.element, concept.palette, concept.layout, datetime.now().isoformat(timespec="seconds"), status="reserved")
        write_entries(ledger, [*entries, stamped])
    rprint(json.dumps(asdict(concept), ensure_ascii=False, indent=2))


@app.command()
def record(
    title: str = typer.Option(...),
    metaphor: str = typer.Option(...),
    element: str = typer.Option(...),
    palette: str = typer.Option(...),
    layout: str = typer.Option(...),
    topic: str = "",
    book_dir: Path | None = None,
    ledger: Path = DEFAULT_LEDGER,
) -> None:
    entries = read_entries(ledger)
    # Replace this title's reservation (if any) with the confirmed record so
    # reservations don't double-count in collision checks.
    others = [entry for entry in entries if not (entry.title == title and entry.status == "reserved")]
    entry = LedgerEntry(title, topic, metaphor, element, palette, layout, datetime.now().isoformat(timespec="seconds"), status="recorded")
    status = "duplicate_risk" if is_duplicate(CoverConcept(metaphor, element, palette, layout), others[-RECENT_WINDOW:]) else "pass"
    write_entries(ledger, [*others, entry])
    if book_dir:
        update_meta(book_dir, entry, status)
    rprint(f"{status}: {metaphor} / {element} / {palette} / {layout}")


@app.command()
def release(title: str = typer.Option(...), ledger: Path = DEFAULT_LEDGER) -> None:
    """Drop a reservation for a book whose cover work was cancelled."""
    entries = read_entries(ledger)
    kept = [entry for entry in entries if not (entry.title == title and entry.status == "reserved")]
    write_entries(ledger, kept)
    rprint(f"released {len(entries) - len(kept)} reservation(s) for {title}")


if __name__ == "__main__":
    app()
