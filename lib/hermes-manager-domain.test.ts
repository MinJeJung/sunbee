import { describe, expect, it } from "vitest";
import { buildHermesManagerSnapshot, type HermesManagerInput } from "@/lib/hermes-manager-domain";

const BASE_INPUT: HermesManagerInput = {
  capturedAt: "2026-07-14T14:30:00.000Z",
  gateway: {
    isRunning: true,
    isSlackConnected: true,
    updatedAt: "2026-07-14T14:29:00.000Z",
  },
  cronJobs: [
    {
      name: "sunbee-ebook-dashboard-watch",
      enabled: true,
      lastStatus: "ok",
      lastRunAt: "2026-07-14T14:25:00.000Z",
      nextRunAt: "2026-07-14T14:30:00.000Z",
    },
  ],
  sales: {
    latestDate: "2026-07-14",
    cumulativeTotal: 1_187_983,
    dailyTotal: 42_000,
    isCurrent: true,
  },
  production: {
    active: 2,
    review: 0,
    failed: 0,
    distributionAttention: 0,
  },
  recovery: { attempts: 0, recovering: 0, blocked: 0, lastAt: null, lastSummary: null },
};

describe("buildHermesManagerSnapshot", () => {
  it("returns a healthy connected manager when every source is current", () => {
    // Given: Hermes, its dashboard watcher, and today's n8n data are healthy.
    // When: the operating snapshot is built.
    const snapshot = buildHermesManagerSnapshot(BASE_INPUT);

    // Then: the dashboard reports a connected and healthy operating manager.
    expect(snapshot.health).toBe("healthy");
    expect(snapshot.gateway).toMatchObject({ state: "connected", slackState: "connected" });
    expect(snapshot.monitor.state).toBe("ok");
    expect(snapshot.n8n).toMatchObject({ state: "current", dailyTotal: 42_000 });
  });

  it("reports automatic recovery as the primary Hermes production duty", () => {
    // Given
    const input: HermesManagerInput = {
      ...BASE_INPUT,
      recovery: {
        attempts: 2,
        recovering: 1,
        blocked: 0,
        lastAt: "2026-07-14T14:28:00.000Z",
        lastSummary: "실행 프로세스가 종료 신호로 중단됨",
      },
    };

    // When
    const snapshot = buildHermesManagerSnapshot(input);

    // Then
    expect(snapshot.recovery).toMatchObject({ state: "recovering", attempts: 2, recovering: 1 });
    expect(snapshot.priorities.map((item) => item.title)).toContain("Hermes 자동 복구 실행");
  });

  it("orders urgent failures before approvals and delayed data", () => {
    // Given: the gateway is offline and production, approval, and collection need attention.
    const input: HermesManagerInput = {
      ...BASE_INPUT,
      gateway: null,
      cronJobs: [
        {
          name: "sunbee-ebook-dashboard-watch",
          enabled: true,
          lastStatus: "error",
          lastRunAt: "2026-07-14T14:25:00.000Z",
          nextRunAt: "2026-07-14T14:30:00.000Z",
        },
        { name: "other-active-job", enabled: true, lastStatus: "error", lastRunAt: null, nextRunAt: null },
      ],
      sales: {
        latestDate: "2026-07-13",
        cumulativeTotal: 1_145_983,
        dailyTotal: 42_000,
        isCurrent: false,
      },
      production: { active: 1, review: 2, failed: 1, distributionAttention: 5 },
      recovery: { attempts: 3, recovering: 0, blocked: 1, lastAt: "2026-07-14T14:27:00.000Z", lastSummary: "네트워크 요청 실패" },
    };

    // When: the operating snapshot is built.
    const snapshot = buildHermesManagerSnapshot(input);

    // Then: urgent items lead and all human or data checks remain visible.
    expect(snapshot.health).toBe("offline");
    expect(snapshot.priorities[0]?.tone).toBe("urgent");
    expect(snapshot.priorities.map((item) => item.title)).toEqual(expect.arrayContaining([
      "Hermes 연결 복구",
      "제작 실패 확인",
      "자동 복구 한도 도달",
      "승인 대기 확인",
      "n8n 수집 지연",
      "5사 유통 누락 확인",
    ]));
  });
});
