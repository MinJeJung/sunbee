from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml


VAULT_ROOT = Path("/Users/minje/Documents/Obsidian Vault")
BOOKS_ROOT = VAULT_ROOT / "3_출판 및 SNS/전자책원고"
ISBN_ROOT = VAULT_ROOT / "7_AI시스템/자동화프로젝트/isbn-신청-epub"
COLOPHON_ROOT = VAULT_ROOT / "7_AI시스템/자동화프로젝트/ebook-distribution-epub"
READINESS_SCRIPT = Path("/Users/minje/.agents/skills/new-ebook-publish/scripts/epub_publish_readiness.py")


class IsbnWorkflowError(RuntimeError):
    pass


def read_frontmatter(path: Path) -> tuple[dict[str, Any], str]:
    text = path.read_text(encoding="utf-8")
    match = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.DOTALL)
    if not match:
        raise IsbnWorkflowError(f"frontmatter를 읽을 수 없습니다: {path}")
    frontmatter = yaml.safe_load(match.group(1)) or {}
    if not isinstance(frontmatter, dict):
        raise IsbnWorkflowError(f"frontmatter 형식이 올바르지 않습니다: {path}")
    return frontmatter, match.group(2)


def write_frontmatter(path: Path, frontmatter: dict[str, Any], body: str) -> None:
    rendered = yaml.safe_dump(frontmatter, allow_unicode=True, sort_keys=False)
    path.write_text(f"---\n{rendered}---\n{body}", encoding="utf-8")


def next_versioned_path(path: Path) -> Path:
    escaped_stem = re.escape(path.stem)
    escaped_suffix = re.escape(path.suffix)
    pattern = re.compile(rf"^{escaped_stem}_\[수정 (\d+)\]{escaped_suffix}$")
    versions = [
        int(match.group(1))
        for candidate in path.parent.iterdir()
        if (match := pattern.match(candidate.name))
    ]
    return path.with_name(f"{path.stem}_[수정 {max(versions, default=0) + 1}]{path.suffix}")


def approved_book_dir(operation: dict[str, Any], books_root: Path) -> Path:
    artifact = operation.get("artifact")
    if not isinstance(artifact, dict):
        raise IsbnWorkflowError("승인된 책 산출물이 없습니다.")
    fingerprint = str(artifact.get("fingerprint") or "")
    if not fingerprint or operation.get("approvedFingerprint") != fingerprint:
        raise IsbnWorkflowError("승인 지문과 현재 책 산출물 지문이 일치하지 않습니다.")
    epub_path = Path(str(artifact.get("epubArtifactId") or "")).expanduser().resolve()
    cover_path = Path(str(artifact.get("coverArtifactId") or "")).expanduser().resolve()
    root = books_root.expanduser().resolve()
    if not epub_path.is_file() or not cover_path.is_file():
        raise IsbnWorkflowError("승인된 EPUB 또는 표지 파일이 없습니다.")
    if epub_path.parent != cover_path.parent or not epub_path.is_relative_to(root):
        raise IsbnWorkflowError("승인 산출물 경로가 전자책 원고 폴더 밖에 있습니다.")
    if not (epub_path.parent / "_meta.md").is_file():
        raise IsbnWorkflowError("책 폴더에 _meta.md가 없습니다.")
    return epub_path.parent


def insight_text(operation: dict[str, Any], key: str, default: str) -> str:
    insight = operation.get("insight")
    if not isinstance(insight, dict):
        return default
    value = insight.get(key)
    return str(value).strip() if value else default


def insight_list(operation: dict[str, Any], key: str) -> list[str]:
    insight = operation.get("insight")
    if not isinstance(insight, dict):
        return []
    value = insight.get(key)
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


_JOSA_SUFFIXES = ("에서", "까지", "부터", "은", "는", "이", "가", "을", "를", "의", "도", "와", "과", "로", "에")


def _clean_token(token: str) -> str:
    if re.fullmatch(r"[A-Za-z][A-Za-z0-9-]*", token):
        return token
    for josa in _JOSA_SUFFIXES:
        if token.endswith(josa) and len(token) - len(josa) >= 2:
            return token[: -len(josa)]
    return token


