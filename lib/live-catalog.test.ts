import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readCatalog } from "@/lib/catalog";
import { readLiveCatalog } from "@/lib/live-catalog";
import type { Operation } from "@/lib/types";

const temporaryRoots: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("완료 도서 전체 원장 반영", () => {
  it("Given 5사 접수가 완료된 도서 When 라이브 원장을 읽으면 Then ISBN과 심사 상태로 추가된다", async () => {
    const root = path.join(process.cwd(), "data", `live-catalog-test-${crypto.randomUUID()}`);
    temporaryRoots.push(root);
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "cover.jpg"), "cover");
    await writeFile(path.join(root, "book.epub"), "epub");
    await writeFile(path.join(root, "_meta.md"), [
      "---",
      "publication_date: 2026-08-14",
      "price: 9900",
      "distribution_category_primary: 컴퓨터/IT > 개발/프로그래밍",
      "epub_dist_kyobo_status: review",
      "epub_dist_kyobo_id: '8522619'",
      "epub_dist_yes24_status: review",
      "epub_dist_ridi_status: review",
      "epub_dist_aladin_status: review",
      "epub_dist_millie_status: review",
      "---",
    ].join("\n"));
    const operation = completedOperation(root);

    const books = await readLiveCatalog([], [operation]);

    expect(books).toHaveLength(1);
    expect(books[0]).toMatchObject({
      title: "AI 에이전트는 일하고, 사람은 판단한다",
      activeIsbn: "979-11-24703-68-7",
      price: 9900,
      registeredCount: 5,
      saleStatus: "5사 심사중",
      platforms: { kyobo: "심사중", yes24: "심사중", ridi: "심사중", aladin: "심사중", millie: "심사중" },
    });
  });

  it("Given 동일 ISBN이 교보 원장에 존재할 때 When 라이브 원장을 읽으면 Then 중복 추가하지 않는다", async () => {
    const root = path.join(process.cwd(), "data", `live-catalog-test-${crypto.randomUUID()}`);
    temporaryRoots.push(root);
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "_meta.md"), "---\nepub_dist_kyobo_status: review\n---\n");
    const operation = completedOperation(root);
    const firstBook = (await readCatalog()).books[0];
    if (!firstBook) throw new TypeError("테스트 원장이 비어 있습니다.");
    const existing = { ...firstBook, activeIsbn: operation.isbn ?? "" };

    const books = await readLiveCatalog([existing], [operation]);

    expect(books).toEqual([existing]);
  });

  it("Given 외부 유통 메타가 없을 때 When 완료 도서를 읽으면 Then 심사중으로 추정하지 않는다", async () => {
    const root = path.join(process.cwd(), "data", `live-catalog-test-${crypto.randomUUID()}`);
    temporaryRoots.push(root);
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "cover.jpg"), "cover");
    await writeFile(path.join(root, "book.epub"), "epub");

    const books = await readLiveCatalog([], [completedOperation(root)]);

    expect(books[0]?.platforms).toEqual({
      kyobo: "확인필요",
      yes24: "확인필요",
      ridi: "확인필요",
      aladin: "확인필요",
      millie: "확인필요",
    });
  });
});

function completedOperation(root: string): Operation {
  return {
    id: "1e02762e-2482-47c0-8249-42bd02dabe06",
    direction: "테스트 도서",
    resources: [],
    createdAt: "2026-07-14T10:09:18.228Z",
    updatedAt: "2026-07-14T13:31:26.223Z",
    status: "completed",
    insight: {
      recommendedTitle: "AI 에이전트는 일하고, 사람은 판단한다",
      targetReader: "AI 자동화 실무자",
      readerPromise: "사람의 주의력을 보호하는 운영 체계를 만든다.",
      keyInsights: ["핵심 인사이트"],
      chapterDirections: ["1장", "2장", "3장"],
      sourceNotes: [],
    },
    artifact: {
      title: "AI 에이전트는 일하고, 사람은 판단한다",
      coverArtifactId: path.join(root, "cover.jpg"),
      epubArtifactId: path.join(root, "book.epub"),
      fingerprint: "fingerprint",
      characterCount: 170_027,
      factCheckScore: 95,
      epubCheckScore: 100,
    },
    approvedFingerprint: "fingerprint",
    isbn: "979-11-24703-68-7",
    isbnApplicationNo: "379",
    isbnStatus: "applied",
    colophonStatus: "completed",
    distributionPlatforms: ["kyobo", "yes24", "ridi", "aladin", "millie"],
  };
}
