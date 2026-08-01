import { randomUUID } from "node:crypto";
import type { DashboardState, Job, Operation } from "@/lib/types";

export type TopicIntake = {
  readonly direction: string;
  readonly resources: readonly string[];
  readonly targetReader?: string | undefined;
  readonly problem?: string | undefined;
  readonly desiredOutcome?: string | undefined;
  readonly recommendedOutline?: string | undefined;
  readonly source: "dashboard" | "dashboard_batch" | "hermes";
  readonly batchId?: string | undefined;
  readonly batchRow?: number | undefined;
  readonly externalRequestId?: string | undefined;
};

export type TopicEnqueueResult = {
  readonly state: DashboardState;
  readonly operation: Operation;
  readonly job: Job | undefined;
  readonly created: boolean;
};

export function enqueueTopic(
  state: DashboardState,
  input: TopicIntake,
  now = new Date().toISOString(),
  createId: () => string = randomUUID,
): TopicEnqueueResult {
  if (input.externalRequestId) {
    const existing = state.operations.find((operation) => operation.externalRequestId === input.externalRequestId);
    if (existing) {
      return {
        state,
        operation: existing,
        job: state.jobs.find((job) => job.operationId === existing.id),
        created: false,
      };
    }
  }

  const operation: Operation = {
    id: createId(),
    direction: input.direction,
    resources: [...input.resources],
    ...(input.targetReader ? { targetReader: input.targetReader } : {}),
    ...(input.problem ? { problem: input.problem } : {}),
    ...(input.desiredOutcome ? { desiredOutcome: input.desiredOutcome } : {}),
    ...(input.recommendedOutline ? { recommendedOutline: input.recommendedOutline } : {}),
    source: input.source,
    ...(input.batchId ? { batchId: input.batchId } : {}),
    ...(input.batchRow ? { batchRow: input.batchRow } : {}),
    ...(input.externalRequestId ? { externalRequestId: input.externalRequestId } : {}),
    createdAt: now,
    updatedAt: now,
    status: "insight_queued",
  };
  const job: Job = {
    id: createId(),
    operationId: operation.id,
    type: "topic_insight",
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
  return {
    state: {
      ...state,
      operations: [operation, ...state.operations],
      jobs: [job, ...state.jobs],
    },
    operation,
    job,
    created: true,
  };
}