def isbn_keywords(title: str, operation: dict[str, Any]) -> str:
    # ISBN 신청서에 그대로 노출되는 검색 키워드 — 사용자 지시문(direction)은 재료로 쓰지 않는다.
    source = " ".join([
        insight_text(operation, "targetReader", ""),
        *insight_list(operation, "keyInsights"),
        *insight_list(operation, "chapterDirections"),
        title,
    ])
    excluded = {
        "그리고", "하지만", "때문에", "위한", "위해", "통해", "대한", "한다", "있다", "없다",
        "것이다", "필요하다", "만든다", "만들어줘", "바탕", "내용", "주제", "도출", "검색",
        "사람은", "일하고", "판단한다",
    }
    values: list[str] = []
    for token in re.findall(r"[A-Za-z][A-Za-z0-9-]{1,19}|[가-힣]{2,10}", source):
        value = _clean_token(token.strip())
        if len(value) < 2 or value in excluded:
            continue
        if value.casefold() in {item.casefold() for item in values}:
            continue
        values.append(value)
        if len(values) == 10:
            break
    return ";".join(values)


def prepare_book_metadata(
    operation: dict[str, Any],
    *,
    books_root: Path,
    now: datetime,
) -> Path:
    book_dir = approved_book_dir(operation, books_root)
    artifact = operation["artifact"]
    meta_path = book_dir / "_meta.md"
    frontmatter, body = read_frontmatter(meta_path)
    shutil.copy2(meta_path, next_versioned_path(meta_path))

    title = str(frontmatter.get("title") or artifact["title"]).strip()
    target_reader = insight_text(operation, "targetReader", "AI 도구를 업무에 적용하려는 실무자")
    reader_promise = insight_text(operation, "readerPromise", "실행 가능한 운영 원칙을 익힌다.")
    insights = insight_list(operation, "keyInsights")
    chapters = insight_list(operation, "chapterDirections")
    keywords = isbn_keywords(title, operation)

    defaults: dict[str, Any] = {
        "price": 9900,
        "kdc": "005.1",
        "epub_isbn_status": "draft",
        "epub_isbn_form_detail": "EPUB2",
        "epub_isbn_audience": "1",
        "epub_isbn_edition_type": "초판",
        "epub_isbn_edition_statement": "초판 1쇄",
        "epub_isbn_author_role": "A01",
        "isbn_author_intro": "정민제는 생성형 AI와 업무 자동화를 연구하고 강의하며, 조직이 AI 도구를 안전하고 실용적으로 활용하도록 돕고 있다.",
        "isbn_keywords": keywords,
        "isbn_excerpt": f"{reader_promise} " + " ".join(insights[:3]),
        "isbn_review": f"{target_reader}를 위한 실전 안내서다. {reader_promise}",
        "isbn_remark": f"{target_reader}가 곧바로 적용할 수 있도록 '{title}'의 핵심 운영 절차와 점검 기준을 담았다. 최신 자료와 검증 가능한 사례 중심의 실전 안내서다.",
    }
    for key, value in defaults.items():
        if frontmatter.get(key) in (None, "", []):
            frontmatter[key] = value
    if len(str(frontmatter.get("isbn_keywords") or "")) > 200:
        frontmatter["isbn_keywords"] = keywords
    if not frontmatter.get("toc") and chapters:
        frontmatter["toc"] = "\n".join(chapters)
    # subtitle은 표지에 새겨진 부제와 일치해야 하므로 임의 생성하지 않는다 (표지에 없으면 빈 칸 유지).
    if not frontmatter.get("summary"):
        frontmatter["summary"] = (
            f"이 책은 {target_reader}가 {reader_promise}라는 목표를 달성하도록 돕는다. "
            + " ".join(insights)
            + " 각 장은 개념 설명에 머물지 않고 실제 업무에 적용할 수 있는 점검 기준과 실행 순서를 제시한다."
        )

    frontmatter["epub"] = Path(str(artifact["epubArtifactId"])).name
    frontmatter["cover"] = Path(str(artifact["coverArtifactId"])).name
    frontmatter["human_review_status"] = "approved"
    frontmatter["human_review_date"] = now.date().isoformat()
    frontmatter["dashboard_approved_fingerprint"] = str(artifact["fingerprint"])
    frontmatter["dashboard_approved_at"] = now.isoformat(timespec="seconds")
    write_frontmatter(meta_path, frontmatter, body)
    return book_dir


def run_command(command: list[str], *, timeout: int) -> None:
    process = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    output = "\n".join(part.strip() for part in (process.stdout, process.stderr) if part.strip())
    if output:
        print(output, file=sys.stderr, flush=True)
    if process.returncode != 0:
        detail = output[-4000:] if output else f"exit={process.returncode}"
        raise IsbnWorkflowError(f"외부 단계 실행 실패: {command[1]}\n{detail}")


