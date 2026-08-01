import { NextResponse } from "next/server";
import { bridgeIsConfigured, isBridgeAuthorized } from "@/lib/bridge-auth";
import { updateState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 브리지 시작 직후 호출되는 중단 잡 회수 진입점.
// 서비스 재시작이 실행 중이던 작업(유통·ISBN 등)을 끊으면 잡이 claimed로 고착돼
// lease 만료(유통 6시간)까지 대기하게 된다 — 브리지는 단일 인스턴스이므로 시작 시점에
// claimed 잡이 남아 있다면 전부 이전 프로세스의 유산이며, 즉시 queued로 되돌려 재실행한다.
// (2026-07-16 영상 제작 자동화의 기술 유통이 재시작 2회로 자정까지 고착됐던 사고의 재발 방지)

export async function POST(request: Request) {
  if (!bridgeIsConfigured()) {
    return NextResponse.json({ error: "CODEX_BRIDGE_TOKEN이 설정되지 않았습니다." }, { status: 503 });
  }
  if (!isBridgeAuthorized(request)) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  }

  const now = new Date().toISOString();
  let reclaimed: { id: string; type: string }[] = [];
  await updateState((state) => {
    reclaimed = state.jobs
      .filter((job) => job.status === "claimed")
      .map((job) => ({ id: job.id, type: job.type }));
    if (reclaimed.length === 0) return state;
    return {
      ...state,
      jobs: state.jobs.map((job) => {
        if (job.status !== "claimed") return job;
        const { claimedAt: _claimedAt, ...rest } = job;
        void _claimedAt;
        return { ...rest, status: "queued" as const, updatedAt: now };
      }),
    };
  });
  return NextResponse.json({ ok: true, reclaimed });
}
