import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { loadReworkBoards, REWORK_PLATFORMS } from "@/lib/platform-rework";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  platform: z.enum(REWORK_PLATFORMS),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(10).max(50).default(25),
});

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "invalid_query", issues: parsed.error.issues }, { status: 400 });
  const result = await loadReworkBoards();
  const board = result.boards.find((candidate) => candidate.platform === parsed.data.platform);
  if (!board) return NextResponse.json({ error: "platform_not_found" }, { status: 404 });
  const totalPages = Math.max(1, Math.ceil(board.items.length / parsed.data.pageSize));
  const page = Math.min(parsed.data.page, totalPages);
  const offset = (page - 1) * parsed.data.pageSize;
  return NextResponse.json({
    platform: board.platform,
    label: board.label,
    note: board.note,
    total: board.items.length,
    stageCounts: board.stageCounts,
    items: board.items.slice(offset, offset + parsed.data.pageSize),
    page,
    pageSize: parsed.data.pageSize,
    totalPages,
    millieSource: result.millieSource,
  }, { headers: { "Cache-Control": "no-store" } });
}
