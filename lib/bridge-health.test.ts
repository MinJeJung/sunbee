import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { classifyBridgeHealth, readBridgeHealth, runningJobCount, type BridgeHealth } from "@/lib/bridge-health";

const NOW = Date.parse("2026-07-20T09:00:00.000Z");

function health(lastPollAgoMs: number, running: Record<string, number> = {}): BridgeHealth {
  return {
    pid: 1234,
    startedAt: new Date(NOW - 60 * 60_000).toISOString(),
    lastPollAt: new Date(NOW - lastPollAgoMs).toISOString(),
    running,
    totalClaimed: 5,
    totalCompleted: 3,
    totalFailed: 1,
  };
}

describe("classifyBridgeHealth", () => {
  it("최근 신호는 fresh", () => {
    expect(classifyBridgeHealth(health(10_000), NOW)).toBe("fresh");
  });

  it("5분 초과 무신호는 stale", () => {
    expect(classifyBridgeHealth(health(6 * 60_000), NOW)).toBe("stale");
  });

  it("15분 초과 무신호는 dead", () => {
    expect(classifyBridgeHealth(health(16 * 60_000), NOW)).toBe("dead");
  });

  it("파일 없음(null)은 dead", () => {
    expect(classifyBridgeHealth(null, NOW)).toBe("dead");
  });

  it("깨진 타임스탬프는 dead", () => {
    expect(classifyBridgeHealth({ ...health(0), lastPollAt: "invalid" }, NOW)).toBe("dead");
  });
});

describe("runningJobCount", () => {
  it("타입별 실행 수를 합산한다", () => {
    expect(runningJobCount(health(0, { book_build: 2, isbn: 1 }))).toBe(3);
    expect(runningJobCount(health(0))).toBe(0);
    expect(runningJobCount(null)).toBe(0);
  });
});

describe("readBridgeHealth", () => {
  let directory: string;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("정상 파일을 읽는다", async () => {
    directory = await mkdtemp(path.join(tmpdir(), "bridge-health-"));
    await writeFile(path.join(directory, "bridge-health.json"), JSON.stringify(health(0, { book_build: 1 })), "utf8");
    const value = await readBridgeHealth(directory);
    expect(value?.pid).toBe(1234);
    expect(runningJobCount(value)).toBe(1);
  });

  it("파일이 없으면 null", async () => {
    directory = await mkdtemp(path.join(tmpdir(), "bridge-health-"));
    expect(await readBridgeHealth(directory)).toBeNull();
  });

  it("손상된 JSON이면 null", async () => {
    directory = await mkdtemp(path.join(tmpdir(), "bridge-health-"));
    await writeFile(path.join(directory, "bridge-health.json"), "{broken", "utf8");
    expect(await readBridgeHealth(directory)).toBeNull();
  });
});
