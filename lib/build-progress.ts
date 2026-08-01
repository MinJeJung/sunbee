import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Operation } from "@/lib/types";

// 제작 프롬프트(bridge/run.ts)와 1:1로 맞춰야 하는 단계 정의 — 순서·percent를 바꾸면 양쪽 모두 수정할 것.
export const BUILD_STAGES = [
  { stage: "research", percent: 8, label: "자료 리서치" },
  { stage: "outline", percent: 15, label: "목차 설계" },
  { stage: "chapter1", percent: 24, label: "본문 집필 1/5" },
  { stage: "chapter2", percent: 33, label: "본문 집필 2/5" },
  { stage: "chapter3", percent: 42, label: "본문 집필 3/5" },
  { stage: "chapter4", percent: 51, label: "본문 집필 4/5" },
  { stage: "chapter5", percent: 60, label: "본문 집필 5/5" },
  { stage: "fact_check", percent: 70, label: "팩트체크" },
  { stage: "quality_gate", percent: 78, label: "품질 게이트" },
  { stage: "cover", percent: 86, label: "표지 제작" },
  { stage: "epub", percent: 93, label: "EPUB 빌드" },
  { stage: "final_meta", percent: 97, label: "메타·최종 검증" },
] as const;

export const APPROVAL_SOON_PERCENT = 86;

const eventSchema = z.object({
  stage: z.string().min(1).max(40),
  percent: z.number().min(0).max(100),
  note: z.string().max(300).optional(),
  at: z.string().max(40).optional(),
}).loose();

export interface BuildProgress {
  percent: number;
  label: string;
  note?: string;
  at?: string;
}

export function progressDirectory() {
  return path.join(process.env["EBOOK_STATE_DIR"] ?? path.join(process.cwd(), "data"), "progress");
}

export function progressFilePath(operationId: string, directory = progressDirectory()) {
  return path.join(directory, `${operationId}.jsonl`);
}

export async function readBuildProgress(operationId: string, directory = progressDirectory()): Promise<BuildProgress | null> {
  let text: string;
  try {
    text = await readFile(progressFilePath(operationId, directory), "utf8");
  } catch {
    return null;
  }
  let best: BuildProgress | null = null;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const parsed = eventSchema.safeParse(raw);
    if (!parsed.success) continue;
    const stageInfo = BUILD_STAGES.find((candidate) => candidate.stage === parsed.data.stage);
    const percent = Math.min(99, Math.max(0, Math.round(parsed.data.percent)));
    if (!best || percent >= best.percent) {
      best = {
        percent,
        label: stageInfo?.label ?? parsed.data.stage,
        ...(parsed.data.note ? { note: parsed.data.note } : {}),
        ...(parsed.data.at ? { at: parsed.data.at } : {}),
      };
    }
  }
  return best;
}

export async function readBuildProgressMap(operations: readonly Operation[], directory = progressDirectory()) {
  const targets = operations.filter((operation) => operation.status === "building");
  const entries = await Promise.all(targets.map(async (operation) =>
    [operation.id, await readBuildProgress(operation.id, directory)] as const));
  return Object.fromEntries(entries.filter((entry): entry is [string, BuildProgress] => entry[1] !== null));
}
