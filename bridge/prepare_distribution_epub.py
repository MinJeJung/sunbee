#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import zipfile
from datetime import datetime
from pathlib import Path

import yaml


VAULT_ROOT = Path("/Users/minje/Documents/Obsidian Vault")
BOOKS_ROOT = VAULT_ROOT / "3_출판 및 SNS" / "전자책원고"
DISTRIBUTION_ROOT = VAULT_ROOT / "7_AI시스템" / "자동화프로젝트" / "ebook-distribution-epub"
sys.path.insert(0, str(DISTRIBUTION_ROOT))

from build_epub import ensure_epub_cover_metadata  # noqa: E402


def parse_meta(meta_path: Path) -> tuple[dict, str]:
    source = meta_path.read_text(encoding="utf-8")
    match = re.match(r"^---\n(.*?)\n---\n(.*)$", source, re.S)
    if not match:
        raise RuntimeError(f"frontmatter 없음: {meta_path}")
    return yaml.safe_load(match.group(1)) or {}, match.group(2)


def next_revision_path(path: Path) -> Path:
    clean_stem = re.sub(r"_\[수정 \d+\]$", "", path.stem)
    revisions = []
    for candidate in path.parent.glob(f"{clean_stem}*.epub"):
        match = re.search(r"_\[수정 (\d+)\]$", candidate.stem)
        revisions.append(int(match.group(1)) if match else 0)
    return path.with_name(f"{clean_stem}_[수정 {max(revisions, default=0) + 1}].epub")


def next_meta_backup(meta_path: Path) -> Path:
    revisions = []
    for candidate in meta_path.parent.glob("_meta_[수정 *].md"):
        match = re.search(r"_\[수정 (\d+)\]$", candidate.stem)
        if match:
            revisions.append(int(match.group(1)))
    return meta_path.with_name(f"_meta_[수정 {max(revisions, default=0) + 1}].md")


def is_ridi_cover_compatible(epub_path: Path) -> bool:
    with zipfile.ZipFile(epub_path) as archive:
        names = archive.namelist()
        opf_name = next((name for name in names if name.lower().endswith(".opf")), "")
        cover_name = next((name for name in names if name.lower().endswith("cover.xhtml")), "")
        if not opf_name or not cover_name:
            return False
        opf = archive.read(opf_name).decode("utf-8")
        cover = archive.read(cover_name).decode("utf-8")
        has_legacy_meta = bool(re.search(r"<meta\b[^>]*\bname=[\"']cover[\"'][^>]*>", opf))
        has_cover_image = "cover-image" in opf
        has_simple_image = bool(re.search(r"<img\b[^>]*\bsrc=[\"'][^\"']*cover\.(?:jpg|jpeg|png)[\"']", cover, re.I))
        return has_legacy_meta and has_cover_image and has_simple_image and "<svg" not in cover.lower()


def prepare(book_dir: Path) -> dict:
    book_dir = book_dir.resolve()
    if book_dir.parent != BOOKS_ROOT.resolve():
        raise RuntimeError("전자책원고 바로 아래 도서 폴더만 처리할 수 있습니다.")
    meta_path = book_dir / "_meta.md"
    frontmatter, body = parse_meta(meta_path)
    epub_name = str(frontmatter.get("epub") or "").strip()
    epub_path = (book_dir / epub_name).resolve()
    if not epub_name or epub_path.parent != book_dir or not epub_path.is_file():
        raise RuntimeError("_meta.md의 EPUB 파일을 찾을 수 없습니다.")

    if is_ridi_cover_compatible(epub_path):
        return {"status": "ready", "epub": str(epub_path), "changed": False}

    target = next_revision_path(epub_path)
    shutil.copy2(epub_path, target)
    ensure_epub_cover_metadata(target)
    if not is_ridi_cover_compatible(target):
        target.unlink(missing_ok=True)
        raise RuntimeError("리디 호환 표지 메타데이터 변환에 실패했습니다.")

    backup = next_meta_backup(meta_path)
    shutil.copy2(meta_path, backup)
    frontmatter["epub"] = target.name
    frontmatter["epub_ridi_cover_compat_status"] = "pass"
    frontmatter["epub_ridi_cover_compat_at"] = datetime.now().isoformat(timespec="seconds")
    frontmatter["epub_ridi_cover_compat_source"] = epub_path.name
    dumped = yaml.safe_dump(frontmatter, allow_unicode=True, sort_keys=False, width=1000)
    meta_path.write_text(f"---\n{dumped}---\n{body}", encoding="utf-8")
    return {"status": "converted", "epub": str(target), "changed": True, "metaBackup": str(backup)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--book-dir", required=True)
    args = parser.parse_args()
    print(json.dumps(prepare(Path(args.book_dir)), ensure_ascii=False))


if __name__ == "__main__":
    main()
