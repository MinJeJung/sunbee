import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { readCatalog } from "@/lib/catalog";
import { readLiveCatalog } from "@/lib/live-catalog";
import { readState } from "@/lib/store";

const libraryRoot = "/Users/minje/Documents/Obsidian Vault/3_출판 및 SNS/전자책원고";
const kindSchema = z.enum(["cover", "epub", "pdf", "manuscript"]);
const contentTypes: Record<z.infer<typeof kindSchema>, string> = { cover: "image/jpeg", epub: "application/epub+zip", pdf: "application/pdf", manuscript: "text/markdown; charset=utf-8" };

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const kind = kindSchema.safeParse(request.nextUrl.searchParams.get("kind"));
  const books = await readLiveCatalog((await readCatalog()).books, (await readState()).operations);
  const book = books.find((candidate) => candidate.id === decodeURIComponent(id));
  if (!book || !kind.success) return NextResponse.json({ error: "not found" }, { status: 404 });
  const relative = book[kind.data];
  if (!relative || !book.assetId) return NextResponse.json({ error: "asset unavailable" }, { status: 404 });
  // 썸네일 요청은 축소 캐시(data/thumbs)를 먼저 시도하고, 없으면 원본으로 폴백한다.
  if (kind.data === "cover" && request.nextUrl.searchParams.get("thumb") === "1") {
    try {
      const thumb = await readFile(path.join(process.cwd(), "data", "thumbs", `${book.assetId}.jpg`));
      return new NextResponse(thumb, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
    } catch {
      // 폴백: 아래 원본 서빙 경로로 계속
    }
  }
  const bookRoot = path.resolve(libraryRoot, book.assetId);
  const resolved = path.resolve(bookRoot, relative);
  if (!(resolved === bookRoot || resolved.startsWith(`${bookRoot}${path.sep}`))) return NextResponse.json({ error: "invalid asset path" }, { status: 400 });
  try {
    const file = await readFile(resolved);
    const extension = path.extname(relative).toLowerCase();
    const type = kind.data === "cover" && extension === ".png" ? "image/png" : contentTypes[kind.data];
    return new NextResponse(file, { headers: { "Content-Type": type, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(path.basename(relative))}`, "Cache-Control": "private, max-age=300" } });
  } catch { return NextResponse.json({ error: "asset not found" }, { status: 404 }); }
}
