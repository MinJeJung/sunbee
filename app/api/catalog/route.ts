import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { readCatalog } from "@/lib/catalog";
import { readScopedCatalog } from "@/lib/catalog-source";
import { CATALOG_SCOPES, CATALOG_STATUSES, queryCatalogPage } from "@/lib/dashboard-domain";
import { readLiveCatalog } from "@/lib/live-catalog";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  scope: z.enum(CATALOG_SCOPES).default("ai"),
  q: z.string().max(100).default(""),
  status: z.enum(CATALOG_STATUSES).default("all"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(50),
});

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const values = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = querySchema.safeParse(values);
  if (!parsed.success) return NextResponse.json({ error: "invalid_query", issues: parsed.error.issues }, { status: 400 });
  const [catalog, state] = await Promise.all([readCatalog(), readState()]);
  const liveBooks = await readLiveCatalog(catalog.books, state.operations);
  const books = parsed.data.scope === "ai" ? liveBooks : await readScopedCatalog("legacy", liveBooks);
  const page = queryCatalogPage(books, {
    scope: parsed.data.scope,
    query: parsed.data.q,
    status: parsed.data.status,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
  });
  return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } });
}
