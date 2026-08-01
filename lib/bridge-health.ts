import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

// 브리지(bridge/run.ts)가 폴링 루프마다 기록하는 heartbeat 파일.
// /api/health의 "포트가 응답한다"(liveness)와 달리, 이 파일은
// "제작 엔진이 실제로 살아서 전진 중인가"(progress)를 판단하는 근거다.
// 2026-07-19 밤 크래시 루프 사고(브리지 1,309회 재시작·작업 6,545회 중단)에서
// 감시 크론이 liveness만 보고 ok를 보고한 관측 공백을 메운다.
const bridgeHealthSchema = z.object({
  pid: z.number().int().positive(),
  startedAt: z.string(),
  lastPollAt: z.string(),
  running: z.record(z.string(), z.number()),
  totalClaimed: z.number().int().nonnegative(),
  totalCompleted: z.number().int().nonnegative(),
  totalFailed: z.number().int().nonnegative(),
}).loose();

export type BridgeHealth = z.infer<typeof bridgeHealthSchema>;
export type BridgeHealthState = "fresh" | "stale" | "dead";

export const BRIDGE_HEALTH_FILENAME = "bridge-health.json";
// 폴링 주기(기본 4초) 대비 넉넉한 한도 — 5분 무신호면 지연, 15분이면 중단으로 본다.
const STALE_MS = 5 * 60_000;
const DEAD_MS = 15 * 60_000;

function defaultDirectory() {
  return process.env["EBOOK_STATE_DIR"] ?? path.join(process.cwd(), "data");
}

export function bridgeHealthPath(directory = defaultDirectory()) {
  return path.join(directory, BRIDGE_HEALTH_FILENAME);
}

export async function readBridgeHealth(directory = defaultDirectory()): Promise<BridgeHealth | null> {
  let raw: string;
  try {
    raw = await readFile(bridgeHealthPath(directory), "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = bridgeHealthSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function classifyBridgeHealth(health: BridgeHealth | null, nowMs = Date.now()): BridgeHealthState {
  if (!health) return "dead";
  const age = nowMs - Date.parse(health.lastPollAt);
  if (Number.isNaN(age) || age > DEAD_MS) return "dead";
  return age > STALE_MS ? "stale" : "fresh";
}

export function runningJobCount(health: BridgeHealth | null): number {
  if (!health) return 0;
  return Object.values(health.running).reduce((total, count) => total + count, 0);
}
