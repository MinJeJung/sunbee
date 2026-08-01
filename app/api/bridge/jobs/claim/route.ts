import { NextResponse } from "next/server";
import { z } from "zod";
import { bridgeIsConfigured, isBridgeAuthorized } from "@/lib/bridge-auth";
import { hasActiveBatchBuild } from "@/lib/production-flow";
import { updateState } from "@/lib/store";
import type { DashboardState, Job, Operation, OperationStatus } from "@/lib/types";

// 브리지가 타입별 동시성 한도에 맞춰 가져갈 작업 유형을 지정한다 (본문 없으면 전체 허용).
const claimBodySchema = z.object({
  types: z.array(z.enum(["topic_insight", "book_build", "review_email", "isbn", "distribution"])).min(1).max(5).optional(),
}).strict();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 브리지 프로세스가 죽어 claimed 상태로 고착된 작업을 회수하는 lease 한도.
const JOB_LEASE_MS: Record<Job["type"], number> = {
  topic_insight: 45 * 60_000,
  book_build: 7 * 60 * 60_000,
  review_email: 30 * 60_000,
  isbn: 2 * 60 * 60_000,
  distribution: 6 * 60 * 60_000,
};

function expireStaleClaims(jobs: Job[], operations: Operation[], now: string) {
  const nowMs = Date.parse(now);
  jobs.forEach((job, jobIndex) => {
    if (job.status !== "claimed" || !job.claimedAt) return;
    if (nowMs - Date.parse(job.claimedAt) <= JOB_LEASE_MS[job.type]) return;
    const reason = "실행 시간이 lease 한도를 초과했습니다 — 브리지 중단으로 판단해 작업을 회수했습니다. 다시 실행해 주세요.";
    jobs[jobIndex] = { ...job, status: "failed", updatedAt: now };
    const affectedIds = job.type === "review_email" ? new Set(job.operationIds ?? []) : new Set([job.operationId]);
    operations.forEach((operation, operationIndex) => {
      if (!affectedIds.has(operation.id)) return;
      operations[operationIndex] = job.type === "review_email"
        ? { ...operation, error: `검수 메일 발송 실패: ${reason}`, updatedAt: now }
        : { ...operation, status: "failed", error: reason, updatedAt: now };
    });
  });
}

function failureReason(job: Job, operation: Operation | undefined, state: DashboardState) {
  if (!operation) return "연결된 제작 요청을 찾을 수 없습니다.";

  const otherClaimed = state.jobs.some(
    (candidate) => candidate.id !== job.id && candidate.operationId === job.operationId && candidate.status === "claimed",
  );
  if (otherClaimed) return null;

  if (job.type === "book_build" && !operation.insight) {
    return "주제 인사이트가 없어 책 제작을 시작할 수 없습니다.";
  }
  if (job.type === "book_build" && operation.batchId) {
    if (hasActiveBatchBuild(state, operation.id, job.id)) return null;
  }

  if (job.type === "review_email") {
    const operationIds = job.operationIds ?? [];
    const batch = operationIds.map((id) => state.operations.find((candidate) => candidate.id === id));
    if (operationIds.length < 1 || operationIds.length > 5 || batch.some((candidate) => !candidate?.artifact || candidate.status !== "awaiting_review")) {
      return "검수 메일은 검수 대기 상태의 완성본 1~5권 단위로만 보낼 수 있습니다.";
    }
  }

  if (job.type === "isbn" || job.type === "distribution") {
    if (!operation.artifact) return "검수할 책 산출물이 없습니다.";
    if (!operation.approvedFingerprint) return "사용자의 최종 승인이 없습니다.";
    if (operation.approvedFingerprint !== operation.artifact.fingerprint) {
      return "승인된 산출물과 현재 산출물의 지문이 다릅니다.";
    }
  }

  if (job.type === "distribution") {
    if (!operation.isbn) return "배정된 EPUB ISBN이 없습니다.";
    if (operation.colophonStatus !== "completed") return "ISBN이 반영된 판권면 제작이 완료되지 않았습니다.";
  }

  return undefined;
}

