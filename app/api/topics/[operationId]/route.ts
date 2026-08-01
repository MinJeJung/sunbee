import { NextResponse } from "next/server";
import { bridgeIsConfigured, isBridgeAuthorized } from "@/lib/bridge-auth";
import { readState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ operationId: string }> }) {
  if (!bridgeIsConfigured()) {
    return NextResponse.json({ error: "CODEX_BRIDGE_TOKEN이 설정되지 않았습니다." }, { status: 503 });
  }
  if (!isBridgeAuthorized(request)) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  }
  const { operationId } = await context.params;
  const state = await readState();
  const operation = state.operations.find((candidate) => candidate.id === operationId);
  if (!operation) return NextResponse.json({ error: "제작 요청을 찾을 수 없습니다." }, { status: 404 });
  const jobs = state.jobs.filter((job) => job.operationId === operationId);
  return NextResponse.json({ operation, jobs }, { headers: { "Cache-Control": "no-store" } });
}
