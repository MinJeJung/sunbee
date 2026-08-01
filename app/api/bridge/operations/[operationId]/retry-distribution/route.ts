import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { bridgeIsConfigured, isBridgeAuthorized } from "@/lib/bridge-auth";
import { readState, updateState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 자동화용 5사 유통 재시도 진입점 — retry-isbn과 동일한 green 게이트 정책.
// ISBN·판권면이 확정된 실패 작업만, publish_readiness_status가 green일 때만 재큐잉한다.

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

  const state = await readState();
  const operation = state.operations.find((candidate) => candidate.id === operationId);
  if (!operation) return NextResponse.json({ error: "제작 요청을 찾을 수 없습니다." }, { status: 409 });
  if (operation.status !== "failed" || !operation.artifact ||
      operation.approvedFingerprint !== operation.artifact.fingerprint || !operation.isbn || operation.colophonStatus !== "completed") {
    return NextResponse.json({ error: "ISBN과 판권면이 확정된 유통 실패 작업만 다시 실행할 수 있습니다." }, { status: 409 });
  }
  const readinessStatus = await readReadinessStatus(path.dirname(path.resolve(operation.artifact.epubArtifactId)));
  if (readinessStatus !== "green") {
    return NextResponse.json({
      error: `출간 준비 게이트가 green이 아닙니다(현재: ${readinessStatus ?? "미기록"}). 산출물 수정 후 epub_publish_readiness.py로 green 확인 뒤 재시도하세요.`,
    }, { status: 409 });
  }

  let transitionError: string | undefined;
  const now = new Date().toISOString();
  await updateState((current) => {
    const target = current.operations.find((candidate) => candidate.id === operationId);
    if (!target || target.status !== "failed" || !target.artifact ||
        target.approvedFingerprint !== target.artifact.fingerprint || !target.isbn || target.colophonStatus !== "completed") {
      transitionError = "ISBN과 판권면이 확정된 유통 실패 작업만 다시 실행할 수 있습니다.";
      return current;
    }
    return {
      ...current,
      operations: current.operations.map((candidate) => {
        if (candidate.id !== operationId) return candidate;
        const { error: _error, ...rest } = candidate;
        void _error;
        return { ...rest, status: "distribution_processing" as const, updatedAt: now };
      }),
      jobs: [{ id: crypto.randomUUID(), operationId, type: "distribution" as const, status: "queued" as const, createdAt: now, updatedAt: now }, ...current.jobs],
    };
  });
  if (transitionError) return NextResponse.json({ error: transitionError }, { status: 409 });
  return NextResponse.json({ ok: true, readinessStatus });
}

async function readReadinessStatus(bookDir: string): Promise<string | undefined> {
  try {
    const meta = await readFile(path.join(bookDir, "_meta.md"), "utf8");
    return /^publish_readiness_status:\s*(\S+)/m.exec(meta)?.[1];
  } catch {
    return undefined;
  }
}