function processingStatus(type: Job["type"]): OperationStatus | null {
  if (type === "topic_insight") return "insight_processing";
  if (type === "book_build") return "building";
  if (type === "review_email") return null;
  if (type === "isbn") return "isbn_processing";
  return "distribution_processing";
}

function beginProcessing(operation: Operation, status: OperationStatus, updatedAt: string) {
  const next: Operation = { ...operation, status, updatedAt };
  delete next.error;
  return next;
}

export async function POST(request: Request) {
  if (!bridgeIsConfigured()) {
    return NextResponse.json({ error: "CODEX_BRIDGE_TOKEN이 설정되지 않았습니다." }, { status: 503 });
  }
  if (!isBridgeAuthorized(request)) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  }

  let requestedTypes: Set<Job["type"]> | null = null;
  try {
    const parsed = claimBodySchema.safeParse(await request.json());
    if (parsed.success && parsed.data.types) requestedTypes = new Set(parsed.data.types);
  } catch {
    // 본문 없는 기존 호출과의 호환 — 전체 유형 허용
  }

  let claimedJobId: string | undefined;
  const updated = await updateState((state) => {
    const now = new Date().toISOString();
    const jobs = [...state.jobs];
    const operations = [...state.operations];
    expireStaleClaims(jobs, operations, now);
    const candidates = jobs
      .filter((job) => job.status === "queued" && (!requestedTypes || requestedTypes.has(job.type)))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    for (const candidate of candidates) {
      const jobIndex = jobs.findIndex((job) => job.id === candidate.id);
      const operationIndex = operations.findIndex((operation) => operation.id === candidate.operationId);
      const operation = operationIndex >= 0 ? operations[operationIndex] : undefined;
      const reason = failureReason(candidate, operation, { ...state, jobs, operations });

      if (reason === null) continue;

      if (reason) {
        jobs[jobIndex] = { ...candidate, status: "failed", updatedAt: now };
        if (candidate.type === "review_email") {
          // 검수 메일 실패는 배치에 묶인 멀쩡한 책의 파이프라인 상태를 건드리지 않는다 — 에러만 남긴다.
          const batchIds = new Set(candidate.operationIds ?? [candidate.operationId]);
          operations.forEach((batchOperation, batchIndex) => {
            if (batchIds.has(batchOperation.id)) {
              operations[batchIndex] = { ...batchOperation, error: `검수 메일 발송 실패: ${reason}`, updatedAt: now };
            }
          });
        } else if (operation && operationIndex >= 0) {
          operations[operationIndex] = { ...operation, status: "failed", error: reason, updatedAt: now };
        }
        continue;
      }

      jobs[jobIndex] = { ...candidate, status: "claimed", claimedAt: now, updatedAt: now };
      const nextStatus = processingStatus(candidate.type);
      if (operation && operationIndex >= 0 && nextStatus) {
        operations[operationIndex] = beginProcessing(operation, nextStatus, now);
      }
      claimedJobId = candidate.id;
      break;
    }

    return { ...state, jobs, operations };
  });

  if (!claimedJobId) return new Response(null, { status: 204 });

  const job = updated.jobs.find((candidate) => candidate.id === claimedJobId);
  const operation = job
    ? updated.operations.find((candidate) => candidate.id === job.operationId)
    : undefined;
  if (!job || !operation) {
    return NextResponse.json({ error: "작업을 가져오는 중 상태가 변경되었습니다." }, { status: 409 });
  }

  const batchOperations = job.operationIds?.map((id) => updated.operations.find((candidate) => candidate.id === id)).filter((candidate): candidate is Operation => Boolean(candidate));
  return NextResponse.json({ job, operation, batchOperations }, { headers: { "Cache-Control": "no-store" } });
}