def remove_title_page_date(epub_path: Path) -> None:
    temporary = epub_path.with_suffix(f"{epub_path.suffix}.tmp")
    try:
        with zipfile.ZipFile(epub_path, "r") as source, zipfile.ZipFile(temporary, "w") as target:
            for item in source.infolist():
                content = source.read(item.filename)
                if item.filename == "EPUB/text/title_page.xhtml":
                    text = content.decode("utf-8")
                    text = re.sub(r"\s*<p\s+class=[\"']date[\"'][^>]*>.*?</p>", "", text, flags=re.DOTALL)
                    content = text.encode("utf-8")
                compression = zipfile.ZIP_STORED if item.filename == "mimetype" else item.compress_type
                target.writestr(item, content, compress_type=compression)
        temporary.replace(epub_path)
    finally:
        temporary.unlink(missing_ok=True)


def run_isbn_workflow(operation: dict[str, Any], *, dry_run: bool = False) -> dict[str, str]:
    book_dir = prepare_book_metadata(operation, books_root=BOOKS_ROOT, now=datetime.now())
    slug = book_dir.name
    isbn_python = ISBN_ROOT / ".venv/bin/python"
    colophon_python = COLOPHON_ROOT / ".venv/bin/python"
    if not colophon_python.exists():
        colophon_python = Path(sys.executable)

    run_command([
        str(colophon_python), str(COLOPHON_ROOT / "add_epub_colophon.py"), slug,
        "--allow-missing-isbn", "--force",
    ], timeout=900)
    remove_title_page_date(book_dir / Path(str(operation["artifact"]["epubArtifactId"])).name)
    run_command([
        "uv", "run", str(READINESS_SCRIPT), "--book-dir", str(book_dir), "--stage", "isbn",
    ], timeout=1800)
    frontmatter, _ = read_frontmatter(book_dir / "_meta.md")
    existing_isbn = str(frontmatter.get("epub_isbn") or "").strip()
    existing_application_no = str(frontmatter.get("epub_isbn_application_no") or "").strip()
    existing_status = str(frontmatter.get("epub_isbn_status") or "").strip()
    already_applied = (
        len(re.sub(r"\D", "", existing_isbn)) == 13
        and bool(existing_application_no)
        and existing_status in {"applied", "issued"}
    )
    application_command = [str(isbn_python), str(ISBN_ROOT / "apply_isbn.py"), slug, "--headless", "--no-slack"]
    if dry_run:
        application_command.append("--dry-run")
    if dry_run or not already_applied:
        run_command(application_command, timeout=300 if dry_run else 2700)
    if dry_run:
        return {"status": "dry_run", "bookSlug": slug}

    frontmatter, _ = read_frontmatter(book_dir / "_meta.md")
    isbn = str(frontmatter.get("epub_isbn") or "").strip()
    application_no = str(frontmatter.get("epub_isbn_application_no") or "").strip()
    isbn_status = str(frontmatter.get("epub_isbn_status") or "").strip()
    if len(re.sub(r"\D", "", isbn)) != 13 or not application_no or isbn_status not in {"applied", "issued"}:
        raise IsbnWorkflowError("ISBN 신청 결과에 13자리 ISBN·신청번호·정상 상태가 모두 기록되지 않았습니다.")

    run_command([
        str(colophon_python), str(COLOPHON_ROOT / "add_epub_colophon.py"), slug, "--force",
    ], timeout=900)
    run_command([
        "uv", "run", str(READINESS_SCRIPT), "--book-dir", str(book_dir), "--stage", "isbn",
    ], timeout=1800)
    return {
        "status": "completed",
        "isbn": isbn,
        "applicationNo": application_no,
        "isbnStatus": isbn_status,
        "colophonStatus": "completed",
        "bookSlug": slug,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--operation-json", required=True, type=Path)
    parser.add_argument("--dry-run", action="store_true")
    arguments = parser.parse_args()
    operation = json.loads(arguments.operation_json.read_text(encoding="utf-8"))
    if not isinstance(operation, dict):
        raise IsbnWorkflowError("operation JSON은 객체여야 합니다.")
    try:
        result = run_isbn_workflow(operation, dry_run=arguments.dry_run)
    except IsbnWorkflowError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from None
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
