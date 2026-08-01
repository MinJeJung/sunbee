import { execFile } from "node:child_process";
import { mkdir, rmdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

export const DEFAULT_CLOUD_SNAPSHOT_ROOT = "gs://minje-project-sunbee-ebook-settlement/ebook-settlement/state/data/snapshots";
export const DEFAULT_CLOUD_DISTRIBUTION_ROOT = "gs://minje-project-sunbee-ebook-settlement/ebook-settlement/state/data/distribution";
const DEFAULT_GCLOUD_PATH = "/Users/minje/.local/bin/gcloud";
const execFileAsync = promisify(execFile);
const lastSyncedAtByRoot = new Map<string, number>();
const syncsInFlight = new Map<string, Promise<void>>();
const SYNC_TTL_MS = 60_000;
const LOCK_STALE_MS = 120_000;

export type CloudSyncRunner = (
  executable: string,
  args: readonly string[],
) => Promise<unknown>;

export async function syncCloudSalesSnapshots(
  dataRoot: string,
  runner: CloudSyncRunner = runGcloud,
): Promise<void> {
  const lastSyncedAt = lastSyncedAtByRoot.get(dataRoot) ?? 0;
  if (Date.now() - lastSyncedAt < SYNC_TTL_MS) return;
  const currentSync = syncsInFlight.get(dataRoot);
  if (currentSync !== undefined) return currentSync;
  const sync = performCloudSync(dataRoot, runner);
  syncsInFlight.set(dataRoot, sync);
  try {
    await sync;
    lastSyncedAtByRoot.set(dataRoot, Date.now());
  } finally {
    syncsInFlight.delete(dataRoot);
  }
}

async function performCloudSync(
  dataRoot: string,
  runner: CloudSyncRunner,
): Promise<void> {
  const lockPath = path.join(dataRoot, ".cloud-sync-lock");
  if (!(await acquireLock(lockPath))) return;
  try {
    await performLockedCloudSync(dataRoot, runner);
  } finally {
    await rmdir(lockPath).catch((error: unknown) => {
      if (!hasErrorCode(error, "ENOENT")) throw error;
    });
  }
}

async function performLockedCloudSync(
  dataRoot: string,
  runner: CloudSyncRunner,
): Promise<void> {
  const salesDestination = path.join(dataRoot, "snapshots");
  const distributionDestination = path.join(dataRoot, "distribution");
  await Promise.all([
    mkdir(salesDestination, { recursive: true }),
    mkdir(distributionDestination, { recursive: true }),
  ]);
  await runner(DEFAULT_GCLOUD_PATH, [
    "storage",
    "rsync",
    DEFAULT_CLOUD_SNAPSHOT_ROOT,
    salesDestination,
    "--recursive",
    "--checksums-only",
  ]);
  await runner(DEFAULT_GCLOUD_PATH, [
    "storage",
    "rsync",
    DEFAULT_CLOUD_DISTRIBUTION_ROOT,
    distributionDestination,
    "--recursive",
    "--checksums-only",
  ]);
}

async function acquireLock(lockPath: string): Promise<boolean> {
  try {
    await mkdir(lockPath);
    return true;
  } catch (error) {
    if (!hasErrorCode(error, "EEXIST")) throw error;
    const details = await stat(lockPath).catch(() => null);
    if (details === null || Date.now() - details.mtimeMs <= LOCK_STALE_MS) return false;
    await rmdir(lockPath).catch((removeError: unknown) => {
      if (!hasErrorCode(removeError, "ENOENT")) throw removeError;
    });
    return acquireLock(lockPath);
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function runGcloud(executable: string, args: readonly string[]): Promise<void> {
  await execFileAsync(executable, [...args], { timeout: 30_000, maxBuffer: 1_048_576 });
}
