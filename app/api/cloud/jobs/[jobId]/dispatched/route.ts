import { NextResponse } from "next/server";
import { z } from "zod";
import { bridgeIsConfigured, isBridgeAuthorized } from "@/lib/bridge-auth";
import { updateState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ taskUrl: z.url().refine((url) => url.includes("/codex/tasks/")) }).strict();

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  if (!bridgeIsConfigured()) return NextResponse.json({ error: "클라우드 브리지가 설정되지 않았습니다." }, { status: 503 });
  if (!isBridgeAuthorized(request)) return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  const { jobId } = await context.params;
  const body = bodySchema.safeParse(await request.json());
  if (!z.uuid().safeParse(jobId).success || !body.success) return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  let found = false;
  const now = new Date().toISOString();
  await updateState((state) => ({
    ...state,
    operations: state.operations.map((operation) => {
      const job = state.jobs.find((candidate) => candidate.id === jobId && candidate.operationId === operation.id && candidate.status === "claimed");
      if (!job) return operation;
      found = true;
      return { ...operation, externalRequestId: body.data.taskUrl, updatedAt: now };
    }),
  }));
  return found ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "실행 중인 작업을 찾을 수 없습니다." }, { status: 409 });
}
