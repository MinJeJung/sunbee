import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DistributionPlatform, DistributionWorkflowResult, Operation } from "../lib/types";
import { assertTocTargets } from "./toc-gate";

const VAULT_ROOT = "/Users/minje/Documents/Obsidian Vault";
const BOOKS_ROOT = path.join(VAULT_ROOT, "3_출판 및 SNS", "전자책원고");
const DISTRIBUTION_ROOT = path.join(VAULT_ROOT, "7_AI시스템", "자동화프로젝트", "ebook-distribution-epub");
const DISTRIBUTION_PYTHON = path.join(DISTRIBUTION_ROOT, ".venv", "bin", "python");
const DISTRIBUTION_SCRIPT = path.join(DISTRIBUTION_ROOT, "dispatch.py");
const PREPARE_SCRIPT = path.join(import.meta.dirname, "prepare_distribution_epub.py");
const UV_BINARY = "/Users/minje/.local/bin/uv";
const READINESS_SCRIPT = "/Users/minje/.agents/skills/new-ebook-publish/scripts/epub_publish_readiness.py";
const PLATFORMS: readonly DistributionPlatform[] = ["kyobo", "yes24", "ridi", "aladin", "millie"];
const REGISTERED_STATUSES = new Set(["review", "live"]);

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runCommand(command: string, args: string[], cwd: string, timeoutMs: number, label: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }, 60_000).unref();
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-20_000);
      process.stderr.write(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${label} 실패(code=${code ?? "none"}, signal=${signal ?? "none"}): ${stderr.slice(-4_000)}`));
    });
  });
}

function bookDirectoryFor(operation: Operation) {
  if (!operation.artifact) throw new Error("5사 유통에 필요한 EPUB 산출물이 없습니다.");
  const bookDirectory = path.dirname(path.resolve(operation.artifact.epubArtifactId));
  const relative = path.relative(BOOKS_ROOT, bookDirectory);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("전자책원고 폴더 안의 승인된 도서만 유통할 수 있습니다.");
  }
  return { bookDirectory, bookSlug: path.basename(bookDirectory) };
}

function frontmatterValue(source: string, key: string) {
  const escaped = key.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`^${escaped}:\\s*(.*?)\\s*$`, "m"));
  return match?.[1]?.replace(/^(['"])(.*)\1$/, "$2").trim() ?? "";
}

export async function readDistributionPlatforms(metaPath: string): Promise<DistributionPlatform[]> {
  const source = await readFile(metaPath, "utf8");
  const incomplete = PLATFORMS.filter((platform) => !REGISTERED_STATUSES.has(frontmatterValue(source, `epub_dist_${platform}_status`)));
  if (incomplete.length) throw new Error(`5사 유통 결과 미완료: ${incomplete.join(", ")}`);
  return [...PLATFORMS];
}

async function readDistributionResult(metaPath: string, bookDirectory: string): Promise<DistributionWorkflowResult> {
  const source = await readFile(metaPath, "utf8");
  const epubName = frontmatterValue(source, "epub");
  const epubArtifactId = path.resolve(bookDirectory, epubName);
  if (!epubName || path.dirname(epubArtifactId) !== bookDirectory) throw new Error("유통 완료 EPUB 경로가 올바르지 않습니다.");
  return { status: "completed", platforms: await readDistributionPlatforms(metaPath), epubArtifactId };
}

export async function runDistributionWorkflow(operation: Operation): Promise<DistributionWorkflowResult> {
  const { bookDirectory, bookSlug } = bookDirectoryFor(operation);
  const metaPath = path.join(bookDirectory, "_meta.md");

  // 승인 이후 EPUB이 교체·재빌드됐을 수 있으므로 유통 직전 목차 링크를 재검증한다.
  // 본문 차례 페이지 의무화(requireBodyToc)는 신간 제작 게이트에만 적용 — 이전 형식
  // 재유통 도서까지 일괄 차단하지 않는다.
  await assertTocTargets(path.resolve(operation.artifact?.epubArtifactId ?? ""), { requireBodyToc: false });

  await runCommand(
    DISTRIBUTION_PYTHON,
    [PREPARE_SCRIPT, "--book-dir", bookDirectory],
    DISTRIBUTION_ROOT,
    5 * 60 * 1_000,
    "리디 호환 EPUB 준비",
  );

  await runCommand(
    UV_BINARY,
    ["run", READINESS_SCRIPT, "--book-dir", bookDirectory, "--stage", "all"],
    VAULT_ROOT,
    10 * 60 * 1_000,
    "5사 유통 사전검사",
  );

  let lastError: unknown;
  for (let round = 1; round <= 3; round += 1) {
    try {
      await runCommand(
        DISTRIBUTION_PYTHON,
        [DISTRIBUTION_SCRIPT, bookSlug, "all", "--headless", "--allow-applied-isbn"],
        DISTRIBUTION_ROOT,
        90 * 60 * 1_000,
        `5사 유통 ${round}차`,
      );
      return await readDistributionResult(metaPath, bookDirectory);
    } catch (error) {
      lastError = error;
      if (round < 3) {
        console.error(`5사 유통 ${round}차 미완료, 성공 플랫폼은 유지하고 잔여 플랫폼을 재시도합니다.`);
        await delay(round * 30_000);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("5사 유통을 3회 시도했지만 완료하지 못했습니다.");
}
