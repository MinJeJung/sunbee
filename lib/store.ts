import "server-only";

import { get, put } from "@vercel/blob";
import { access, copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createGcsStateObjectStore, readVersionedState, updateVersionedState, type VersionedStateObjectStore } from "@/lib/gcs-state-store";
import { emptyState, type DashboardState } from "@/lib/types";
import { VercelBlobStateObjectStore } from "@/lib/vercel-blob-state-store";

function localPath() {
  return path.join(process.env["EBOOK_STATE_DIR"] ?? path.join(process.cwd(), "data"), "state.json");
}
const blobPath = "state/dashboard.json";
let writeQueue: Promise<void> = Promise.resolve();
let gcsStore: VersionedStateObjectStore | undefined;

function storeDriver(): "local" | "blob" | "gcs" {
  if (process.env["EBOOK_STORE_DRIVER"] === "gcs") return "gcs";
  if (process.env["EBOOK_STORE_DRIVER"] === "blob" && process.env["BLOB_READ_WRITE_TOKEN"]) return "blob";
  return "local";
}

function versionedStore(): VersionedStateObjectStore {
  gcsStore ??= storeDriver() === "gcs" ? createGcsStateObjectStore() : new VercelBlobStateObjectStore();
  return gcsStore;
}

export function usesLocalStore() {
  return storeDriver() === "local";
}

export function usesCloudStore() {
  return storeDriver() !== "local";
}

export async function readState(): Promise<DashboardState> {
  const driver = storeDriver();
  if (driver !== "local") return readVersionedState(versionedStore());
  if (driver === "local") {
    try { return hydrateOperationPaths(JSON.parse(await readFile(localPath(), "utf8")) as DashboardState); }
    catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return emptyState();
      throw error;
    }
  }
  const result = await get(blobPath, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return emptyState();
  return hydrateOperationPaths(JSON.parse(await new Response(result.stream).text()) as DashboardState);
}

async function hydrateOperationPaths(state: DashboardState): Promise<DashboardState> {
  const operations = await Promise.all(state.operations.map(async (operation) => {
    if (!operation.artifact) return operation;
    const bookDirectory = operation.bookDirectory ?? path.dirname(path.resolve(operation.artifact.epubArtifactId));
    const metaPath = operation.metaPath ?? path.join(bookDirectory, "_meta.md");
    const metadataState = await access(metaPath).then(() => "ready" as const, () => "missing" as const);
    return { ...operation, bookDirectory, metaPath, metadataState };
  }));
  return { ...state, operations };
}

async function writeState(state: DashboardState) {
  const driver = storeDriver();
  if (driver === "gcs") throw new TypeError("GCS 상태는 updateVersionedState로만 갱신할 수 있습니다.");
  if (driver === "local") {
    const target = localPath();
    await mkdir(path.dirname(target), { recursive: true });
    // 2026-07-16 operations 전체 유실 사고 이후 안전장치:
    // 매 쓰기 직전 직전본을 .prev로 보존하고, 대량 소거가 감지되면 포렌식 사본을 남긴다.
    try {
      const previous = JSON.parse(await readFile(target, "utf8")) as DashboardState;
      await copyFile(target, `${target}.prev`);
      const dropped = (previous.operations?.length ?? 0) > 0 && (state.operations?.length ?? 0) === 0;
      if (dropped) {
        const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
        await copyFile(target, `${target}.wiped-${stamp}`);
        console.error(`⚠️ operations ${previous.operations.length}건 → 0건 소거 감지 — 직전본을 ${target}.wiped-${stamp}에 보존했습니다.`);
      }
    } catch {
      // 첫 쓰기(파일 없음) 또는 직전본 손상 — 백업 없이 진행
    }
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2), "utf8");
    await rename(temporary, target);
    return;
  }
  await put(blobPath, JSON.stringify(state), { access: "private", allowOverwrite: true, contentType: "application/json" });
}

export async function updateState(transform: (state: DashboardState) => DashboardState) {
  if (storeDriver() !== "local") return updateVersionedState(versionedStore(), transform);
  const task = writeQueue.then(async () => {
    const result = transform(await readState());
    await writeState(result);
    return result;
  });
  // 실패해도 큐 체인은 항상 복구 — rejected 체인이 이후 모든 갱신을 막지 않도록 한다.
  writeQueue = task.then(() => undefined, () => undefined);
  return task;
}
