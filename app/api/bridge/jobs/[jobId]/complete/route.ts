import { NextResponse } from "next/server";
import { z } from "zod";
import { bridgeIsConfigured, isBridgeAuthorized } from "@/lib/bridge-auth";
import { completeTopicInsight } from "@/lib/production-flow";
import { readState, updateState } from "@/lib/store";
import type { DistributionWorkflowResult, IsbnWorkflowResult, Job, Operation, ProducedArtifact, TopicInsight } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const topicInsightSchema = z.object({
  recommendedTitle: z.string().trim().min(2).max(200),
  targetReader: z.string().trim().min(2).max(500),
  readerPromise: z.string().trim().min(2).max(1000),
  keyInsights: z.array(z.string().trim().min(2).max(1000)).min(1).max(20),
  chapterDirections: z.array(z.string().trim().min(2).max(1000)).min(3).max(20),
  sourceNotes: z.array(z.object({
    url: z.url(),
    insight: z.string().trim().min(2).max(2000),
  })).max(20),
  bookType: z.enum(["quick", "standard", "deep"]),
  recommendedCharacters: z.object({ min: z.number().int().min(20_000), max: z.number().int().max(200_000) }).refine((value) => value.min < value.max),
  promiseChecklist: z.array(z.string().trim().min(2).max(500)).min(1).max(20),
  readerAssets: z.array(z.string().trim().min(2).max(500)).min(1).max(20),
  differentiation: z.string().trim().min(2).max(1_000),
}).strict();

const artifactSchema = z.object({
  title: z.string().trim().min(2).max(200),
  coverArtifactId: z.string().trim().min(1).max(1000),
  epubArtifactId: z.string().trim().min(1).max(1000),
  fingerprint: z.string().trim().min(8).max(256),
  characterCount: z.number().int().nonnegative(),
  factCheckScore: z.number().min(0).max(100),
  epubCheckScore: z.number().min(0).max(100),
}).strict();

const isbnResultSchema = z.object({
  status: z.enum(["completed"]),
  isbn: z.string().trim().refine((value) => value.replaceAll(/\D/g, "").length === 13),
  applicationNo: z.string().trim().min(1).max(100),
  isbnStatus: z.enum(["applied", "issued"]),
  colophonStatus: z.literal("completed"),
  bookSlug: z.string().trim().min(1).max(300),
}).strict();

const distributionResultSchema = z.object({
  status: z.enum(["completed"]),
  platforms: z.array(z.enum(["kyobo", "yes24", "ridi", "aladin", "millie"])).length(5),
  epubArtifactId: z.string().trim().min(1).max(1000),
}).strict();

const reviewEmailResultSchema = z.object({
  status: z.literal("sent"),
  messageId: z.string().trim().min(1).max(500).nullable().optional(),
}).strict();

const successEnvelopeSchema = z.object({ ok: z.literal(true), result: z.unknown() }).strict();
const failureEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z.string().trim().min(1).max(4000),
}).strict();

function validateResult(job: Job, value: unknown) {
  if (job.type === "topic_insight") return topicInsightSchema.parse(value);
  if (job.type === "book_build") return artifactSchema.parse(value);
  if (job.type === "review_email") return reviewEmailResultSchema.parse(value);
  if (job.type === "isbn") return isbnResultSchema.parse(value);
  return distributionResultSchema.parse(value);
}

function operationWithoutError(operation: Operation) {
  const next: Operation = { ...operation };
  delete next.error;
  return next;
}

