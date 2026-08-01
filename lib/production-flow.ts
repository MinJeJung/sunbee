import type { DashboardState, Job, TopicInsight } from "@/lib/types";

export function hasActiveBatchBuild(
  state: DashboardState,
  operationId: string,
  jobId: string,
  allowConcurrentBatchBuild = false,
): boolean {
  if (allowConcurrentBatchBuild) return false;
  const batchId = state.operations.find((operation) => operation.id === operationId)?.batchId;
  if (!batchId) return false;
  return state.jobs.some((job) => {
    if (job.id === jobId || job.type !== "book_build" || job.status !== "claimed") return false;
    return state.operations.find((operation) => operation.id === job.operationId)?.batchId === batchId;
  });
}

export function completeTopicInsight(
  state: DashboardState,
  operationId: string,
  insight: TopicInsight,
  now: string,
): DashboardState {
  return {
    ...state,
    operations: state.operations.map((operation) => {
      if (operation.id !== operationId) return operation;
      const next = { ...operation, insight, status: "plan_review" as const, updatedAt: now };
      delete next.error;
      return next;
    }),
  };
}

export function approvePlans(
  state: DashboardState,
  operationIds: readonly string[],
  now: string,
  createId: () => string,
): DashboardState {
  const selectedIds = new Set(operationIds);
  const selected = state.operations
    .filter((operation) => selectedIds.has(operation.id) && operation.status === "plan_review" && operation.insight)
    .toSorted((left, right) => (left.batchRow ?? Number.MAX_SAFE_INTEGER) - (right.batchRow ?? Number.MAX_SAFE_INTEGER) || left.createdAt.localeCompare(right.createdAt));
  const approvedIds = new Set(selected.map((operation) => operation.id));
  const jobs: Job[] = selected.map((operation) => ({
    id: createId(), operationId: operation.id, type: "book_build", status: "queued", createdAt: now, updatedAt: now,
  }));
  return {
    ...state,
    operations: state.operations.map((operation) => approvedIds.has(operation.id)
      ? { ...operation, status: "build_queued" as const, updatedAt: now }
      : operation),
    jobs: [...state.jobs, ...jobs],
  };
}
