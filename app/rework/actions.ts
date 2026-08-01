"use server";

import { spawn } from "node:child_process";
import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { isSafeSlug, REWORK_PLATFORMS, REWORK_STAGES, reworkStatePath, runInfoOf, type ReworkStage, type ReworkStateEntry } from "@/lib/platform-rework";
import { readState } from "@/lib/store";

export async function setReworkStageAction(formData: FormData) {
  if (!(await isAuthenticated())) redirect("/login");
  const fields = z.object({
    platform: z.enum(REWORK_PLATFORMS),
    id: z.string().min(1).max(200),
    stage: z.enum(REWORK_STAGES),
  }).parse({ platform: formData.get("platform"), id: formData.get("id"), stage: formData.get("stage") });

  const filePath = reworkStatePath();
  let state: Record<string, { stage: ReworkStage; updatedAt: string }> = {};
  try {
    state = JSON.parse(await readFile(filePath, "utf8")) as typeof state;
  } catch {
    // 첫 저장
  }
  state[`${fields.platform}:${fields.id}`] = { stage: fields.stage, updatedAt: new Date().toISOString() };
  await writeReworkState(state);
  revalidatePath("/dashboard");
  redirect("/dashboard#rework");
}

async function writeReworkState(state: Record<string, ReworkStateEntry>) {
  const filePath = reworkStatePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2), "utf8");
  await rename(temporary, filePath);
}

async function readReworkState(): Promise<Record<string, ReworkStateEntry>> {
  try {
    return JSON.parse(await readFile(reworkStatePath(), "utf8")) as Record<string, ReworkStateEntry>;
  } catch {
    return {};
  }
}

/** 검수 승인된 밀리 반려 도서를 실제로 재제출한다 — dispatch.py <slug> millie 를 detached 실행. */
export async function executeMillieResubmitAction(formData: FormData) {
  if (!(await isAuthenticated())) redirect("/login");
  const fields = z.object({
    code: z.string().regex(/^\d{5,12}$/),
    slug: z.string().min(1).max(200),
  }).parse({ code: formData.get("code"), slug: formData.get("slug") });
  if (!isSafeSlug(fields.slug)) throw new Error("잘못된 슬러그입니다.");

  const state = await readReworkState();
  const key = `millie:${fields.code}`;
  const entry = state[key];
  if (entry?.stage !== "approved") throw new Error("검수 승인된 도서만 재제출을 실행할 수 있습니다.");
  // 밀리 CMS는 단일 세션 — 어떤 책이든 실행 중이면 새 실행 금지
  const someoneRunning = Object.entries(state).some(([stateKey, candidate]) =>
    stateKey.startsWith("millie:") && runInfoOf(candidate).runStatus === "running");
  if (someoneRunning) throw new Error("다른 도서의 밀리 재제출이 실행 중입니다 — 완료 후 다시 시도해 주세요.");
  // 통합 재유통은 SEOJI(ISBN 신청)·플랫폼 CMS 세션을 쓴다 — 브리지의 신간 ISBN·유통 작업과 동시 실행 금지
  const bridgeBusy = (await readState()).jobs.some((job) =>
    job.status === "claimed" && (job.type === "isbn" || job.type === "distribution"));
  if (bridgeBusy) throw new Error("신간 ISBN 신청 또는 5사 유통 작업이 진행 중입니다 — 끝난 뒤 다시 시도해 주세요 (세션 충돌 방지).");

  const now = new Date().toISOString();
  state[key] = { ...entry, run: { status: "running", at: now }, updatedAt: now };
  await writeReworkState(state);

  const logDirectory = path.join(process.cwd(), "data", "resubmit-logs");
  await mkdir(logDirectory, { recursive: true });
  const logFile = path.join(logDirectory, `millie_${fields.code}.log`);
  const logHandle = await open(logFile, "a");
  const child = spawn("/bin/zsh", [
    path.join(process.cwd(), "resubmit_millie.zsh"),
    fields.slug, fields.code, reworkStatePath(), logFile,
  ], { detached: true, stdio: ["ignore", logHandle.fd, logHandle.fd] });
  child.unref();
  await logHandle.close();

  revalidatePath("/dashboard");
  redirect("/dashboard#rework");
}
