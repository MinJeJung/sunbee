import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const DISTRIBUTION_PLATFORM_KEYS = ["kyobo", "yes24", "ridi", "aladin", "millie"] as const;
export const DISTRIBUTION_PLATFORM_LABELS = {
  kyobo: "교보문고",
  yes24: "YES24",
  ridi: "리디",
  aladin: "알라딘",
  millie: "밀리의서재",
} as const;

const PlatformSummarySchema = z.object({
  covered: z.number().int().nonnegative(),
  live: z.number().int().nonnegative(),
  registered: z.number().int().nonnegative(),
  review: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
});
const DistributionSnapshotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  capturedAt: z.iso.datetime(),
  sourceCatalogGeneratedAt: z.string(),
  total: z.number().int().nonnegative(),
  uniqueBooks: z.number().int().nonnegative(),
  allFive: z.number().int().nonnegative(),
  attention: z.number().int().nonnegative(),
  platforms: z.object({
    kyobo: PlatformSummarySchema,
    yes24: PlatformSummarySchema,
    ridi: PlatformSummarySchema,
    aladin: PlatformSummarySchema,
    millie: PlatformSummarySchema,
  }),
});

export type DistributionSnapshot = z.infer<typeof DistributionSnapshotSchema>;
export type DistributionLoadResult =
  | { readonly kind: "ready"; readonly snapshot: DistributionSnapshot }
  | { readonly kind: "unavailable" };

export async function loadDistributionStatus(dataRoot: string): Promise<DistributionLoadResult> {
  try {
    const text = await readFile(path.join(dataRoot, "distribution", "latest.json"), "utf8");
    return { kind: "ready", snapshot: DistributionSnapshotSchema.parse(JSON.parse(text) as unknown) };
  } catch (error) {
    // 파일 부재(첫 동기화 대기)와 파싱·스키마 오류(고장)를 로그에서 구분한다.
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      console.error("유통 스냅샷 파싱 실패(고장 — 파일 형식 확인 필요):", error instanceof Error ? error.message : error);
    }
    return { kind: "unavailable" };
  }
}
