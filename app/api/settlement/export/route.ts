import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { exportFileName, SETTLEMENT_EXPORT_DIR } from "@/lib/settlement-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ym = z.string().regex(/^\d{4}-\d{2}$/).safeParse(request.nextUrl.searchParams.get("ym"));
  if (!ym.success) return NextResponse.json({ error: "잘못된 정산 월" }, { status: 400 });
  // 파일명은 검증된 ym으로만 조립 — 경로 탈출 불가
  const fileName = exportFileName(ym.data);
  try {
    const file = await readFile(path.join(SETTLEMENT_EXPORT_DIR, fileName));
    return new NextResponse(file, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "아직 생성된 파일이 없습니다" }, { status: 404 });
  }
}
