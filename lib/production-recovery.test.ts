import { describe, expect, it } from "vitest";
import { recoverProductionState } from "@/lib/production-recovery";
import type { DashboardState, Job, Operation } from "@/lib/types";

const NOW = "2026-07-15T03:00:00.000Z";

describe("recoverProductionState", () => {
  it("diagnoses a failed build and queues a safe production retry", () => {
    // Given
    const state = dashboardState(
      operation({ status: "failed", insight: INSIGHT, error: "Codex 실행 실패(signal=SIGTERM)" }),
      [job({ status: "failed", type: "book_build" })],
    );

    // When
    const result = recoverProductionState({ state, now: NOW, progressUpdatedAt: {} });

    // Then
    expect(result.actions).toEqual([expect.objectContaining({ kind: "retry", cause: "interrupted", jobType: "book_build" })]);
    expect(result.state.operations[0]).toMatchObject({ status: "building", recoveryAttempts: 1 });
    expect(result.state.operations[0]?.error).toBeUndefined();
    expect(result.state.jobs[0]).toMatchObject({ status: "queued", type: "book_build" });
    expect(result.restartRequired).toBe(false);
  });

  it("leaves a currently progressing build untouched", () => {
    // Given
    const state = dashboardState(
      operation({ status: "building", insight: INSIGHT, updatedAt: "2026-07-15T02:40:00.000Z" }),
      [job({ status: "claimed", type: "book_build", claimedAt: "2026-07-15T02:40:00.000Z" })],
    );

    // When
    const result = recoverProductionState({
      state,
      now: NOW,
      progressUpdatedAt: { "operation-1": "2026-07-15T02:55:00.000Z" },
    });

    // Then
    expect(result.actions).toEqual([]);
    expect(result.state).toEqual(state);
  });

  it("requeues a build whose claimed job and progress have both stopped", () => {
    // Given
    const state = dashboardState(
      operation({ status: "building", insight: INSIGHT, updatedAt: "2026-07-15T00:00:00.000Z" }),
      [job({ status: "claimed", type: "book_build", claimedAt: "2026-07-15T00:00:00.000Z" })],
    );

    // When
    const result = recoverProductionState({
      state,
      now: NOW,
      progressUpdatedAt: { "operation-1": "2026-07-15T00:30:00.000Z" },
    });

    // Then
    expect(result.actions).toEqual([expect.objectContaining({ kind: "retry", cause: "stalled" })]);
    expect(result.state.jobs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "job-1", status: "failed" }),
      expect.objectContaining({ type: "book_build", status: "queued" }),
    ]));
    expect(result.restartRequired).toBe(true);
  });

  it("stops retrying after three automatic recovery attempts", () => {
    // Given
    const state = dashboardState(operation({
      status: "failed",
      insight: INSIGHT,
      error: "네트워크 연결 실패",
      recoveryAttempts: 3,
    }));

    // When
    const result = recoverProductionState({ state, now: NOW, progressUpdatedAt: {} });

    // Then
    expect(result.actions).toEqual([expect.objectContaining({ kind: "blocked", cause: "network" })]);
    expect(result.state.jobs).toHaveLength(0);
    expect(result.state.operations[0]).toMatchObject({ status: "failed", recoveryAttempts: 3 });
  });

  it("never auto-retries a failure after a reviewable artifact exists", () => {
    // Given
    const state = dashboardState(operation({
      status: "failed",
      insight: INSIGHT,
      artifact: {
        title: "완성본",
        coverArtifactId: "/tmp/cover.jpg",
        epubArtifactId: "/tmp/book.epub",
        fingerprint: "fingerprint-1234",
        characterCount: 120_000,
        factCheckScore: 90,
        epubCheckScore: 95,
      },
      approvedFingerprint: "fingerprint-1234",
      error: "ISBN 처리 실패",
    }));

    // When
    const result = recoverProductionState({ state, now: NOW, progressUpdatedAt: {} });

    // Then
    expect(result.actions).toEqual([]);
    expect(result.state).toEqual(state);
  });
});

const INSIGHT = {
  recommendedTitle: "테스트 도서",
  targetReader: "실무자",
  readerPromise: "자동화를 이해한다",
  keyInsights: ["핵심"],
  chapterDirections: ["1장", "2장", "3장"],
  sourceNotes: [],
};

function operation(overrides: Partial<Operation> = {}): Operation {
  return {
    id: "operation-1",
    direction: "테스트 주제",
    resources: [],
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    status: "failed",
    ...overrides,
  };
}

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    operationId: "operation-1",
    type: "book_build",
    status: "failed",
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

function dashboardState(target: Operation, jobs: Job[] = []): DashboardState {
  return { version: 1, operations: [target], jobs };
}
