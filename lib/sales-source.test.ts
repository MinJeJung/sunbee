import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadSalesHistory } from "@/lib/sales-source";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("전자책 정산 데이터 연결", () => {
  it("Given 고정 스냅샷 When 매출 이력을 읽으면 Then 파일 내용만으로 집계한다", async () => {
    const sourceRoot = await salesRoot();

    const result = await loadSalesHistory(sourceRoot, "2026-07-02", { sync: async () => undefined });

    expect(result.kind).toBe("ready");
    if (result.kind === "ready") expect(result.history.months[0]?.days[1]?.dailyTotal).toBe(50);
  });

  it("클라우드 동기화가 실패해도 마지막 로컬 스냅샷을 표시한다", async () => {
    const sourceRoot = await salesRoot();

    const result = await loadSalesHistory(sourceRoot, "2026-07-02", {
      sync: async () => { throw new Error("offline"); },
    });

    expect(result.kind).toBe("ready");
  });

  it("Given 잘못된 최신 스냅샷 When 매출 이력을 읽으면 Then 마지막 정상 스냅샷을 표시한다", async () => {
    const sourceRoot = await salesRoot();
    await writeFile(path.join(sourceRoot, "snapshots", "2026-07-03.json"), JSON.stringify({
      date: "2026-07-03",
      capturedAt: "잘못된 시간",
      ym: "2026-07",
      monthStart: "2026-07-01",
      today: "2026-07-03",
      platforms: { kyobo: 40, yes24: 20, aladin: 15, ridi: 15, millie: 10 },
      total: 200,
    }));

    const result = await loadSalesHistory(sourceRoot, "2026-07-03", { sync: async () => undefined });

    expect(result.kind).toBe("ready");
    if (result.kind === "ready") expect(result.history.latestDate).toBe("2026-07-02");
  });
});

async function salesRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "sales-source-"));
  temporaryRoots.push(root);
  const snapshots = path.join(root, "snapshots");
  await mkdir(snapshots);
  const base = { ym: "2026-07", monthStart: "2026-07-01", platforms: { kyobo: 40, yes24: 20, aladin: 15, ridi: 15, millie: 10 } };
  await Promise.all([
    writeFile(path.join(snapshots, "2026-07-01.json"), JSON.stringify({ ...base, date: "2026-07-01", today: "2026-07-01", total: 100 })),
    writeFile(path.join(snapshots, "2026-07-02.json"), JSON.stringify({ ...base, date: "2026-07-02", today: "2026-07-02", total: 150 })),
  ]);
  return root;
}
