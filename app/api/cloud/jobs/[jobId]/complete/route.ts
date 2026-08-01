import ky from "ky";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCloudArtifactStore, currentCloudArtifactId, usesCloudArtifacts } from "@/lib/cloud-artifact-store";
import { verifyCloudJobToken } from "@/lib/cloud-job-token";
import { readState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const envelopeSchema = z.union([
  z.object({ ok: z.literal(false), error: z.string().trim().min(1).max(4000) }).strict(),
  z.object({ ok: z.literal(true), result: z.unknown() }).strict(),
]);

const cloudArtifactResultSchema = z.object({
  title: z.string().trim().min(2).max(200),
  fingerprint: z.string().trim().min(8).max(256),
  characterCount: z.number().int().nonnegative(),
  factCheckScore: z.number().min(0).max(100),
  epubCheckScore: z.number().min(0).max(100),
}).passthrough();

function bearerToken(request: Request): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  return match?.[1] ?? null;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  if (!z.uuid().safeParse(jobId).success) return NextResponse.json({ error: "잘못된 작업 ID입니다." }, { status: 400 });
  const token = bearerToken(request);
  if (!token || !verifyCloudJobToken(token, jobId)) return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });

  const envelope = envelopeSchema.safeParse(await request.json());
  if (!envelope.success) return NextResponse.json({ error: "완료 결과 형식이 올바르지 않습니다." }, { status: 400 });
  const state = await readState();
  const job = state.jobs.find((candidate) => candidate.id === jobId);
  const operation = job ? state.operations.find((candidate) => candidate.id === job.operationId) : undefined;
  if (!job || !operation || job.status !== "claimed") {
    return NextResponse.json({ error: "실행 중인 작업을 찾을 수 없습니다." }, { status: 409 });
  }

  let forwarded: z.infer<typeof envelopeSchema> = envelope.data;
  if (envelope.data.ok && job.type === "book_build" && usesCloudArtifacts()) {
    const result = cloudArtifactResultSchema.safeParse(envelope.data.result);
    if (!result.success) return NextResponse.json({ error: z.prettifyError(result.error) }, { status: 400 });
    const artifactIds = {
      cover: currentCloudArtifactId(operation.id, "cover"),
      epub: currentCloudArtifactId(operation.id, "epub"),
      manuscript: currentCloudArtifactId(operation.id, "manuscript"),
      meta: currentCloudArtifactId(operation.id, "meta"),
    };
    const artifactStore = createCloudArtifactStore();
    const exists = await Promise.all(Object.values(artifactIds).map((artifactId) => artifactStore.exists(artifactId)));
    if (exists.some((present) => !present)) {
      return NextResponse.json({ error: "표지·EPUB·원고·메타 산출물이 모두 업로드되지 않았습니다." }, { status: 409 });
    }
    forwarded = {
      ok: true,
      result: {
        title: result.data.title,
        coverArtifactId: artifactIds.cover,
        epubArtifactId: artifactIds.epub,
        fingerprint: result.data.fingerprint,
        characterCount: result.data.characterCount,
        factCheckScore: result.data.factCheckScore,
        epubCheckScore: result.data.epubCheckScore,
      },
    };
  }

  const bridgeToken = z.string().min(1).parse(process.env["CODEX_BRIDGE_TOKEN"]);
  const response = await ky.post(`${request.nextUrl.origin}/api/bridge/jobs/${encodeURIComponent(jobId)}/complete`, {
    headers: { Authorization: `Bearer ${bridgeToken}` },
    json: forwarded,
    throwHttpErrors: false,
    timeout: 30_000,
  });
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
  });
}
