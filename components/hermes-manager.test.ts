import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HermesManager } from "@/components/hermes-manager";
import type { HermesManagerSnapshot } from "@/lib/hermes-manager-domain";

describe("HermesManager", () => {
  it("displays the 15-minute monitoring interval", () => {
    // Given
    const snapshot: HermesManagerSnapshot = {
      capturedAt: "2026-07-14T12:00:00+09:00",
      health: "healthy",
      gateway: { state: "connected", slackState: "connected", updatedAt: "2026-07-14T12:00:00+09:00" },
      monitor: { state: "ok", lastRunAt: "2026-07-14T11:45:00+09:00", nextRunAt: "2026-07-14T12:00:00+09:00" },
      n8n: { state: "current", latestDate: "2026-07-14", cumulativeTotal: 0, dailyTotal: 0 },
      production: { active: 0, review: 0, failed: 0, distributionAttention: 0 },
      recovery: { state: "recovering", attempts: 1, recovering: 1, blocked: 0, lastAt: "2026-07-14T11:50:00+09:00", lastSummary: "제작 중단 감지" },
      cron: { active: 1, failed: 0 },
      priorities: [{ tone: "normal", title: "자동 운영 정상", detail: "이상이 없습니다." }],
    };

    // When
    const markup = renderToStaticMarkup(createElement(HermesManager, { snapshot }));

    // Then
    expect(markup).toContain("15분 운영 감시");
    expect(markup).toContain("제작 자동 복구");
    expect(markup).toContain("1권 재제작 중");
  });

  it("labels historical attempts as completed when nothing is blocked", () => {
    const snapshot: HermesManagerSnapshot = {
      capturedAt: "2026-07-31T10:40:00+09:00",
      health: "healthy",
      gateway: { state: "connected", slackState: "connected", updatedAt: "2026-07-31T10:40:00+09:00" },
      monitor: { state: "ok", lastRunAt: "2026-07-31T10:30:00+09:00", nextRunAt: "2026-07-31T10:45:00+09:00" },
      n8n: { state: "current", latestDate: "2026-07-31", cumulativeTotal: 0, dailyTotal: 0 },
      production: { active: 0, review: 0, failed: 0, distributionAttention: 0 },
      recovery: { state: "idle", attempts: 12, recovering: 0, blocked: 0, lastAt: "2026-07-31T10:15:00+09:00", lastSummary: "재제작 완료" },
      cron: { active: 1, failed: 0 },
      priorities: [{ tone: "normal", title: "자동 운영 정상", detail: "이상이 없습니다." }],
    };

    const markup = renderToStaticMarkup(createElement(HermesManager, { snapshot }));

    expect(markup).toContain("복구 완료 이력");
    expect(markup).not.toContain("복구 한도 도달");
  });
});
