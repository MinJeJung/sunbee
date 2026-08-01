import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { loadDashboardSnapshot } from "@/lib/dashboard-source";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const snapshot = await loadDashboardSnapshot();
  const body = JSON.stringify(snapshot);
  // local-state·production-bridge는 요청마다 타임스탬프가 변한다 — ETag에서는 시각을
  // 지우고 상태·실행 건수만 남겨 304 캐시가 계속 동작하게 한다.
  const everFreshSources = new Set(["local-state", "production-bridge"]);
  const etagBody = JSON.stringify({
    ...snapshot,
    generatedAt: "",
    sources: snapshot.sources.map((source) => everFreshSources.has(source.source)
      ? { ...source, observedAt: "", attemptedAt: "", lastSuccessAt: "", effectiveDate: "" }
      : source),
  });
  const etag = `"${createHash("sha256").update(etagBody).digest("base64url")}"`;
  const headers = { "Cache-Control": "no-store", ETag: etag };
  if (request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
  return new NextResponse(body, { headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
}
