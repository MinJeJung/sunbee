import { describe, expect, it } from "vitest";
import { aggregateSalesHistory, parseSalesSnapshot } from "@/lib/sales-domain";

const platforms = {
  kyobo: 40,
  yes24: 20,
  aladin: 15,
  ridi: 15,
  millie: 10,
};

describe("전자책 순수익 집계", () => {
  it("월 첫날의 누적액을 해당 일자의 순수익으로 계산한다", () => {
    // Given
    const snapshots = [parseSalesSnapshot({
      date: "2026-06-01",
      capturedAt: "2026-06-01T00:00:00.000Z",
      ym: "2026-06",
      monthStart: "2026-06-01",
      today: "2026-06-01",
      platforms,
      total: 100,
    })];

    // When
    const result = aggregateSalesHistory(snapshots, "2026-06-01");

    // Then
    expect(result.months[0]?.days[0]?.dailyTotal).toBe(100);
  });

  it("집계 보류일도 연속 누적값으로 일 순수익을 복원하고 보강 상태로 표시한다", () => {
    // Given
    const snapshots = [
      parseSalesSnapshot({ date: "2026-06-01", ym: "2026-06", monthStart: "2026-06-01", today: "2026-06-01", platforms, total: 100 }),
      parseSalesSnapshot({ date: "2026-06-02", ym: "2026-06", monthStart: "2026-06-01", today: "2026-06-02", platforms, total: 150, estimated: true }),
      parseSalesSnapshot({ date: "2026-06-03", ym: "2026-06", monthStart: "2026-06-01", today: "2026-06-03", platforms, total: 190, estimated: false }),
    ];

    // When
    const result = aggregateSalesHistory(snapshots, "2026-06-03");

    // Then
    expect(result.months[0]?.days.map((day) => day.dailyTotal)).toEqual([100, 50, 40]);
    expect(result.months[0]?.days.map((day) => day.quality)).toEqual(["confirmed", "reconciled", "reconciled"]);
  });

  it("월중 첫 스냅샷은 누적 기준점으로 두고 일 순수익을 만들지 않는다", () => {
    const snapshots = [parseSalesSnapshot({
      date: "2026-05-29",
      ym: "2026-05",
      monthStart: "2026-05-01",
      today: "2026-05-29",
      platforms,
      total: 100,
    })];

    const result = aggregateSalesHistory(snapshots, "2026-05-29");

    expect(result.months[0]?.days[0]).toMatchObject({ dailyTotal: null, quality: "unavailable" });
  });

  it("연속된 정상 스냅샷의 유통사별 일 순수익을 계산한다", () => {
    // Given
    const snapshots = [
      parseSalesSnapshot({ date: "2026-07-03", ym: "2026-07", monthStart: "2026-07-01", today: "2026-07-03", platforms, total: 100 }),
      parseSalesSnapshot({
        date: "2026-07-04",
        ym: "2026-07",
        monthStart: "2026-07-01",
        today: "2026-07-04",
        platforms: { kyobo: 55, yes24: 25, aladin: 20, ridi: 20, millie: 10 },
        total: 130,
      }),
    ];

    // When
    const result = aggregateSalesHistory(snapshots, "2026-07-14");

    // Then
    expect(result.months[0]?.days[1]?.dailyPlatforms).toEqual({ kyobo: 15, yes24: 5, aladin: 5, ridi: 5, millie: 0 });
  });

  it("최신 스냅샷이 이틀보다 오래되면 갱신 지연으로 표시한다", () => {
    // Given
    const snapshots = [parseSalesSnapshot({
      date: "2026-07-04",
      ym: "2026-07",
      monthStart: "2026-07-01",
      today: "2026-07-04",
      platforms,
      total: 100,
    })];

    // When
    const result = aggregateSalesHistory(snapshots, "2026-07-14");

    // Then
    expect(result.freshness).toEqual({ kind: "delayed", days: 10 });
  });

  it("Given 오늘 수집이 전일 값으로 대체됐을 때 When 일 매출을 집계하면 Then 차액을 만들지 않는다", () => {
    const snapshots = [
      parseSalesSnapshot({ date: "2026-07-18", ym: "2026-07", monthStart: "2026-07-01", today: "2026-07-18", platforms, total: 100 }),
      parseSalesSnapshot({
        date: "2026-07-19",
        ym: "2026-07",
        monthStart: "2026-07-01",
        today: "2026-07-19",
        platforms,
        total: 100,
        platformStatus: {
          kyobo: { fallback: true, fallbackDate: "2026-07-18", error: "exit 1" },
        },
      }),
    ];

    const result = aggregateSalesHistory(snapshots, "2026-07-19");

    expect(result.latestDate).toBe("2026-07-18");
    expect(result.months[0]?.days[1]).toMatchObject({
      date: "2026-07-19",
      effectiveDate: "2026-07-18",
      dailyTotal: null,
      quality: "fallback",
    });
  });
});
