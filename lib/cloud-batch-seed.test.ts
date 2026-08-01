import { describe, expect, it } from "vitest";
import { createCloudBatchSeed } from "@/lib/cloud-batch-seed";
import type { DashboardState } from "@/lib/types";

describe("cloud batch state seed", () => {
  it("queues every insight-ready batch row without local runtime residue", () => {
    // Given
    const now = "2026-08-01T00:00:00.000Z";
    const state: DashboardState = {
      version: 1,
      operations: [
        { id: "b4b9e770-d255-4d41-a47a-547312a3bb9e", direction: "둘째", resources: [], createdAt: now, updatedAt: now, status: "failed", batchId: "batch", batchRow: 3, error: "network", insight: { recommendedTitle: "둘째", targetReader: "독자", readerPromise: "결과", keyInsights: ["핵심"], chapterDirections: ["1", "2", "3"], sourceNotes: [] } },
        { id: "eb6273b3-83f0-492c-a3b5-21499b231182", direction: "첫째", resources: [], createdAt: now, updatedAt: now, status: "building", batchId: "batch", batchRow: 2, insight: { recommendedTitle: "첫째", targetReader: "독자", readerPromise: "결과", keyInsights: ["핵심"], chapterDirections: ["1", "2", "3"], sourceNotes: [] } },
      ],
      jobs: [{ id: "old", operationId: "eb6273b3-83f0-492c-a3b5-21499b231182", type: "book_build", status: "failed", createdAt: now, updatedAt: now }],
    };

    // When
    const seeded = createCloudBatchSeed(state, "batch", now);

    // Then
    expect(seeded.operations.map((operation) => operation.batchRow)).toEqual([2, 3]);
    expect(seeded.operations.every((operation) => operation.status === "build_queued" && operation.error === undefined)).toBe(true);
    expect(seeded.jobs.map((job) => job.operationId)).toEqual(seeded.operations.map((operation) => operation.id));
    expect(seeded.jobs.every((job) => job.status === "queued" && job.type === "book_build")).toBe(true);
  });
});
