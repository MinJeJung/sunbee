import { NextResponse } from "next/server";
import { z } from "zod";
import { bridgeIsConfigured, isBridgeAuthorized } from "@/lib/bridge-auth";
import { updateState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ isbnStatus: z.literal("issued") }).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ operationId: string }> },
) {
  if (!bridgeIsConfigured()) {
    return NextResponse.json({ error: "CODEX_BRIDGE_TOKEN이 설정되지 않았습니다." }, { status: 503 });
  }
  if (!isBridgeAuthorized(request)) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  }
  const { operationId } = await context.params;
  if (!z.uuid().safeParse(operationId).success) {
    return NextResponse.json({ error: "잘못된 제작 요청 ID입니다." }, { status: 400 });
  }
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const body = bodySchema.safeParse(rawBody);
  if (!body.success) {
    return NextResponse.json({ error: "isbnStatus는 issued만 허용됩니다." }, { status: 400 });
  }

  let transitionError: string | undefined;
  const now = new Date().toISOString();
  await updateState((state) => {
    const operation = state.operations.find((candidate) => candidate.id === operationId);
    if (!operation) {
      transitionError = "제작 요청을 찾을 수 없습니다.";
      return state;
    }
    if (operation.status !== "isbn_applied" && operation.status !== "distribution_processing" && operation.status !== "completed") {
      transitionError = "ISBN이 접수된 도서만 발급 확정으로 바꿀 수 있습니다.";
      return state;
    }
    if (operation.isbnStatus === "issued") return state;
    return {
      ...state,
      operations: state.operations.map((candidate) => candidate.id === operationId
        ? { ...candidate, isbnStatus: "issued" as const, updatedAt: now }
        : candidate),
    };
  });

  if (transitionError) return NextResponse.json({ error: transitionError }, { status: 409 });
  return NextResponse.json({ ok: true });
}
