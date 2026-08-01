import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { BOOKS_ROOT, isSafeSlug, resolveReviewEpub } from "@/lib/platform-rework";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const slug = z.string().min(1).max(200).safeParse(request.nextUrl.searchParams.get("slug"));
  const kind = z.enum(["cover", "epub"]).safeParse(request.nextUrl.searchParams.get("kind"));
  if (!slug.success || !kind.success || !isSafeSlug(slug.data)) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const folder = path.resolve(BOOKS_ROOT, slug.data);
  if (!folder.startsWith(`${path.resolve(BOOKS_ROOT)}${path.sep}`)) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }

  try {
    if (kind.data === "cover") {
      // 썸네일 캐시가 있으면 우선 사용 (원본 수백 KB → 십수 KB)
      if (request.nextUrl.searchParams.get("thumb") === "1") {
        try {
          const thumb = await readFile(path.join(process.cwd(), "data", "thumbs", `${slug.data}.jpg`));
          return new NextResponse(thumb, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
        } catch {
          // 원본 폴백
        }
      }
      const cover = await readFile(path.join(folder, "cover.jpg"));
      return new NextResponse(cover, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=600" } });
    }
    const epubName = await resolveReviewEpub(slug.data);
    if (!epubName) return NextResponse.json({ error: "EPUB 없음" }, { status: 404 });
    const epub = await readFile(path.join(folder, epubName));
    return new NextResponse(epub, {
      headers: {
        "Content-Type": "application/epub+zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(epubName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "asset not found" }, { status: 404 });
  }
}
