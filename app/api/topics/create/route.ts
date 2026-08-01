import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { bridgeIsConfigured, isBridgeAuthorized } from "@/lib/bridge-auth";
import { updateState } from "@/lib/store";
import { enqueueTopic, type TopicEnqueueResult } from "@/lib/topic-intake";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateTopicSchema = z.object({
  direction: z.string().trim().min(5).max(600),
  resources: z.array(z.string().url()).max(20).default([]),
  targetReader: z.string().trim().min(1).max(120).optional(),
  problem: z.string().trim().min(5).max(1_000).optional(),
  desiredOutcome: z.string().trim().min(5).max(1_000).optional(),
  recommendedOutline: z.string().trim().max(5_000).optional(),
  requestId: z.string().trim().min(8).max(160).optional(),
}).strict();

export async function POST(request: Request) {
  const authenticated = await isAuthenticated();
  const bridgeAuthorized = isBridgeAuthorized(request);
  if (!authenticated && !bridgeAuthorized) {
    const status = bridgeIsConfigured() ? 401 : 503;
    return NextResponse.json({ error: status === 503 ? "CODEX_BRIDGE_TOKEN이 설정되지 않았습니다." : "인증이 필요합니다." }, { status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const parsed = CreateTopicSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { direction, resources, requestId, targetReader, problem, desiredOutcome, recommendedOutline } = parsed.data;
  let result: TopicEnqueueResult | undefined;
  await updateState((state) => {
    result = enqueueTopic(state, {
      direction,
      resources,
      targetReader,
      problem,
      desiredOutcome,
      recommendedOutline,
      source: bridgeAuthorized ? "hermes" : "dashboard",
      externalRequestId: requestId,
    });
    return result.state;
  });
  if (!result) throw new Error("주제 등록 결과를 확인할 수 없습니다.");

  return NextResponse.json({
    status: result.created ? "created" : "existing",
    operationId: result.operation.id,
    operationStatus: result.operation.status,
    jobId: result.job?.id ?? null,
    direction,
    message: result.created ? "새 책의 기획 분석을 시작했습니다. 기획 승인 후 제작 대기열에 등록됩니다." : "같은 요청으로 생성된 기존 책을 반환했습니다.",
  }, { status: result.created ? 201 : 200, headers: { "Cache-Control": "no-store" } });
}
