#!/usr/bin/env python3
"""EPUB 목차 하이퍼링크 검증기 — 표준 라이브러리만 사용.

검증 대상 3면:
  1. nav.xhtml  — EPUB 뷰어 목차. 모든 항목(장·절)의 링크가 실제 존재하는
     앵커로 이동하고, 도착 지점의 제목 텍스트가 목차 라벨과 일치하는지.
  2. toc.ncx    — 구형 뷰어(EPUB2) 목차. 동일 기준.
  3. 본문 차례 페이지 — 독자가 실제로 클릭하는 본문 안의 "차례/목차" 페이지.
     절 항목이 링크 없이 텍스트로만 있거나, 깨진 앵커로 가면 실패.

기존 book 스킬 검증기(validate_epub_toc_targets.py)는 번호 절(`N-M.`)만,
nav/ncx 두 면만 검사했고 어느 코드 게이트에도 연결되어 있지 않았다.
이 검증기는 bridge/run.ts의 책 제작 완료 직후 + 5사 유통 직전에 코드로 강제된다
(프롬프트 지시가 아니라 게이트 — 모델이 잊어도 잘못된 목차는 출고되지 않는다).

종료 코드: 0 = pass, 1 = fail, 2 = 실행 오류(EPUB 없음 등)
stdout: JSON 요약 한 건. stderr: 사람이 읽는 실패 목록.
"""
from __future__ import annotations

import argparse
import json
import posixpath
import re
import sys
import zipfile
from pathlib import PurePosixPath
from urllib.parse import unquote
from xml.etree import ElementTree as ET

SECTION_LABEL = re.compile(r"^\s*\d+\s*-\s*\d+\s*\.\s+\S")
TOC_PAGE_TITLE = re.compile(r"^(차례|목차)$")
XHTML_NS = {"x": "http://www.w3.org/1999/xhtml"}
EPUB_NS = {"epub": "http://www.idpf.org/2007/ops"}
NCX_NS = {"n": "http://www.daisy.org/z3986/2005/ncx/"}
HEADING_TAGS = {"h1", "h2", "h3", "h4"}


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _resolve(base: str, href: str) -> tuple[str, str]:
    path, _, fragment = href.partition("#")
    if not path:
        return base, unquote(fragment)
    target = posixpath.normpath(posixpath.join(posixpath.dirname(base), path))
    return target, unquote(fragment)


class Epub:
    """zip 내 문서 파싱 결과 캐시 — 문서당 1회만 파싱."""

    def __init__(self, zf: zipfile.ZipFile):
        self.zf = zf
        self.names = set(zf.namelist())
        self._trees: dict[str, ET.Element | None] = {}

    def tree(self, path: str) -> ET.Element | None:
        if path not in self._trees:
            try:
                self._trees[path] = ET.fromstring(self.zf.read(path))
            except (ET.ParseError, KeyError):
                self._trees[path] = None
        return self._trees[path]

    def ids(self, path: str) -> set[str]:
        root = self.tree(path)
        if root is None:
            return set()
        return {value for node in root.iter() if (value := node.attrib.get("id"))}

    def heading_for_id(self, path: str, fragment: str) -> str:
        """앵커 요소 자신 또는 그 하위의 첫 제목 텍스트."""
        root = self.tree(path)
        if root is None:
            return ""
        for node in root.iter():
            if node.attrib.get("id") != fragment:
                continue
            if _local(node.tag) in HEADING_TAGS:
                return _norm("".join(node.itertext()))
            for child in node.iter():
                if _local(child.tag) in HEADING_TAGS:
                    return _norm("".join(child.itertext()))
        return ""


