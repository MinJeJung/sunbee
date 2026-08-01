import { NextResponse } from "next/server";
import { bridgeIsConfigured, isBridgeAuthorized } from "@/lib/bridge-auth";
import { readState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!bridgeIsConfigured()) {
    return NextResponse.json({ error: "CODEX_BRIDGE_TOKEN이 설정되지 않았습니다." }, { status: 503 });
  }
  if (!isBridgeAuthorized(request)) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  }
  const state = await readState();
  // 유통이 applied 상태에서 먼저 나가므로, 발급 확정 동기화는 유통 중·완료 도서도 대상에 포함한다.
  const operations = state.operations.filter((operation) =>
    ["isbn_applied", "distribution_processing", "completed"].includes(operation.status) && operation.isbnStatus === "applied");
  return NextResponse.json({ operations }, { headers: { "Cache-Control": "no-store" } });
}
