import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CLOUD_DISTRIBUTION_ROOT,
  DEFAULT_CLOUD_SNAPSHOT_ROOT,
  syncCloudSalesSnapshots,
} from "@/lib/sales-cloud-sync";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("클라우드 정산 스냅샷 동기화", () => {
  it("GCS의 일별 스냅샷을 로컬 자동화 데이터 폴더로 동기화한다", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "sales-cloud-sync-"));
    temporaryRoots.push(dataRoot);
    const runner = vi.fn().mockResolvedValue(undefined);

    await syncCloudSalesSnapshots(dataRoot, runner);

    expect(runner).toHaveBeenCalledTimes(2);
    expect(runner).toHaveBeenNthCalledWith(
      1,
      "/Users/minje/.local/bin/gcloud",
      [
        "storage",
        "rsync",
        DEFAULT_CLOUD_SNAPSHOT_ROOT,
        path.join(dataRoot, "snapshots"),
        "--recursive",
        "--checksums-only",
      ],
    );
    expect(runner).toHaveBeenNthCalledWith(
      2,
      "/Users/minje/.local/bin/gcloud",
      [
        "storage",
        "rsync",
        DEFAULT_CLOUD_DISTRIBUTION_ROOT,
        path.join(dataRoot, "distribution"),
        "--recursive",
        "--checksums-only",
      ],
    );
  });

  it("월 전환 중에는 1분 안의 중복 클라우드 동기화를 생략한다", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "sales-cloud-sync-cache-"));
    temporaryRoots.push(dataRoot);
    const runner = vi.fn().mockResolvedValue(undefined);

    await syncCloudSalesSnapshots(dataRoot, runner);
    await syncCloudSalesSnapshots(dataRoot, runner);

    expect(runner).toHaveBeenCalledTimes(2);
  });
});
