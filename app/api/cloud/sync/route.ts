import { NextResponse } from "next/server";
import { bridgeIsConfigured, isBridgeAuthorized } from "@/lib/bridge-auth";
import { buildCloudReviewSnapshot } from "@/lib/cloud-sync";
import { readState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!bridgeIsConfigured()) {
    return NextResponse.json({ error: "클라우드 동기화가 설정되지 않았습니다." }, { status: 503 });
  }
  if (!isBridgeAuthorized(request)) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  }
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    state: buildCloudReviewSnapshot(await readState()),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
