import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readState, updateState } from "@/lib/store";
import { emptyState } from "@/lib/types";

describe("state store write queue", () => {
  let stateDirectory: string;

  beforeEach(async () => {
    stateDirectory = await mkdtemp(path.join(tmpdir(), "sol-store-test-"));
    vi.stubEnv("EBOOK_STORE_DRIVER", "local");
    vi.stubEnv("EBOOK_STATE_DIR", stateDirectory);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(stateDirectory, { recursive: true, force: true });
  });

  it("applies sequential updates in order", async () => {
    // Given
    const base = emptyState();

    // When
    await updateState(() => ({ ...base, version: 1 }));
    const now = new Date().toISOString();
    await updateState((state) => ({
      ...state,
      operations: [{ id: "op-1", direction: "테스트", resources: [], createdAt: now, updatedAt: now, status: "insight_queued" }],
    }));

    // Then
    const state = await readState();
    expect(state.operations).toHaveLength(1);
    expect(state.operations[0]?.id).toBe("op-1");
  });

  it("recovers the queue after a transform throws, instead of failing every later update", async () => {
    // Given — 승인 더블클릭처럼 transform이 던지는 상황
    await expect(updateState(() => { throw new Error("검수 중인 최신 완성본만 승인할 수 있습니다."); }))
      .rejects.toThrow("검수 중인 최신 완성본만 승인할 수 있습니다.");

    // When — 다음 갱신은 정상 실행되어야 한다
    const now = new Date().toISOString();
    const result = await updateState((state) => ({
      ...state,
      jobs: [{ id: "job-1", operationId: "op-1", type: "isbn", status: "queued", createdAt: now, updatedAt: now }],
    }));

    // Then
    expect(result.jobs).toHaveLength(1);
    expect((await readState()).jobs[0]?.id).toBe("job-1");
  });

  it("propagates the original error to the failing caller only", async () => {
    // Given
    const failing = updateState(() => { throw new Error("고의 실패"); });
    const succeeding = failing.catch(() => updateState((state) => state));

    // Then
    await expect(failing).rejects.toThrow("고의 실패");
    await expect(succeeding).resolves.toBeDefined();
  });
});
