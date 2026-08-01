import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const SETTLEMENT_ROOT = "/Users/minje/Documents/Obsidian Vault/7_AI시스템/자동화프로젝트/sunbee-author-settlement";
export const SETTLEMENT_EXPORT_DIR = "/Users/minje/Documents/Obsidian Vault/6_정산및행정/정산/원천세_자료";

export const freelanceItemSchema = z.object({
  name: z.string().trim().min(1).max(40),
  gross: z.number().int().min(0).max(1_000_000_000),
  net: z.number().int().min(0).max(1_000_000_000),
  rrn: z.string().trim().max(20).optional(),
  bank: z.string().trim().max(30).optional(),
  account: z.string().trim().max(50).optional(),
  note: z.string().trim().max(300).optional(),
}).strict();
export type FreelanceItem = z.infer<typeof freelanceItemSchema>;

const aggregatedSchema = z.object({
  period: z.string(),
  settlementMonth: z.string().optional(),
  paymentDeadline: z.string().optional(),
  capturedAt: z.string().optional(),
  byAuthor: z.array(z.object({
    recipient: z.string(),
    email: z.string().optional(),
    totalSettlement: z.number().optional(),
    withholdingTax: z.number().optional(),
    netDeposit: z.number().optional(),
  }).loose()),
  totals: z.object({
    eligibleAuthors: z.number().optional(),
    eligibleSettlement: z.number().optional(),
    negativeAuthorCount: z.number().optional(),
  }).loose().optional(),
  negativeAuthors: z.array(z.unknown()).optional(),
}).loose();

export interface SettlementAuthor {
  recipient: string;
  totalSettlement: number;
  withholdingTax: number;
  netDeposit: number;
}

export interface SettlementRun {
  ym: string;
  aggregated: {
    paymentDeadline: string | null;
    capturedAt: string | null;
    authors: SettlementAuthor[];
    eligibleSettlement: number;
    negativeAuthorCount: number;
  } | null;
  aggregatedError: string | null;
  freelance: FreelanceItem[];
  exportFile: { name: string; updatedAt: string } | null;
}

export function maskRrn(rrn: string | undefined) {
  if (!rrn) return "";
  const compact = rrn.replaceAll(/\s/g, "");
  if (compact.length < 8) return "***";
  return `${compact.slice(0, 8)}******`;
}

export function exportFileName(ym: string) {
  const [year, month] = ym.split("-");
  return `원천세 자료_${year}년_${month}월.xlsx`;
}

export function runDirectory(ym: string) {
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new Error(`잘못된 정산 월: ${ym}`);
  return path.join(SETTLEMENT_ROOT, "data", "runs", ym);
}

export async function listSettlementMonths(): Promise<string[]> {
  try {
    const entries = await readdir(path.join(SETTLEMENT_ROOT, "data", "runs"), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}$/.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse();
  } catch (error) {
    console.error("정산 run 목록 읽기 실패:", error instanceof Error ? error.message : error);
    return [];
  }
}

export async function loadSettlementRun(ym: string): Promise<SettlementRun> {
  const directory = runDirectory(ym);
  let aggregated: SettlementRun["aggregated"] = null;
  let aggregatedError: string | null = null;
  try {
    const parsed = aggregatedSchema.parse(JSON.parse(await readFile(path.join(directory, "aggregated.json"), "utf8")));
    aggregated = {
      paymentDeadline: parsed.paymentDeadline ?? null,
      capturedAt: parsed.capturedAt ?? null,
      authors: parsed.byAuthor.map((author) => ({
        recipient: author.recipient,
        totalSettlement: Math.round(author.totalSettlement ?? 0),
        withholdingTax: Math.round(author.withholdingTax ?? 0),
        netDeposit: Math.round(author.netDeposit ?? 0),
      })),
      eligibleSettlement: Math.round(parsed.totals?.eligibleSettlement ?? 0),
      negativeAuthorCount: parsed.totals?.negativeAuthorCount ?? (parsed.negativeAuthors?.length ?? 0),
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      aggregatedError = "aggregated.json 없음 — 이 달의 정산 수집(build_settlement)이 아직 실행되지 않았습니다.";
    } else {
      aggregatedError = `aggregated.json 파싱 실패: ${error instanceof Error ? error.message : String(error)}`;
      console.error("정산 집계 파싱 실패:", aggregatedError);
    }
  }

  let freelance: FreelanceItem[] = [];
  try {
    const raw = JSON.parse(await readFile(path.join(directory, "freelance_input.json"), "utf8")) as unknown;
    if (Array.isArray(raw)) {
      freelance = raw.flatMap((item) => {
        const parsed = freelanceItemSchema.loose().safeParse(item);
        return parsed.success ? [freelanceItemSchema.parse({ ...parsed.data })] : [];
      });
    }
  } catch {
    // 파일 없음 = 아직 입력 전
  }

  let exportFile: SettlementRun["exportFile"] = null;
  try {
    const fileStat = await stat(path.join(SETTLEMENT_EXPORT_DIR, exportFileName(ym)));
    exportFile = { name: exportFileName(ym), updatedAt: fileStat.mtime.toISOString() };
  } catch {
    // 아직 생성 전
  }

  return { ym, aggregated, aggregatedError, freelance, exportFile };
}
