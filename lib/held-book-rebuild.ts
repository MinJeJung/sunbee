import type { DashboardState, Job, Operation } from "@/lib/types";

const ACTIVE_JOB_STATUSES = new Set<Job["status"]>(["queued", "claimed"]);

export function isHeldBookEligible(operation: Operation, jobs: readonly Job[]) {
  return operation.status === "failed"
    && !jobs.some((job) => job.operationId === operation.id && ACTIVE_JOB_STATUSES.has(job.status));
}

export function prepareHeldBookRebuilds(state: DashboardState, now: string): DashboardState {
  const targets = state.operations.filter((operation) => isHeldBookEligible(operation, state.jobs));
  if (targets.length === 0) return state;
  const targetIds = new Set(targets.map((operation) => operation.id));

  const operations = state.operations.map((operation) => {
    if (!targetIds.has(operation.id)) return operation;
    const next: Operation = {
      ...operation,
      status: operation.insight ? "building" : "insight_queued",
      updatedAt: now,
    };
    delete next.approvedFingerprint;
    delete next.revisionNotes;
    delete next.revisionAttachments;
    delete next.reviewBatchId;
    delete next.reviewEmailSentAt;
    delete next.error;
    return next;
  });

  const jobs: Job[] = targets.map((operation) => ({
    id: crypto.randomUUID(),
    operationId: operation.id,
    type: operation.insight ? "book_build" : "topic_insight",
    status: "queued",
    createdAt: now,
    updatedAt: now,
  }));

  return { ...state, operations, jobs: [...jobs, ...state.jobs] };
}
