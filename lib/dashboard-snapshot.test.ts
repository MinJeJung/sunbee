import { describe, expect, it } from "vitest";
import { aggregateSalesHistory, parseSalesSnapshot } from "@/lib/sales-domain";
import { buildDashboardSnapshot } from "@/lib/dashboard-snapshot";
import { catalogBook } from "@/test/catalog-fixture";

describe("대시보드 V2 스냅샷", () => {
  it("Given 서로 다른 원천 기준일 When 스냅샷을 만들면 Then 생성일과 기준일을 분리한다", () => {
    const book = catalogBook();
    const sales = aggregateSalesHistory([parseSalesSnapshot({
      date: "2026-07-19",
      capturedAt: "2026-07-18T22:01:18.990Z",
      ym: "2026-07",
      monthStart: "2026-07-01",
      today: "2026-07-19",
      platforms: { kyobo: 40, yes24: 20, aladin: 15, ridi: 15, millie: 10 },
      total: 100,
    })], "2026-07-19");

    const snapshot = buildDashboardSnapshot({
      catalog: {
        generatedAt: "2026-07-18T22:50:35+09:00",
        sourceWorkbook: "kyobo.xlsx",
        sourceWorkbookUpdatedAt: "2026-07-14T18:14:23+09:00",
        fivePlatformWorkbook: "five.xlsx",
        fivePlatformWorkbookUpdatedAt: "2026-07-10T10:32:08+09:00",
        count: 1,
        uniqueBookCount: 1,
        books: [book],
      },
      books: [book],
      state: { version: 1, operations: [], jobs: [] },
      sales,
      generatedAt: "2026-07-19T06:00:00.000Z",
      buildVersion: "0.3.1",
    });

    expect(snapshot.sources.find((source) => source.source === "kyobo-catalog")).toMatchObject({
      state: "stale",
      effectiveDate: "2026-07-14",
      attemptedAt: "2026-07-18T22:50:35+09:00",
    });
    expect(snapshot.sources.find((source) => source.source === "five-platform-catalog")?.effectiveDate).toBe("2026-07-10");
    expect(snapshot.metrics).toMatchObject({ productCount: 1, workCount: 1, allFiveLive: 1, actionRequired: 0 });
  });

  it("산출물 생성 전 제작 건은 ISBN 메타 누락으로 판정하지 않는다", () => {
    const book = catalogBook();
    const sales = aggregateSalesHistory([parseSalesSnapshot({
      date: "2026-07-19",
      capturedAt: "2026-07-19T01:00:00.000Z",
      ym: "2026-07",
      monthStart: "2026-07-01",
      today: "2026-07-19",
      platforms: { kyobo: 0, yes24: 0, aladin: 0, ridi: 0, millie: 0 },
      total: 0,
    })], "2026-07-19");
    const snapshot = buildDashboardSnapshot({
      catalog: {
        generatedAt: "2026-07-19T09:00:00+09:00",
        sourceWorkbook: "kyobo.xlsx",
        sourceWorkbookUpdatedAt: "2026-07-19T09:00:00+09:00",
        fivePlatformWorkbook: "five.xlsx",
        fivePlatformWorkbookUpdatedAt: "2026-07-19T09:00:00+09:00",
        count: 1,
        uniqueBookCount: 1,
        books: [book],
      },
      books: [book],
      state: {
        version: 1,
        operations: [{
          id: "operation-id",
          direction: "Hermes 제작 주제",
          resources: [],
          createdAt: "2026-07-19T10:00:00.000Z",
          updatedAt: "2026-07-19T10:00:00.000Z",
          status: "insight_processing",
        }],
        jobs: [],
      },
      sales,
      generatedAt: "2026-07-19T10:00:00.000Z",
      buildVersion: "0.3.1",
    });

    expect(snapshot.operations[0]).toMatchObject({
      status: "insight_processing",
      createdAt: "2026-07-19T10:00:00.000Z",
      metadataState: "pending",
      distributionPlatforms: [],
      productionJobState: null,
      progress: null,
      reviewArtifact: null,
    });
  });
});
