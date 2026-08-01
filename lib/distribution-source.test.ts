import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadDistributionStatus } from "@/lib/distribution-source";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("전자책 유통현황 데이터", () => {
  it("n8n Cloud Run이 만든 최신 유통현황 스냅샷을 읽는다", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "distribution-source-"));
    temporaryRoots.push(root);
    const distributionRoot = path.join(root, "distribution");
    await mkdir(distributionRoot);
    const summary = { covered: 242, live: 242, registered: 0, review: 0, missing: 0 };
    await writeFile(path.join(distributionRoot, "latest.json"), JSON.stringify({
      date: "2026-07-14",
      capturedAt: "2026-07-14T12:00:00.000Z",
      sourceCatalogGeneratedAt: "2026-07-14T18:39:07+09:00",
      total: 242,
      uniqueBooks: 242,
      allFive: 200,
      attention: 42,
      platforms: { kyobo: summary, yes24: summary, ridi: summary, aladin: summary, millie: summary },
    }));

    const result = await loadDistributionStatus(root);

    expect(result.kind).toBe("ready");
    if (result.kind === "ready") expect(result.snapshot.total).toBe(242);
  });
});
