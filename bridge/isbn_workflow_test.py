from __future__ import annotations

import tempfile
import unittest
from datetime import datetime
from pathlib import Path

import yaml

from isbn_workflow import prepare_book_metadata


class PrepareBookMetadataTest(unittest.TestCase):
    def test_approved_dashboard_artifact_becomes_isbn_ready_metadata(self) -> None:
        # Given: 대시보드 승인본과 이전 EPUB를 가리키는 출판 메타
        with tempfile.TemporaryDirectory() as temporary:
            books_root = Path(temporary)
            book_dir = books_root / "sample-book"
            book_dir.mkdir()
            (book_dir / "cover.jpg").write_bytes(b"cover")
            latest_epub = book_dir / "sample_[수정 3].epub"
            latest_epub.write_bytes(b"epub")
            (book_dir / "_meta.md").write_text(
                "---\n"
                "title: AI 에이전트는 일하고, 사람은 판단한다\n"
                "author: 정민제\n"
                "publisher: 선비북스\n"
                "publication_date: '2026-07-14'\n"
                "cover: cover.jpg\n"
                "epub: sample_[수정 1].epub\n"
                "summary: 기존 요약은 덮어쓰지 않는다.\n"
                "human_review_status: pending\n"
                "---\n본문\n",
                encoding="utf-8",
            )
            operation = {
                "direction": "유튜브 링크에 대한 내용을 바탕으로 주제 도출해서 전자책 만들어줘",
                "artifact": {
                    "title": "AI 에이전트는 일하고, 사람은 판단한다",
                    "coverArtifactId": str(book_dir / "cover.jpg"),
                    "epubArtifactId": str(latest_epub),
                    "fingerprint": "a" * 64,
                },
                "approvedFingerprint": "a" * 64,
                "insight": {
                    "targetReader": "AI 자동화 실무자",
                    "readerPromise": "사람은 판단에 집중하는 운영 체계를 만든다.",
                    "keyInsights": ["주의력 병목", "검증 루프"],
                    "chapterDirections": ["1장. 병목", "2장. 검증", "3장. 승인"],
                },
            }

            # When: 승인 정보를 ISBN 메타에 동기화
            prepared_dir = prepare_book_metadata(
                operation,
                books_root=books_root,
                now=datetime(2026, 7, 14, 22, 0),
            )

            # Then: 최신 EPUB·사람 승인·ISBN 필수 정보가 보존/보강됨
            raw = (prepared_dir / "_meta.md").read_text(encoding="utf-8")
            frontmatter = yaml.safe_load(raw.split("---", 2)[1])
            self.assertEqual(frontmatter["epub"], latest_epub.name)
            self.assertEqual(frontmatter["human_review_status"], "approved")
            self.assertEqual(frontmatter["human_review_date"], "2026-07-14")
            self.assertEqual(frontmatter["summary"], "기존 요약은 덮어쓰지 않는다.")
            self.assertEqual(frontmatter["price"], 9900)
            self.assertEqual(frontmatter["kdc"], "005.1")
            self.assertEqual(frontmatter["epub_isbn_form_detail"], "EPUB2")
            self.assertTrue(frontmatter["isbn_author_intro"])
            self.assertTrue(frontmatter["isbn_excerpt"])
            self.assertTrue((prepared_dir / "_meta_[수정 1].md").exists())
            # 지시문(direction) 원문이 신청서 노출 필드로 새어 나가면 안 된다
            for junk in ("만들어줘", "유튜브", "링크에"):
                self.assertNotIn(junk, frontmatter["isbn_keywords"])
                self.assertNotIn(junk, frontmatter["isbn_remark"])
            # 표지에 없는 부제를 임의 생성하지 않는다
            self.assertFalse(frontmatter.get("subtitle"))


if __name__ == "__main__":
    unittest.main()
