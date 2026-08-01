#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "typer",
#     "rich",
#     "pillow",
# ]
# ///

# ─── How to run ───
#   uv run cover_finalize.py --book-dir "/path/to/book" --candidate "/path/to/generated.png"
# 생성된 표지 후보(어떤 크기/포맷이든)를 cover_spec 규격(1500x2220 JPEG ≤7MB)으로
# 변환해 cover.jpg로 설치하고 _meta.md를 갱신한다. 기존 표지는 백업.
# 설치 후 cover_meta_match_status는 'pending'으로 리셋 — 판독 검증(SKILL 단계 7)을
# 다시 통과해야 ISBN 단계가 열린다.
# ──────────────────

from __future__ import annotations

import datetime as dt
import re
from pathlib import Path
from typing import Final

import typer
from PIL import Image
from rich import print as rprint

TARGET_W: Final = 1500
TARGET_H: Final = 2220
MAX_BYTES: Final = 7 * 1024 * 1024


def fit_cover(img: Image.Image) -> Image.Image:
    """비율 유지 리사이즈 후 중앙 크롭으로 1500x2220 채움."""
    img = img.convert("RGB")
    scale = max(TARGET_W / img.width, TARGET_H / img.height)
    resized = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    left = (resized.width - TARGET_W) // 2
    top = (resized.height - TARGET_H) // 2
    return resized.crop((left, top, left + TARGET_W, top + TARGET_H))


def update_meta(book_dir: Path, updates: dict[str, str]) -> None:
    path = book_dir / "_meta.md"
    if not path.exists():
        raise typer.Exit(code=2)
    text = path.read_text(encoding="utf-8")
    for key, value in updates.items():
        if re.search(rf"^{re.escape(key)}:", text, flags=re.M):
            text = re.sub(rf"^{re.escape(key)}:.*$", f"{key}: {value}", text, flags=re.M)
        else:
            text = text.replace("---\n", f"---\n{key}: {value}\n", 1)
    path.write_text(text, encoding="utf-8")


def main(
    book_dir: Path = typer.Option(..., exists=True, file_okay=False, dir_okay=True),
    candidate: Path = typer.Option(..., exists=True, dir_okay=False, help="생성된 표지 후보 이미지 (png/jpg 등)"),
    generator: str = typer.Option("codex-native", help="생성 주체 기록 (codex-native / claude-pil / gpt-image 등)"),
) -> None:
    try:
        img = Image.open(candidate)
        img.load()
    except Exception as exc:  # noqa: BLE001
        rprint(f"[bold red]후보 이미지를 열 수 없음: {exc}[/bold red]")
        raise typer.Exit(code=2) from exc

    final = fit_cover(img)
    cover_path = book_dir / "cover.jpg"
    if cover_path.exists():
        backup = book_dir / f"cover_구버전_{dt.date.today().strftime('%Y%m%d')}.jpg"
        if not backup.exists():
            cover_path.rename(backup)
            rprint(f"기존 표지 백업: {backup.name}")

    quality = 92
    final.save(cover_path, "JPEG", quality=quality)
    while cover_path.stat().st_size > MAX_BYTES and quality > 60:
        quality -= 8
        final.save(cover_path, "JPEG", quality=quality)

    update_meta(book_dir, {
        "cover": "cover.jpg",
        "cover_format": "jpg",
        "cover_width": str(TARGET_W),
        "cover_height": str(TARGET_H),
        "cover_spec_status": "pass",
        "cover_generator": generator,
        "cover_generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        # 새 표지는 반드시 판독 재검증을 거쳐야 ISBN 단계가 열림
        "cover_meta_match_status": "pending",
    })
    rprint(f"[bold green]cover.jpg 설치 완료[/bold green] {TARGET_W}x{TARGET_H} q{quality} ({cover_path.stat().st_size // 1024}KB)")
    rprint("다음 단계: ①표지 판독 → 서지 대조 → cover_meta_match_status 기록 ②EPUB 재빌드 ③ledger record")


if __name__ == "__main__":
    typer.run(main)
