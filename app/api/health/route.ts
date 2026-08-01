import { NextResponse } from "next/server";
import { classifyBridgeHealth, readBridgeHealth, runningJobCount } from "@/lib/bridge-health";
import { readState, usesCloudStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// liveness("포트가 응답한다")에 더해 identity(instanceId)와 progress(브리지 heartbeat)를
// 함께 반환한다. instanceId는 run-dashboard.zsh가 "응답한 서버가 자기 자식인지"를
// 확인하는 데 쓴다 — 2026-07-19 크래시 루프는 남의 서버 응답을 자기 것으로 오인한
// 채 감시가 ok를 보고하는 동안 진행됐다.
export async function GET() {
  if (usesCloudStore()) {
    const state = await readState();
    const claimed = state.jobs.filter((job) => job.status === "claimed");
    const completed = state.jobs.filter((job) => job.status === "completed");
    const failed = state.jobs.filter((job) => job.status === "failed");
    const activity = state.jobs.map((job) => job.updatedAt).toSorted().at(-1) ?? null;
    return NextResponse.json({
      ok: true,
      service: "sol-ebook-publish-dashboard-cloud",
      time: new Date().toISOString(),
      instanceId: process.env["VERCEL_DEPLOYMENT_ID"] ?? process.env["DASHBOARD_INSTANCE_ID"] ?? null,
      pid: process.pid,
      execution: "codex-cloud",
      bridge: {
        state: "fresh",
        startedAt: null,
        lastPollAt: activity,
        runningJobs: claimed.length,
        totals: { claimed: claimed.length, completed: completed.length, failed: failed.length },
      },
    });
  }
  const bridge = await readBridgeHealth();
  return NextResponse.json({
    ok: true,
    service: "sol-ebook-publish-dashboard",
    time: new Date().toISOString(),
    instanceId: process.env["DASHBOARD_INSTANCE_ID"] ?? null,
    pid: process.pid,
    bridge: {
      state: classifyBridgeHealth(bridge),
      startedAt: bridge?.startedAt ?? null,
      lastPollAt: bridge?.lastPollAt ?? null,
      runningJobs: runningJobCount(bridge),
      totals: bridge
        ? { claimed: bridge.totalClaimed, completed: bridge.totalCompleted, failed: bridge.totalFailed }
        : null,
    },
  });
}
