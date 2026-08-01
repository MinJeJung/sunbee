import { describe, expect, it } from "vitest";
import { StateWriteConflictError, readVersionedState, updateVersionedState, type StateObject, type VersionedStateObjectStore } from "@/lib/gcs-state-store";
import { emptyState, type DashboardState } from "@/lib/types";

class MemoryStateObjectStore implements VersionedStateObjectStore {
  private current: StateObject | null;
  private conflictState: DashboardState | null = null;

  constructor(initial: DashboardState | null) {
    this.current = initial ? { body: JSON.stringify(initial), generation: "1" } : null;
  }

  conflictOnceWith(state: DashboardState) {
    this.conflictState = state;
  }

  async read(): Promise<StateObject | null> {
    return this.current;
  }

  async write(body: string, expectedGeneration: string | null): Promise<void> {
    if (this.conflictState) {
      const nextGeneration = String(Number(this.current?.generation ?? "0") + 1);
      this.current = { body: JSON.stringify(this.conflictState), generation: nextGeneration };
      this.conflictState = null;
      throw new StateWriteConflictError();
    }
    if (this.current?.generation !== expectedGeneration) throw new StateWriteConflictError();
    const nextGeneration = String(Number(this.current?.generation ?? "0") + 1);
    this.current = { body, generation: nextGeneration };
  }
}

describe("GCS versioned dashboard state", () => {
  it("returns an empty state when the object does not exist", async () => {
    // Given
    const store = new MemoryStateObjectStore(null);

    // When
    const state = await readVersionedState(store);

    // Then
    expect(state).toEqual(emptyState());
  });

  it("reapplies the update after a generation conflict", async () => {
    // Given
    const store = new MemoryStateObjectStore(emptyState());
    const now = "2026-08-01T00:00:00.000Z";
    store.conflictOnceWith({
      version: 1,
      operations: [],
      jobs: [{ id: "job-external", operationId: "op-external", type: "topic_insight", status: "queued", createdAt: now, updatedAt: now }],
    });

    // When
    const updated = await updateVersionedState(store, (state) => ({
      ...state,
      operations: [{ id: "op-cloud", direction: "클라우드 테스트", resources: [], createdAt: now, updatedAt: now, status: "insight_queued" }],
    }));

    // Then
    expect(updated.operations[0]?.id).toBe("op-cloud");
    expect(updated.jobs[0]?.id).toBe("job-external");
    expect((await readVersionedState(store)).jobs[0]?.id).toBe("job-external");
  });
});
