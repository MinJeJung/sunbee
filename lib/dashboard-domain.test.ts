import { describe, expect, it } from "vitest";
import { queryCatalogPage } from "@/lib/dashboard-domain";
import { catalogBook } from "@/test/catalog-fixture";

describe("대시보드 카탈로그 조회", () => {
  it("Given AI 도서 3권 When 첫 페이지를 조회하면 Then 지정한 행 수만 반환한다", () => {
    const books = [
      catalogBook({ id: "1", title: "첫째 도서" }),
      catalogBook({ id: "2", title: "둘째 도서" }),
      catalogBook({ id: "3", title: "셋째 도서" }),
    ];

    const result = queryCatalogPage(books, { scope: "ai", query: "", status: "all", page: 1, pageSize: 2 });

    expect(result.items.map((book) => book.id)).toEqual(["1", "2"]);
    expect(result.total).toBe(3);
    expect(result.totalPages).toBe(2);
  });

  it("Given 조치 필요 상태가 있는 도서 When 조치 필요 필터를 적용하면 Then 해당 도서만 반환한다", () => {
    const books = [
      catalogBook({ id: "clear" }),
      catalogBook({
        id: "action",
        platforms: { kyobo: "유통중", yes24: "반려", ridi: "유통중", aladin: "유통중", millie: "유통중" },
      }),
    ];

    const result = queryCatalogPage(books, { scope: "ai", query: "", status: "action", page: 1, pageSize: 50 });

    expect(result.items.map((book) => book.id)).toEqual(["action"]);
  });
});
