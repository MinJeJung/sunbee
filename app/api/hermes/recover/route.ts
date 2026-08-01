import { stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { bridgeIsConfigured, isBridgeAuthorized } from "@/lib/bridge-auth";
import { progressFilePath } from "@/lib/build-progress";
import { recoverProductionState, type ProductionRecoveryResult } from "@/lib/production-recovery";
import { readState, updateState } from "@/lib/store";
import type { DashboardState } from "@/lib/types";

const requestSchema = z.object({ dryRun: z.boolean().optional().default(false) }).strict();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!bridgeIsConfigured()) {
    return NextResponse.json({ error: "CODEX_BRIDGE_TOKEN이 설정되지 않았습니다." }, { status: 503 });
  }
  if (!isBridgeAuthorized(request)) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  }

  let decoded: unknown;
  try {
    decoded = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
    throw error;
  }
  const parsed = requestSchema.safeParse(decoded);
  if (!parsed.success) return NextResponse.json({ error: "자동 복구 요청 형식이 올바르지 않습니다." }, { status: 400 });

  const state = await readState();
  const now = new Date().toISOString();
  const progressUpdatedAt = await readProgressUpdatedAt(state);
  const preview = recoverProductionState({ state, now, progressUpdatedAt });
  if (parsed.data.dryRun || preview.actions.length === 0) return recoveryResponse(preview, parsed.data.dryRun);

  let applied: ProductionRecoveryResult = preview;
  await updateState((current) => {
    applied = recoverProductionState({ state: current, now, progressUpdatedAt });
    return applied.state;
  });
  return recoveryResponse(applied, false);
}

async function readProgressUpdatedAt(state: DashboardState): Promise<Readonly<Record<string, string | null>>> {
  const entries = await Promise.all(state.operations.map(async (operation) => {
    try {
      const metadata = await stat(progressFilePath(operation.id));
      return [operation.id, metadata.mtime.toISOString()] as const;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return [operation.id, null] as const;
      throw error;
    }
  }));
  return Object.fromEntries(entries);
}

function recoveryResponse(result: ProductionRecoveryResult, dryRun: boolean) {
  return NextResponse.json({
    status: "ok",
    dryRun,
    recovered: result.actions.filter((action) => action.kind === "retry").length,
    blocked: result.actions.filter((action) => action.kind === "blocked").length,
    restartRequired: result.restartRequired,
    actions: result.actions,
  }, { headers: { "Cache-Control": "no-store" } });
}
