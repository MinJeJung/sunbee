#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import posixpath
import tempfile
import zipfile
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET

XHTML = "http://www.w3.org/1999/xhtml"
EPUB = "http://www.idpf.org/2007/ops"
OPF = "http://www.idpf.org/2007/opf"

ET.register_namespace("", XHTML)
ET.register_namespace("epub", EPUB)
ET.register_namespace("", OPF)
ET.register_namespace("dc", "http://purl.org/dc/elements/1.1/")
ET.register_namespace("opf", "http://www.idpf.org/2007/opf")


def locate(names: set[str], basename: str) -> str:
    matches = [name for name in names if PurePosixPath(name).name == basename]
    if len(matches) != 1:
        raise ValueError(f"{basename} 파일을 하나만 찾을 수 있어야 합니다: {matches}")
    return matches[0]


def build_toc_page(nav_bytes: bytes, nav_path: str, toc_path: str, title: str) -> bytes:
    nav_root = ET.fromstring(nav_bytes)
    toc_nav = nav_root.find(f".//{{{XHTML}}}nav[@{{{EPUB}}}type='toc']")
    if toc_nav is None:
        raise ValueError("nav.xhtml에서 EPUB 목차를 찾지 못했습니다.")
    toc_list = toc_nav.find(f"{{{XHTML}}}ol")
    if toc_list is None:
        raise ValueError("nav.xhtml 목차 목록이 없습니다.")

    copied = copy.deepcopy(toc_list)
    for anchor in copied.findall(f".//{{{XHTML}}}a"):
        href = anchor.attrib.get("href", "")
        path, marker, fragment = href.partition("#")
        if path:
            absolute = posixpath.normpath(posixpath.join(posixpath.dirname(nav_path), path))
            anchor.attrib["href"] = posixpath.relpath(absolute, posixpath.dirname(toc_path)) + (marker + fragment if marker else "")

    root = ET.Element(f"{{{XHTML}}}html", {"lang": "ko-KR", "xml:lang": "ko-KR"})
    head = ET.SubElement(root, f"{{{XHTML}}}head")
    ET.SubElement(head, f"{{{XHTML}}}meta", {"charset": "utf-8"})
    ET.SubElement(head, f"{{{XHTML}}}title").text = title
    stylesheet = posixpath.relpath(
        posixpath.join(posixpath.dirname(nav_path), "styles/stylesheet1.css"),
        posixpath.dirname(toc_path),
    )
    ET.SubElement(head, f"{{{XHTML}}}link", {"rel": "stylesheet", "type": "text/css", "href": stylesheet})
    body = ET.SubElement(root, f"{{{XHTML}}}body", {f"{{{EPUB}}}type": "frontmatter toc"})
    ET.SubElement(body, f"{{{XHTML}}}h1", {"id": "body-toc-title"}).text = "차례"
    body.append(copied)
    return b'<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n' + ET.tostring(root, encoding="utf-8")


def patch_opf(opf_bytes: bytes, opf_path: str, toc_path: str) -> bytes:
    root = ET.fromstring(opf_bytes)
    manifest = root.find(f"{{{OPF}}}manifest")
    spine = root.find(f"{{{OPF}}}spine")
    if manifest is None or spine is None:
        raise ValueError("content.opf의 manifest 또는 spine이 없습니다.")

    href = posixpath.relpath(toc_path, posixpath.dirname(opf_path))
    if not any(item.attrib.get("id") == "body_toc_xhtml" for item in manifest):
        ET.SubElement(manifest, f"{{{OPF}}}item", {
            "id": "body_toc_xhtml",
            "href": href,
            "media-type": "application/xhtml+xml",
        })
    if not any(item.attrib.get("idref") == "body_toc_xhtml" for item in spine):
        itemref = ET.Element(f"{{{OPF}}}itemref", {"idref": "body_toc_xhtml", "linear": "yes"})
        children = list(spine)
        insert_at = next((index + 1 for index, item in enumerate(children) if item.attrib.get("idref") == "title_page_xhtml"), 0)
        spine.insert(insert_at, itemref)

    guide = root.find(f"{{{OPF}}}guide")
    if guide is not None:
        for reference in guide.findall(f"{{{OPF}}}reference"):
            if reference.attrib.get("type") == "toc":
                reference.attrib["href"] = href
    return b'<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="utf-8")


def write_epub(source: Path, output: Path) -> None:
    if source.resolve() == output.resolve():
        raise ValueError("원본 EPUB은 덮어쓸 수 없습니다.")
    with zipfile.ZipFile(source) as incoming:
        names = set(incoming.namelist())
        nav_path = locate(names, "nav.xhtml")
        opf_path = locate(names, "content.opf")
        toc_path = posixpath.join(posixpath.dirname(opf_path), "text", "toc_page.xhtml")
        title = "차례"
        toc_bytes = build_toc_page(incoming.read(nav_path), nav_path, toc_path, title)
        opf_bytes = patch_opf(incoming.read(opf_path), opf_path, toc_path)

        output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=output.parent, suffix=".epub", delete=False) as handle:
            temporary = Path(handle.name)
        try:
            with zipfile.ZipFile(temporary, "w") as outgoing:
                outgoing.writestr("mimetype", incoming.read("mimetype"), compress_type=zipfile.ZIP_STORED)
                for info in incoming.infolist():
                    if info.filename in {"mimetype", opf_path, toc_path}:
                        continue
                    outgoing.writestr(info, incoming.read(info.filename))
                outgoing.writestr(opf_path, opf_bytes, compress_type=zipfile.ZIP_DEFLATED)
                outgoing.writestr(toc_path, toc_bytes, compress_type=zipfile.ZIP_DEFLATED)
            temporary.replace(output)
        finally:
            temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Pandoc EPUB에 본문 차례 페이지를 추가합니다.")
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    write_epub(args.source, args.output)
    print(f"body_toc_added={args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
