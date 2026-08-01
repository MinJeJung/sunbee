import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCloudArtifactStore, usesCloudArtifacts } from "@/lib/cloud-artifact-store";
import { bridgeIsConfigured, isBridgeAuthorized } from "@/lib/bridge-auth";
import { createCloudJobToken } from "@/lib/cloud-job-token";
import { readState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!bridgeIsConfigured()) return NextResponse.json({ error: "클라우드 브리지가 설정되지 않았습니다." }, { status: 503 });
  if (!isBridgeAuthorized(request)) return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  const { jobId } = await context.params;
  if (!z.uuid().safeParse(jobId).success) return NextResponse.json({ error: "잘못된 작업 ID입니다." }, { status: 400 });

  const state = await readState();
  const job = state.jobs.find((candidate) => candidate.id === jobId);
  const operation = job ? state.operations.find((candidate) => candidate.id === job.operationId) : undefined;
  if (!job || !operation) return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });
  if (job.status !== "claimed" || !["topic_insight", "book_build"].includes(job.type)) {
    return NextResponse.json({ error: "실행 중인 기획·제작 작업만 전달할 수 있습니다." }, { status: 409 });
  }

  const expiresAt = new Date(Date.now() + 12 * 60 * 60_000);
  const callbackToken = createCloudJobToken(job.id, expiresAt);
  const uploads = job.type === "book_build" && usesCloudArtifacts()
    ? await Promise.all(["cover", "epub", "manuscript", "meta"].map((kind) =>
        createCloudArtifactStore().createUploadTarget(operation.id, z.enum(["cover", "epub", "manuscript", "meta"]).parse(kind))))
    : [];

  return NextResponse.json({
    job,
    operation,
    uploads,
    callbackUrl: `${request.nextUrl.origin}/api/cloud/jobs/${encodeURIComponent(job.id)}/complete`,
    callbackToken,
    expiresAt: expiresAt.toISOString(),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
