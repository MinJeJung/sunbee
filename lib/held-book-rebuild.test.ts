import { describe, expect, it } from "vitest";
import { prepareHeldBookRebuilds } from "@/lib/held-book-rebuild";
import type { DashboardState, Operation } from "@/lib/types";

const NOW = "2026-07-31T01:00:00.000Z";

describe("prepareHeldBookRebuilds", () => {
  it("queues every held book for a fresh approval-gated rebuild", () => {
    const state: DashboardState = {
      version: 1,
      operations: [
        operation({ id: "with-insight", insight: INSIGHT, approvedFingerprint: "old", reviewBatchId: "old-batch", error: "ISBN 실패" }),
        operation({ id: "without-insight", error: "인사이트 실패" }),
        operation({ id: "approved", status: "awaiting_review", insight: INSIGHT }),
      ],
      jobs: [],
    };

    const result = prepareHeldBookRebuilds(state, NOW);

    expect(result.operations.find((item) => item.id === "with-insight")).toMatchObject({
      status: "building",
      updatedAt: NOW,
    });
    expect(result.operations.find((item) => item.id === "with-insight")).not.toHaveProperty("approvedFingerprint");
    expect(result.operations.find((item) => item.id === "with-insight")).not.toHaveProperty("reviewBatchId");
    expect(result.operations.find((item) => item.id === "with-insight")).not.toHaveProperty("error");
    expect(result.operations.find((item) => item.id === "without-insight")).toMatchObject({ status: "insight_queued" });
    expect(result.operations.find((item) => item.id === "approved")).toMatchObject({ status: "awaiting_review" });
    expect(result.jobs.map((job) => [job.operationId, job.type, job.status])).toEqual([
      ["with-insight", "book_build", "queued"],
      ["without-insight", "topic_insight", "queued"],
    ]);
  });

  it("does not duplicate a held book that already has an active job", () => {
    const target = operation({ insight: INSIGHT });
    const state: DashboardState = {
      version: 1,
      operations: [target],
      jobs: [{
        id: "job-1",
        operationId: target.id,
        type: "book_build",
        status: "queued",
        createdAt: NOW,
        updatedAt: NOW,
      }],
    };

    expect(prepareHeldBookRebuilds(state, NOW)).toEqual(state);
  });
});

const INSIGHT = {
  recommendedTitle: "테스트 도서",
  targetReader: "실무자",
  readerPromise: "7일 안에 결과물을 만든다",
  keyInsights: ["핵심"],
  chapterDirections: ["1장", "2장", "3장"],
  sourceNotes: [],
};

function operation(overrides: Partial<Operation> = {}): Operation {
  return {
    id: "held-book",
    direction: "테스트 주제",
    resources: [],
    createdAt: NOW,
    updatedAt: NOW,
    status: "failed",
    ...overrides,
  };
}