def _check_entries(book: Epub, surface: str, entries: list[tuple[str, str]], failures: list[str]) -> None:
    destinations: dict[str, str] = {}
    for label, href in entries:
        target, fragment = _resolve(surface, href)
        if target not in book.names:
            failures.append(f"{surface}: 「{label}」 대상 파일 없음 → {target}")
            continue
        if not fragment:
            # 장 단위 항목은 파일 시작으로의 이동(프래그먼트 없음)을 허용하되,
            # 번호 절 항목은 반드시 절 앵커가 있어야 한다 (파일 첫머리로 뭉개지는 사고 방지).
            if SECTION_LABEL.match(label):
                failures.append(f"{surface}: 절 항목 「{label}」에 앵커(#)가 없음 — 파일 첫머리로만 이동")
            continue
        if fragment not in book.ids(target):
            failures.append(f"{surface}: 「{label}」 도착 앵커 없음 → {target}#{fragment}")
            continue
        heading = book.heading_for_id(target, fragment)
        if heading and _norm(label) != heading:
            failures.append(f"{surface}: 「{label}」 링크가 다른 제목 「{heading}」에 도착")
        key = f"{target}#{fragment}"
        previous = destinations.get(key)
        if previous and previous != label:
            failures.append(f"{surface}: 「{previous}」와 「{label}」이 같은 위치로 이동 → {key}")
        destinations[key] = label


def _nav_entries(book: Epub, nav_path: str) -> list[tuple[str, str]]:
    root = book.tree(nav_path)
    if root is None:
        return []
    entries: list[tuple[str, str]] = []
    for anchor in root.findall(".//x:nav[@epub:type='toc']//x:a", {**XHTML_NS, **EPUB_NS}):
        label = _norm("".join(anchor.itertext()))
        href = anchor.attrib.get("href", "")
        if label and href:
            entries.append((label, href))
    return entries


def _ncx_entries(book: Epub, ncx_path: str) -> list[tuple[str, str]]:
    root = book.tree(ncx_path)
    if root is None:
        return []
    entries: list[tuple[str, str]] = []
    for point in root.findall(".//n:navPoint", NCX_NS):
        label = _norm(point.findtext("n:navLabel/n:text", "", NCX_NS))
        content = point.find("n:content", NCX_NS)
        if label and content is not None and content.attrib.get("src"):
            entries.append((label, content.attrib["src"]))
    return entries


def _body_toc_pages(book: Epub) -> list[str]:
    """본문 안의 차례 페이지(xhtml) 탐지 — nav.xhtml 제외, 첫 제목이 '차례/목차'."""
    pages: list[str] = []
    for name in sorted(book.names):
        base = PurePosixPath(name).name
        if not name.endswith((".xhtml", ".html")) or base == "nav.xhtml":
            continue
        root = book.tree(name)
        if root is None:
            continue
        for node in root.iter():
            if _local(node.tag) in HEADING_TAGS:
                if TOC_PAGE_TITLE.match(_norm("".join(node.itertext()))):
                    pages.append(name)
                break
    return pages


def _check_body_toc(book: Epub, page: str, failures: list[str], warnings: list[str]) -> None:
    root = book.tree(page)
    if root is None:
        failures.append(f"{page}: 차례 페이지를 파싱할 수 없음")
        return
    linked_labels: list[str] = []
    for anchor in root.findall(".//x:a", XHTML_NS):
        href = anchor.attrib.get("href", "")
        label = _norm("".join(anchor.itertext()))
        if not href or href.startswith(("http://", "https://", "mailto:")):
            continue
        linked_labels.append(label)
        target, fragment = _resolve(page, href)
        if target not in book.names:
            failures.append(f"{page}: 차례 링크 「{label}」 대상 파일 없음 → {target}")
        elif fragment and fragment not in book.ids(target):
            failures.append(f"{page}: 차례 링크 「{label}」 도착 앵커 없음 → {target}#{fragment}")
    # 링크로 감싸이지 않은 번호 절 항목 탐지 — "차례가 있는데 눌러도 안 움직인다" 사고의 원인
    linked_set = {_norm(label) for label in linked_labels}
    plain_text = "\n".join(_norm("".join(node.itertext())) for node in root.iter() if _local(node.tag) in {"p", "li"})
    unlinked = [
        line for line in plain_text.splitlines()
        if SECTION_LABEL.match(line) and _norm(line) not in linked_set
    ]
    if unlinked:
        preview = " / ".join(unlinked[:3])
        failures.append(f"{page}: 링크 없는 절 항목 {len(unlinked)}개 (예: {preview})")
    if not linked_labels:
        warnings.append(f"{page}: 차례 페이지에 내부 링크가 하나도 없음")


