import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

// scripts/quality_refresh.py가 남기는 재감사 결과 파일의 리더.
// 파일이 없거나 손상돼도 대시보드는 죽지 않는다 — "아직 재감사 없음"으로 표시.
const auditSchema = z.object({
  slug: z.string(),
  title: z.string(),
  epub: z.string().nullable(),
  humanReviewStatus: z.string().nullable(),
  metrics: z.object({
    koreanNaturalness: z.number().nullable(),
    readerValue: z.number().nullable(),
    finalScore: z.number().nullable(),
    bodyChars: z.number().nullable(),
    tocStatus: z.string(),
    bodyTocPages: z.number().nullable(),
  }),
  reasons: z.array(z.string()),
  softReasons: z.array(z.string()),
});

const qualityRefreshSchema = z.object({
  generatedAt: z.string(),
  standards: z.object({
    min_naturalness: z.number(),
    min_reader_value: z.number(),
    min_body_chars: z.number(),
  }),
  scanned: z.number(),
  passed: z.number(),
  softPending: z.number(),
  candidates: z.array(auditSchema),
});

export type QualityRefreshReport = z.infer<typeof qualityRefreshSchema>;

export function qualityRefreshPath() {
  return path.join(process.env["EBOOK_STATE_DIR"] ?? path.join(process.cwd(), "data"), "quality-refresh.json");
}

export async function readQualityRefreshReport(): Promise<QualityRefreshReport | null> {
  let raw: string;
  try {
    raw = await readFile(qualityRefreshPath(), "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = qualityRefreshSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
