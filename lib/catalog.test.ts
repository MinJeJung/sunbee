import { describe, expect, it } from "vitest";
import { catalogStats, getCatalogBook, platformDisplayStatus, platformStatusSchema, readCatalog } from "@/lib/catalog";
import { catalogBook } from "@/test/catalog-fixture";

const catalog = await readCatalog();

describe("전자책 통합 원장", () => {
  it("교보 전기간 원장을 불러온다 (2026-07-16 API 전환 후 328건 기준선)", () => {
    // 정확한 수는 신간 등록에 따라 늘 수 있다 — 기준선 이상·정합성만 고정한다
    expect(catalog.count).toBeGreaterThanOrEqual(242);
    expect(catalog.books).toHaveLength(catalog.count);
    expect(catalog.uniqueBookCount).toBeGreaterThanOrEqual(184);
    expect(catalog.uniqueBookCount).toBeLessThanOrEqual(catalog.count);
  });

  it("각 도서에 5개 유통사 상태와 조회 키가 있다", () => {
    for (const book of catalog.books) {
      expect(getCatalogBook(catalog, book.id)?.title).toBe(book.title);
      expect(book.title).not.toBe("");
      expect(Object.keys(book.platforms)).toEqual(["kyobo", "yes24", "ridi", "aladin", "millie"]);
      expect(book.registeredCount).toBeGreaterThanOrEqual(0);
      expect(book.registeredCount).toBeLessThanOrEqual(5);
    }
    // 2026년 제작분(242권)은 vault 자산 매칭이 보장된다 — 과거(2023~2025) 등록분은 자산이 없을 수 있음
    const withAssets = catalog.books.filter((book) => book.assetId !== "").length;
    expect(withAssets).toBeGreaterThanOrEqual(242);
  });

  it("운영 요약 합계가 원장과 일치한다", () => {
    const stats = catalogStats(catalog.books);
    expect(stats.total).toBe(catalog.books.length);
    expect(stats.kyoboLive).toBe(stats.total);
    expect(stats.pdf + stats.epub).toBe(stats.total);
    expect(stats.allFive + stats.missingDistribution).toBe(stats.total);
  });

  it("플랫폼 원문 상태를 짧은 통합 문구로 표시한다", () => {
    expect(platformDisplayStatus("kyobo", "유통중")).toBe("판매중");
    // "등록"은 제출 성공 기록일 뿐 — 판매중으로 승격 표시하지 않는다 (2026-07-15 밀리 대량 반려 사고)
    expect(platformDisplayStatus("yes24", "등록")).toBe("등록됨");
    expect(platformDisplayStatus("ridi", "등록")).toBe("등록됨");
    expect(platformDisplayStatus("millie", "등록")).toBe("등록됨");
    expect(platformDisplayStatus("aladin", "등록")).toBe("등록됨");
    expect(platformStatusSchema.safeParse("심사중").success).toBe(true);
    expect(platformStatusSchema.safeParse("반려").success).toBe(true);
    expect(platformDisplayStatus("kyobo", "심사중")).toBe("심사중");
    expect(platformDisplayStatus("millie", "반려")).toBe("반려");
    expect(platformDisplayStatus("millie", "중지")).toBe("중지");
    expect(platformDisplayStatus("aladin", "보완필요")).toBe("보완");
    expect(platformDisplayStatus("aladin", "확인필요")).toBe("확인필요");
  });

  it("Given 상품과 작업 상태 When 운영 지표를 계산하면 Then 판매 완료와 조치 필요를 분리한다", () => {
    const books = [
      catalogBook({ id: "epub", fileFormat: "EPUB" }),
      catalogBook({ id: "pdf", fileFormat: "PDF", epubIsbn: "", pdfIsbn: "9791124700001" }),
      catalogBook({
        id: "review",
        title: "심사 도서",
        kyoboProductCode: "kyobo-2",
        kyoboSalesProductId: "sales-2",
        activeIsbn: "9791124700002",
        epubIsbn: "9791124700002",
        platforms: { kyobo: "심사중", yes24: "심사중", ridi: "심사중", aladin: "심사중", millie: "심사중" },
      }),
      catalogBook({
        id: "action",
        title: "조치 도서",
        kyoboProductCode: "kyobo-3",
        kyoboSalesProductId: "sales-3",
        activeIsbn: "9791124700003",
        epubIsbn: "9791124700003",
        platforms: { kyobo: "유통중", yes24: "반려", ridi: "등록", aladin: "미등록", millie: "확인필요" },
      }),
    ];

    const stats = catalogStats(books);

    expect(stats).toMatchObject({
      productCount: 4,
      workCount: 3,
      allFiveLive: 2,
      reviewing: 1,
      actionRequired: 1,
      knownAcrossFive: 3,
    });
  });
});
