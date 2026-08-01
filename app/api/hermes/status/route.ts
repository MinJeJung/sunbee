import { NextResponse } from "next/server";
import { bridgeIsConfigured, isBridgeAuthorized } from "@/lib/bridge-auth";
import { readHermesManagerSnapshot } from "@/lib/hermes-manager-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!bridgeIsConfigured()) {
    return NextResponse.json({ error: "CODEX_BRIDGE_TOKEN이 설정되지 않았습니다." }, { status: 503 });
  }
  if (!isBridgeAuthorized(request)) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  }
  const snapshot = await readHermesManagerSnapshot();
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
