import { describe, expect, it } from "vitest";
import { activeProductionCount } from "@/lib/hermes-manager-source";
import { emptyState, type Operation } from "@/lib/types";

function operation(status: Operation["status"]): Operation {
  return {
    id: crypto.randomUUID(),
    direction: "테스트",
    resources: [],
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    status,
  };
}

describe("activeProductionCount", () => {
  it("does not count books waiting for human review as actively building", () => {
    const state = {
      ...emptyState(),
      operations: [operation("building"), operation("awaiting_review"), operation("completed"), operation("failed")],
    };

    expect(activeProductionCount(state)).toBe(1);
  });
});
