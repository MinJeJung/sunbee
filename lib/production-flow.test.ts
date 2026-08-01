import { describe, expect, it } from "vitest";
import { approvePlans, completeTopicInsight, hasActiveBatchBuild } from "@/lib/production-flow";
import type { DashboardState, Operation, TopicInsight } from "@/lib/types";

const insight: TopicInsight = {
  recommendedTitle: "실무 AI 자동화",
  targetReader: "마케터",
  readerPromise: "반복 업무를 자동화한다.",
  keyInsights: ["에이전트와 결정론적 자동화를 구분한다."],
  chapterDirections: ["문제", "설계", "실행"],
  sourceNotes: [],
  bookType: "standard",
  recommendedCharacters: { min: 60_000, max: 90_000 },
  promiseChecklist: ["자동화 후보를 고른다."],
  readerAssets: ["업무 선별 체크리스트"],
  differentiation: "국내 실무 흐름 중심",
};

function operation(id: string, batchId?: string): Operation {
  return { id, direction: "AI 자동화", targetReader: "마케터", problem: "반복 업무", desiredOutcome: "자동화", resources: [], source: batchId ? "dashboard_batch" : "dashboard", ...(batchId ? { batchId, batchRow: 1 } : {}), createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", status: "insight_processing" };
}

describe("기획 승인 흐름", () => {
  it("인사이트 완료 후 바로 집필하지 않고 기획 승인에서 멈춘다", () => {
    const state: DashboardState = { version: 1, operations: [operation("op")], jobs: [] };
    const next = completeTopicInsight(state, "op", insight, "2026-08-01T01:00:00.000Z");
    expect(next.operations[0]?.status).toBe("plan_review");
    expect(next.jobs).toHaveLength(0);
  });

  it("선택한 기획만 행 순서대로 집필 대기열에 넣는다", () => {
    const first = { ...operation("first", "batch"), insight, status: "plan_review" as const, batchRow: 2 };
    const second = { ...operation("second", "batch"), insight, status: "plan_review" as const, batchRow: 1 };
    const state: DashboardState = { version: 1, operations: [first, second], jobs: [] };
    const next = approvePlans(state, ["first", "second"], "2026-08-01T02:00:00.000Z", () => crypto.randomUUID());
    expect(next.operations.map((item) => item.status)).toEqual(["build_queued", "build_queued"]);
    expect(next.jobs.map((job) => job.operationId)).toEqual(["second", "first"]);
  });

  it("같은 배치의 앞 책이 제작 중이면 다음 책을 가져가지 않는다", () => {
    const first = { ...operation("first", "batch"), insight, status: "building" as const };
    const second = { ...operation("second", "batch"), insight, status: "build_queued" as const, batchRow: 2 };
    const state: DashboardState = { version: 1, operations: [first, second], jobs: [
      { id: "job-first", operationId: "first", type: "book_build", status: "claimed", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
      { id: "job-second", operationId: "second", type: "book_build", status: "queued", createdAt: "2026-08-01T00:00:01.000Z", updatedAt: "2026-08-01T00:00:01.000Z" },
    ] };
    expect(hasActiveBatchBuild(state, "second", "job-second")).toBe(true);
    expect(hasActiveBatchBuild(state, "second", "job-second", true)).toBe(false);
  });
});