def validate(epub_path: str, require_body_toc: bool = False) -> dict:
    failures: list[str] = []
    warnings: list[str] = []
    checked = {"nav_entries": 0, "ncx_entries": 0, "body_toc_pages": 0}
    with zipfile.ZipFile(epub_path) as zf:
        book = Epub(zf)
        nav_paths = [name for name in book.names if PurePosixPath(name).name == "nav.xhtml"]
        ncx_paths = [name for name in book.names if PurePosixPath(name).suffix == ".ncx"]

        if not nav_paths:
            failures.append("nav.xhtml이 없습니다")
        else:
            entries = _nav_entries(book, nav_paths[0])
            checked["nav_entries"] = len(entries)
            if not entries:
                failures.append(f"{nav_paths[0]}: 목차 항목이 없습니다")
            else:
                if not any(SECTION_LABEL.match(label) for label, _ in entries):
                    warnings.append(f"{nav_paths[0]}: 번호 절(N-M.) 항목이 없음 — 장 단위 목차만 존재")
                _check_entries(book, nav_paths[0], entries, failures)

        if ncx_paths:
            entries = _ncx_entries(book, ncx_paths[0])
            checked["ncx_entries"] = len(entries)
            if entries:
                _check_entries(book, ncx_paths[0], entries, failures)

        toc_pages = _body_toc_pages(book)
        checked["body_toc_pages"] = len(toc_pages)
        if not toc_pages:
            # 신간 게이트(require_body_toc)에서는 실패 — 상업 전자책은 독자가 넘겨 보는
            # 본문 차례 페이지가 있어야 하고, 각 항목이 하이퍼링크여야 한다.
            # 기존 도서 재감사에서는 경고로만 남긴다 (일괄 재빌드 강제 방지).
            message = "본문 차례 페이지가 없음 — 하이퍼링크 차례 페이지를 만들고 다시 빌드하세요"
            if require_body_toc:
                failures.append(message)
            else:
                warnings.append("본문 차례 페이지를 찾지 못함 — 뷰어 목차(nav)만 검증됨")
        for page in toc_pages:
            _check_body_toc(book, page, failures, warnings)

    return {
        "status": "fail" if failures else "pass",
        "failures": failures,
        "warnings": warnings,
        "checked": checked,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("epub", help="검증할 EPUB 파일 경로")
    parser.add_argument("--require-body-toc", action="store_true",
                        help="본문 차례 페이지가 없으면 실패 처리 (신간 제작 게이트용)")
    args = parser.parse_args()
    try:
        verdict = validate(args.epub, require_body_toc=args.require_body_toc)
    except (FileNotFoundError, zipfile.BadZipFile) as error:
        print(json.dumps({"status": "error", "failures": [str(error)], "warnings": [], "checked": {}}, ensure_ascii=False))
        print(f"TOC_VALIDATE: error — {error}", file=sys.stderr)
        return 2
    print(json.dumps(verdict, ensure_ascii=False))
    if verdict["status"] == "fail":
        print("TOC_VALIDATE: fail", file=sys.stderr)
        for failure in verdict["failures"]:
            print(f"- {failure}", file=sys.stderr)
        return 1
    print(f"TOC_VALIDATE: pass (nav {verdict['checked']['nav_entries']}건, ncx {verdict['checked']['ncx_entries']}건, 본문 차례 {verdict['checked']['body_toc_pages']}쪽)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
