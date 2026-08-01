import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { isBridgeAuthorized } from "@/lib/bridge-auth";
import { readRevisionAttachment, RevisionAttachmentStoreError } from "@/lib/revision-attachment-store";
import { readState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ attachmentId: string }> }) {
  if (!(await isAuthenticated()) && !isBridgeAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { attachmentId } = await context.params;
  if (!z.uuid().safeParse(attachmentId).success) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const attachment = (await readState()).operations
    .flatMap((operation) => operation.revisionAttachments ?? [])
    .find((candidate) => candidate.id === attachmentId);
  if (!attachment) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const stored = await readRevisionAttachment(attachment);
    if (!stored) return NextResponse.json({ error: "not found" }, { status: 404 });
    return new Response(stored.body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(stored.fileName)}`,
        "Content-Type": stored.contentType,
      },
    });
  } catch (error) {
    if (error instanceof RevisionAttachmentStoreError) {
      return NextResponse.json({ error: "attachment unavailable" }, { status: 500 });
    }
    throw error;
  }
}
