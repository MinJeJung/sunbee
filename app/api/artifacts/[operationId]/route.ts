import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { createCloudArtifactStore, currentCloudArtifactId, usesCloudArtifacts } from "@/lib/cloud-artifact-store";
import { readState } from "@/lib/store";

const ebookRoot = path.resolve("/Users/minje/Documents/Obsidian Vault/3_출판 및 SNS/전자책원고");
const kindSchema = z.enum(["cover", "epub", "manuscript"]);

export async function GET(request: NextRequest, context: { params: Promise<{ operationId: string }> }) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { operationId } = await context.params;
  const kind = kindSchema.safeParse(request.nextUrl.searchParams.get("kind"));
  if (!z.uuid().safeParse(operationId).success || !kind.success) return NextResponse.json({ error: "not found" }, { status: 404 });
  const operation = (await readState()).operations.find((candidate) => candidate.id === operationId);
  if (!operation?.artifact) return NextResponse.json({ error: "artifact unavailable" }, { status: 404 });
  if (usesCloudArtifacts()) {
    const artifactId = kind.data === "manuscript"
      ? currentCloudArtifactId(operation.id, "manuscript")
      : kind.data === "cover" ? operation.artifact.coverArtifactId : operation.artifact.epubArtifactId;
    const artifactStore = createCloudArtifactStore();
    if (!(await artifactStore.exists(artifactId))) return NextResponse.json({ error: "artifact not found" }, { status: 404 });
    const body = await artifactStore.read(artifactId);
    const filename = kind.data === "cover" ? `${operation.artifact.title}_표지.jpg`
      : kind.data === "epub" ? `${operation.artifact.title}.epub` : `${operation.artifact.title}_원고.md`;
    const contentType = kind.data === "cover" ? "image/jpeg"
      : kind.data === "epub" ? "application/epub+zip" : "text/markdown; charset=utf-8";
    return new NextResponse(new Uint8Array(body), { headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${kind.data === "epub" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  }
  if (kind.data === "manuscript") {
    const bookDirectory = path.resolve(operation.bookDirectory ?? path.dirname(operation.artifact.epubArtifactId));
    if (!bookDirectory.startsWith(`${ebookRoot}${path.sep}`)) return NextResponse.json({ error: "invalid artifact path" }, { status: 400 });
    try {
      const chapters = (await readdir(bookDirectory))
        .map((name) => ({ name, match: /^chapter(\d+)\.md$/i.exec(name) }))
        .filter((entry): entry is { name: string; match: RegExpExecArray } => entry.match !== null)
        .toSorted((left, right) => Number(left.match[1]) - Number(right.match[1]));
      if (!chapters.length) return NextResponse.json({ error: "manuscript not found" }, { status: 404 });
      const manuscript = (await Promise.all(chapters.map((chapter) => readFile(path.join(bookDirectory, chapter.name), "utf8")))).join("\n\n---\n\n");
      const filename = `${operation.artifact.title}_원고.md`;
      return new NextResponse(manuscript, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    } catch { return NextResponse.json({ error: "manuscript not found" }, { status: 404 }); }
  }
  const candidate = kind.data === "cover" ? operation.artifact.coverArtifactId : operation.artifact.epubArtifactId;
  const resolved = path.resolve(candidate);
  if (!resolved.startsWith(`${ebookRoot}${path.sep}`)) return NextResponse.json({ error: "invalid artifact path" }, { status: 400 });
  try {
    const file = await readFile(resolved);
    const type = kind.data === "epub" ? "application/epub+zip" : path.extname(resolved).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
    return new NextResponse(file, { headers: { "Content-Type": type, "Content-Disposition": `${kind.data === "epub" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(path.basename(resolved))}`, "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "artifact not found" }, { status: 404 }); }
}
