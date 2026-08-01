import { access, copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ky from "ky";
import { z } from "zod";
import { artifactFingerprint, mergeCloudReviewState, type LocalArtifactPaths } from "@/lib/cloud-sync";
import { dashboardStateSchema } from "@/lib/state-schema";
import type { DashboardState, Operation } from "@/lib/types";

const dashboardUrl = z.url().parse(process.env["CLOUD_DASHBOARD_URL"] ?? "https://sunbee-books-cloud-dashboard.vercel.app");
const bridgeToken = z.string().min(1).parse(process.env["CODEX_BRIDGE_TOKEN"]);
const statePath = path.resolve(process.env["LOCAL_EBOOK_STATE_PATH"] ?? path.join(os.homedir(), ".local/share/sol-ebook-publish-dashboard/data/state.json"));
const ebookRoot = path.resolve(process.env["LOCAL_EBOOK_ROOT"] ?? path.join(os.homedir(), "Documents/Obsidian Vault/3_출판 및 SNS/전자책원고"));
const cloudImportRoot = path.join(ebookRoot, "클라우드_완성본");

const snapshotSchema = z.object({
  generatedAt: z.iso.datetime(),
  state: dashboardStateSchema,
}).strict();

type ArtifactKind = "cover" | "epub" | "manuscript" | "meta";

function headers(): Readonly<Record<string, string>> {
  return { Authorization: `Bearer ${bridgeToken}` };
}

function localPaths(operationId: string): LocalArtifactPaths {
  const bookDirectory = path.join(cloudImportRoot, z.uuid().parse(operationId));
  return {
    operationId,
    bookDirectory,
    coverPath: path.join(bookDirectory, "cover.jpg"),
    epubPath: path.join(bookDirectory, "book.epub"),
    metaPath: path.join(bookDirectory, "_meta.md"),
  };
}

async function readState(): Promise<DashboardState> {
  return dashboardStateSchema.parse(JSON.parse(await readFile(statePath, "utf8")));
}

async function downloadArtifact(operationId: string, kind: ArtifactKind): Promise<Uint8Array> {
  const url = new URL(`/api/artifacts/${encodeURIComponent(operationId)}`, dashboardUrl);
  url.searchParams.set("kind", kind);
  const response = await ky.get(url, { headers: headers(), retry: 3, timeout: 120_000 });
  return new Uint8Array(await response.arrayBuffer());
}

function validateArtifacts(operation: Operation, artifacts: Readonly<Record<ArtifactKind, Uint8Array>>): void {
  if (!operation.artifact) throw new TypeError("클라우드 완성본 정보가 없습니다.");
  if (artifacts.cover.length < 1_000 || artifacts.cover[0] !== 0xff || artifacts.cover[1] !== 0xd8 || artifacts.cover[2] !== 0xff) {
    throw new TypeError(`${operation.id}: 표지 JPG가 손상되었습니다.`);
  }
  if (artifacts.epub.length < 1_000 || artifacts.epub[0] !== 0x50 || artifacts.epub[1] !== 0x4b) {
    throw new TypeError(`${operation.id}: EPUB 파일이 손상되었습니다.`);
  }
  if (artifacts.manuscript.length < 1_000 || artifacts.meta.length < 100) {
    throw new TypeError(`${operation.id}: 원고 또는 메타 파일이 비어 있습니다.`);
  }
  const fingerprint = artifactFingerprint(artifacts.cover, artifacts.epub);
  if (fingerprint !== operation.artifact.fingerprint) throw new TypeError(`${operation.id}: 산출물 지문이 일치하지 않습니다.`);
}

async function writeAtomic(target: string, body: Uint8Array): Promise<void> {
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, body, { mode: 0o600 });
  await rename(temporary, target);
}

async function artifactsExist(paths: LocalArtifactPaths): Promise<boolean> {
  const manuscriptPath = path.join(paths.bookDirectory, "manuscript.md");
  return Promise.all([paths.coverPath, paths.epubPath, paths.metaPath, manuscriptPath].map((target) => access(target).then(() => true, () => false)))
    .then((results) => results.every(Boolean));
}

async function syncOperation(operation: Operation): Promise<LocalArtifactPaths> {
  const paths = localPaths(operation.id);
  if (await artifactsExist(paths)) return paths;
  await mkdir(paths.bookDirectory, { recursive: true, mode: 0o700 });
  const [cover, epub, manuscript, meta] = await Promise.all([
    downloadArtifact(operation.id, "cover"),
    downloadArtifact(operation.id, "epub"),
    downloadArtifact(operation.id, "manuscript"),
    downloadArtifact(operation.id, "meta"),
  ]);
  const artifacts = { cover, epub, manuscript, meta };
  validateArtifacts(operation, artifacts);
  await Promise.all([
    writeAtomic(paths.coverPath, cover),
    writeAtomic(paths.epubPath, epub),
    writeAtomic(path.join(paths.bookDirectory, "manuscript.md"), manuscript),
    writeAtomic(paths.metaPath, meta),
  ]);
  return paths;
}

async function main(): Promise<void> {
  const snapshot = snapshotSchema.parse(await ky.get(new URL("/api/cloud/sync", dashboardUrl), {
    headers: headers(), retry: 3, timeout: 30_000,
  }).json());
  const beforeDownloads = await readState();
  const localById = new Map(beforeDownloads.operations.map((operation) => [operation.id, operation]));
  const candidates = snapshot.state.operations.filter((operation) => {
    const local = localById.get(operation.id);
    return !local?.approvedFingerprint && !["isbn_processing", "isbn_applied", "distribution_processing", "completed"].includes(local?.status ?? "");
  });
  if (!candidates.length) {
    process.stdout.write("cloud-sync: no completed books to import\n");
    return;
  }

  const paths: LocalArtifactPaths[] = [];
  for (const operation of candidates) paths.push(await syncOperation(operation));
  const current = await readState();
  const merged = mergeCloudReviewState(current, snapshot.state.operations, paths);
  if (JSON.stringify(current) === JSON.stringify(merged)) {
    process.stdout.write("cloud-sync: local state already current\n");
    return;
  }
  await copyFile(statePath, `${statePath}.prev`);
  await writeAtomic(statePath, new TextEncoder().encode(JSON.stringify(merged, null, 2)));
  process.stdout.write(`cloud-sync: imported ${paths.length} completed book(s)\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`cloud-sync failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
