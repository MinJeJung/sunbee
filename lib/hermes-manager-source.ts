import "server-only";

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z, type ZodType } from "zod";
import { catalogStats, readCatalog } from "@/lib/catalog";
import { buildHermesManagerSnapshot, type HermesManagerInput, type HermesManagerSnapshot } from "@/lib/hermes-manager-domain";
import { readLiveCatalog } from "@/lib/live-catalog";
import { loadSalesHistory, salesDataRoot, todayInKst } from "@/lib/sales-source";
import { readState } from "@/lib/store";
import type { DashboardState } from "@/lib/types";

const ACTIVE_PRODUCTION_STATUSES = new Set(["insight_queued", "insight_processing", "building", "revision_requested"]);

export function activeProductionCount(state: DashboardState) {
  return state.operations.filter((operation) => ACTIVE_PRODUCTION_STATUSES.has(operation.status)).length;
}

const GatewayStateSchema = z.object({
  pid: z.number().nullable().optional(),
  gateway_state: z.string(),
  platforms: z.object({
    slack: z.object({ state: z.string() }),
  }),
  updated_at: z.string().nullable(),
});

const CronJobsSchema = z.object({
  jobs: z.array(z.object({
    name: z.string(),
    enabled: z.boolean(),
    last_status: z.enum(["ok", "error"]).nullable(),
    last_run_at: z.string().nullable(),
    next_run_at: z.string().nullable(),
  })),
});

const ManualSummarySchema = z.object({
  manualUpdate: z.boolean().optional(),
  date: z.string().optional(),
}).loose();

type HermesManagerReadOptions = {
  readonly state?: DashboardState;
  readonly distributionAttention?: number;
  readonly now?: Date;
};

export async function readHermesManagerSnapshot(options: HermesManagerReadOptions = {}): Promise<HermesManagerSnapshot> {
  const now = options.now ?? new Date();
  const currentDate = todayInKst(now);
  const hermesHome = process.env["HERMES_HOME"]?.trim() || path.join(homedir(), ".hermes");
  const salesRoot = salesDataRoot();
  const [state, gateway, cron, salesResult, manualSummary] = await Promise.all([
    options.state === undefined ? readState() : Promise.resolve(options.state),
    readExternalJson(GatewayStateSchema, path.join(hermesHome, "gateway_state.json")),
    readExternalJson(CronJobsSchema, path.join(hermesHome, "cron", "jobs.json")),
    loadSalesHistory(salesRoot, currentDate, { sync: async () => undefined }),
    readExternalJson(ManualSummarySchema, path.join(salesRoot, "last_summary.json")),
  ]);
  const distributionAttention = options.distributionAttention ?? await readDistributionAttention(state);
  const latestMonth = salesResult.kind === "ready" ? salesResult.history.months.at(0) : undefined;
  const latestDay = latestMonth?.days.at(-1);
  const sales: HermesManagerInput["sales"] = salesResult.kind === "ready" && latestMonth !== undefined
    ? {
      latestDate: salesResult.history.latestDate,
      cumulativeTotal: latestMonth.total,
      dailyTotal: latestDay?.dailyTotal ?? null,
      isCurrent: salesResult.history.latestDate === currentDate,
      isManual: manualSummary?.manualUpdate === true && manualSummary?.date === currentDate,
      sourceState: salesResult.history.sourceState,
    }
    : null;
  const cronJobs: HermesManagerInput["cronJobs"] = (cron?.jobs ?? []).map((job) => ({
    name: job.name,
    enabled: job.enabled,
    lastStatus: job.last_status ?? "never",
    lastRunAt: job.last_run_at,
    nextRunAt: job.next_run_at,
  }));

  // gateway_state.json의 updated_at은 연결 이벤트 때만 갱신된다 — 실시간 표시는
  // 프로세스 생사 확인 + heartbeat 크론 최근 실행 시각 중 가장 최신 신호를 쓴다.
  const heartbeatAt = cron?.jobs.find((job) => job.name === "heartbeat" && job.enabled && job.last_status === "ok")?.last_run_at ?? null;
  return buildHermesManagerSnapshot({
    capturedAt: now.toISOString(),
    gateway: gateway === null ? null : {
      isRunning: gateway.gateway_state === "running" && processIsAlive(gateway.pid),
      isSlackConnected: gateway.platforms.slack.state === "connected",
      updatedAt: latestIso(gateway.updated_at, heartbeatAt),
    },
    cronJobs,
    sales,
    production: {
      active: activeProductionCount(state),
      review: state.operations.filter((operation) => operation.status === "awaiting_review").length,
      failed: state.operations.filter((operation) => operation.status === "failed").length,
      distributionAttention,
    },
    recovery: recoveryStatus(state),
  });
}

function recoveryStatus(state: DashboardState): HermesManagerInput["recovery"] {
  const latestRecords = state.operations.flatMap((operation) => operation.recoveryHistory?.slice(-1) ?? []);
  const latest = latestRecords.sort((left, right) => Date.parse(right.at) - Date.parse(left.at)).at(0);
  const recovering = state.operations.filter((operation) => {
    const record = operation.recoveryHistory?.at(-1);
    return record?.action === "retry" && ["insight_queued", "insight_processing", "building", "revision_requested"].includes(operation.status);
  }).length;
  const blocked = state.operations.filter((operation) => operation.status === "failed" && operation.recoveryHistory?.at(-1)?.action === "blocked").length;
  return {
    attempts: state.operations.reduce((total, operation) => total + (operation.recoveryAttempts ?? 0), 0),
    recovering,
    blocked,
    lastAt: latest?.at ?? null,
    lastSummary: latest?.summary ?? null,
  };
}

async function readDistributionAttention(state: DashboardState): Promise<number> {
  const catalog = await readCatalog();
  const books = await readLiveCatalog(catalog.books, state.operations);
  return catalogStats(books).actionRequired;
}

function processIsAlive(pid: number | null | undefined): boolean {
  // pid가 기록되지 않은 옛 포맷이면 파일의 상태 값을 그대로 신뢰한다.
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

function latestIso(...values: readonly (string | null)[]): string | null {
  const parsed = values.filter((value): value is string => value !== null && !Number.isNaN(Date.parse(value)));
  return parsed.toSorted((left, right) => Date.parse(right) - Date.parse(left)).at(0) ?? null;
}

async function readExternalJson<T>(schema: ZodType<T>, filePath: string): Promise<T | null> {
  try {
    const decoded: unknown = JSON.parse(await readFile(filePath, "utf8"));
    return schema.parse(decoded);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) return null;
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}