function operationAwaitingReview(operation: Operation, artifact: ProducedArtifact, updatedAt: string) {
  const next: Operation = {
    ...operationWithoutError(operation),
    artifact,
    status: "awaiting_review",
    updatedAt,
  };
  delete next.approvedFingerprint;
  delete next.revisionNotes;
  delete next.revisionAttachments;
  return next;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!bridgeIsConfigured()) {
    return NextResponse.json({ error: "CODEX_BRIDGE_TOKEN이 설정되지 않았습니다." }, { status: 503 });
  }
  if (!isBridgeAuthorized(request)) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  }

  const { jobId } = await context.params;
  if (!z.uuid().safeParse(jobId).success) {
    return NextResponse.json({ error: "잘못된 작업 ID입니다." }, { status: 400 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const envelope = z.union([successEnvelopeSchema, failureEnvelopeSchema]).safeParse(rawBody);
  if (!envelope.success) {
    return NextResponse.json({ error: "완료 결과 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const snapshot = await readState();
  const snapshotJob = snapshot.jobs.find((job) => job.id === jobId);
  if (!snapshotJob) return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });
  if (snapshotJob.status !== "claimed") {
    return NextResponse.json({ error: "실행 중인 작업만 완료할 수 있습니다." }, { status: 409 });
  }

  let parsedResult: unknown;
  if (envelope.data.ok) {
    try {
      parsedResult = validateResult(snapshotJob, envelope.data.result);
    } catch (error) {
      const message = error instanceof z.ZodError ? z.prettifyError(error) : "결과를 검증할 수 없습니다.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const failureMessage = envelope.data.ok ? undefined : envelope.data.error;

  let transitionError: string | undefined;
  const now = new Date().toISOString();
  await updateState((state) => {
    const currentJob = state.jobs.find((job) => job.id === jobId);
    const operation = currentJob
      ? state.operations.find((candidate) => candidate.id === currentJob.operationId)
      : undefined;
    if (!currentJob || !operation) {
      transitionError = "작업 또는 제작 요청을 찾을 수 없습니다.";
      return state;
    }
    if (currentJob.status !== "claimed") {
      transitionError = "작업 상태가 이미 변경되었습니다.";
      return state;
    }

    const replaceJob = (replacement: Job) => state.jobs.map((job) => job.id === jobId ? replacement : job);
    if (failureMessage !== undefined) {
      if (currentJob.type === "review_email") {
        const operationIds = new Set(currentJob.operationIds ?? []);
        return {
          ...state,
          jobs: replaceJob({ ...currentJob, status: "failed", updatedAt: now }),
          operations: state.operations.map((candidate) => operationIds.has(candidate.id)
            ? { ...candidate, error: `검수 메일 발송 실패: ${failureMessage}`, updatedAt: now }
            : candidate),
        };
      }
      return {
        ...state,
        jobs: replaceJob({ ...currentJob, status: "failed", updatedAt: now }),
        operations: state.operations.map((candidate) => candidate.id === operation.id
          ? { ...candidate, status: "failed", error: failureMessage, updatedAt: now }
          : candidate),
      };
    }

    if ((currentJob.type === "isbn" || currentJob.type === "distribution") &&
        (!operation.artifact || operation.approvedFingerprint !== operation.artifact.fingerprint)) {
      const reason = "승인된 산출물 지문과 현재 산출물 지문이 달라 외부 작업을 중단했습니다.";
      return {
        ...state,
        jobs: replaceJob({ ...currentJob, status: "failed", updatedAt: now }),
        operations: state.operations.map((candidate) => candidate.id === operation.id
          ? { ...candidate, status: "failed", error: reason, updatedAt: now }
          : candidate),
      };
    }

    const jobs = replaceJob({ ...currentJob, status: "completed", updatedAt: now });
    if (currentJob.type === "topic_insight") {
      const insight: TopicInsight = topicInsightSchema.parse(parsedResult);
      return completeTopicInsight({ ...state, jobs }, operation.id, insight, now);
    }
    if (currentJob.type === "book_build") {
      const artifact = parsedResult as ProducedArtifact;
      const completedOperations = state.operations.map((candidate) => candidate.id === operation.id
        ? operationAwaitingReview(candidate, artifact, now)
        : candidate);
      const batchCandidates = completedOperations
        .filter((candidate) => candidate.status === "awaiting_review" && candidate.artifact && !candidate.reviewBatchId)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .slice(0, 5);
      if (batchCandidates.length >= 1) {
        const batchId = crypto.randomUUID();
        const operationIds = batchCandidates.map((candidate) => candidate.id);
        const firstOperationId = operationIds.at(0);
        if (!firstOperationId) throw new Error("검수 메일 묶음에 도서가 없습니다.");
        const operationIdSet = new Set(operationIds);
        return {
          ...state,
          jobs: [{
            id: crypto.randomUUID(), operationId: firstOperationId, operationIds, type: "review_email",
            status: "queued", createdAt: now, updatedAt: now,
          }, ...jobs],
          operations: completedOperations.map((candidate) => operationIdSet.has(candidate.id)
            ? { ...candidate, reviewBatchId: batchId, updatedAt: now }
            : candidate),
        };
      }
      return {
        ...state,
        jobs,
        operations: completedOperations,
      };
    }
    if (currentJob.type === "review_email") {
      const operationIds = new Set(currentJob.operationIds ?? []);
      return {
        ...state,
        jobs,
        operations: state.operations.map((candidate) => operationIds.has(candidate.id)
          ? { ...operationWithoutError(candidate), reviewEmailSentAt: now, updatedAt: now }
          : candidate),
      };
    }
    if (currentJob.type === "isbn") {
      const result = parsedResult as IsbnWorkflowResult;
      return {
        ...state,
        jobs: [{
          id: crypto.randomUUID(), operationId: operation.id, type: "distribution",
          status: "queued", createdAt: now, updatedAt: now,
        }, ...jobs],
        operations: state.operations.map((candidate) => candidate.id === operation.id
          ? {
              ...operationWithoutError(candidate),
              status: "isbn_applied",
              isbn: result.isbn,
              isbnApplicationNo: result.applicationNo,
              isbnStatus: result.isbnStatus,
              colophonStatus: result.colophonStatus,
              updatedAt: now,
            }
          : candidate),
      };
    }
    if (currentJob.type === "distribution") {
      const result = parsedResult as DistributionWorkflowResult;
      return {
        ...state,
        jobs,
        operations: state.operations.map((candidate) => {
          if (candidate.id !== operation.id || !candidate.artifact) return candidate;
          return {
            ...operationWithoutError(candidate),
            status: "completed",
            distributionPlatforms: result.platforms,
            artifact: { ...candidate.artifact, epubArtifactId: result.epubArtifactId },
            updatedAt: now,
          };
        }),
      };
    }
    return {
      ...state,
      jobs,
      operations: state.operations.map((candidate) => candidate.id === operation.id
        ? { ...operationWithoutError(candidate), status: "completed", updatedAt: now }
        : candidate),
    };
  });

  if (transitionError) return NextResponse.json({ error: transitionError }, { status: 409 });
  return NextResponse.json({ ok: true });
}
