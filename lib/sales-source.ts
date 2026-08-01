import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { aggregateSalesHistory, parseSalesSnapshot, type SalesHistory } from "@/lib/sales-domain";
import { syncCloudSalesSnapshots } from "@/lib/sales-cloud-sync";

export const DEFAULT_SALES_DATA_ROOT = "/Users/minje/Documents/Obsidian Vault/7_AI시스템/자동화프로젝트/ebook-sales-dashboard/data";
export function salesDataRoot(): string {
  if (process.env["SALES_DATA_ROOT"]?.trim()) return process.env["SALES_DATA_ROOT"].trim();
  return ["gcs", "blob"].includes(process.env["EBOOK_STORE_DRIVER"] ?? "")
    ? path.join(process.cwd(), "data", "sales")
    : DEFAULT_SALES_DATA_ROOT;
}
const KST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type SalesLoadResult =
  | { readonly kind: "ready"; readonly history: SalesHistory }
  | { readonly kind: "unavailable"; readonly reason: string };

type SalesLoadOptions = {
  readonly sync?: (dataRoot: string) => Promise<void>;
};

let lastSyncError = "";
let lastSyncErrorAt = 0;

export async function loadSalesHistory(
  dataRoot: string,
  currentDate: string,
  options: SalesLoadOptions = {},
): Promise<SalesLoadResult> {
  const logSyncFailure = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== lastSyncError || Date.now() - lastSyncErrorAt > 600_000) {
      console.error("클라우드 판매 스냅샷 동기화 실패(마지막 성공 데이터로 계속):", message);
      lastSyncError = message;
      lastSyncErrorAt = Date.now();
    }
    return undefined;
  };
  if (options.sync) {
    await options.sync(dataRoot).catch(logSyncFailure);
  } else {
    // 렌더를 gcloud 완료에 묶지 않는다 — 디스크 데이터를 즉시 서빙하고 동기화는 백그라운드로.
    // 갱신분은 다음 렌더(60초 자동 확인 또는 수동 새로고침)에 반영된다.
    void syncCloudSalesSnapshots(dataRoot).catch(logSyncFailure);
  }
  try {
    const snapshotRoot = path.join(dataRoot, "snapshots");
    const reconciliationPath = path.join(dataRoot, "slack_reconciliations.json");
    const [snapshotResult, reconciliations] = await Promise.all([
      readSnapshots(snapshotRoot),
      readReconciliations(reconciliationPath).catch((error: unknown) => {
        if (hasErrorCode(error, "ENOENT")) return [];
        console.error("Slack 보강 데이터 읽기 실패(보강 없이 계속):", error instanceof Error ? error.message : error);
        return [];
      }),
    ]);
    if (snapshotResult.invalid.length > 0) {
      console.warn("매출 스냅샷 일부 제외", snapshotResult.invalid);
    }
    const byDate = new Map(snapshotResult.snapshots.map((snapshot) => [snapshot.date, snapshot]));
    for (const snapshot of reconciliations) byDate.set(snapshot.date, snapshot);
    return { kind: "ready", history: aggregateSalesHistory([...byDate.values()], currentDate) };
  } catch (error) {
    if (error instanceof Error) return { kind: "unavailable", reason: error.message };
    throw error;
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function readReconciliations(filePath: string) {
  const contents = await readFile(filePath, "utf8");
  const decoded: unknown = JSON.parse(contents);
  if (!Array.isArray(decoded)) throw new TypeError("Slack 보강 데이터는 배열이어야 합니다.");
  return decoded.map(parseSalesSnapshot);
}

async function readSnapshots(root: string) {
  const entries = await readdir(root, { withFileTypes: true });
  const filenames = entries
    .filter((entry) => entry.isFile() && /^\d{4}-\d{2}-\d{2}\.json$/.test(entry.name))
    .map((entry) => entry.name)
    .toSorted();
  const results = await Promise.all(filenames.map(async (filename) => {
    try {
      const contents = await readFile(path.join(root, filename), "utf8");
      const decoded: unknown = JSON.parse(contents);
      return { kind: "ready" as const, snapshot: parseSalesSnapshot(decoded) };
    } catch (error) {
      return {
        kind: "invalid" as const,
        filename,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }));
  return {
    snapshots: results.flatMap((result) => result.kind === "ready" ? [result.snapshot] : []),
    invalid: results.flatMap((result) => result.kind === "invalid"
      ? [{ filename: result.filename, reason: result.reason }]
      : []),
  };
}

export function todayInKst(now = new Date()): string {
  const parts = KST_DATE_FORMATTER.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError("KST 날짜를 계산할 수 없습니다.");
  }
  return `${year}-${month}-${day}`;
}
