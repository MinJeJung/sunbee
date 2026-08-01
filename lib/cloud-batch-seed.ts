import { dashboardStateSchema } from "@/lib/state-schema";
import type { DashboardState, Operation } from "@/lib/types";

function cloudOperation(operation: Operation, updatedAt: string): Operation {
  if (!operation.insight) throw new TypeError(`기획 승인이 없는 도서는 클라우드 제작에 넣을 수 없습니다: ${operation.id}`);
  return {
    id: operation.id,
    direction: operation.direction,
    resources: operation.resources,
    ...(operation.targetReader === undefined ? {} : { targetReader: operation.targetReader }),
    ...(operation.problem === undefined ? {} : { problem: operation.problem }),
    ...(operation.desiredOutcome === undefined ? {} : { desiredOutcome: operation.desiredOutcome }),
    ...(operation.recommendedOutline === undefined ? {} : { recommendedOutline: operation.recommendedOutline }),
    ...(operation.source === undefined ? {} : { source: operation.source }),
    ...(operation.batchId === undefined ? {} : { batchId: operation.batchId }),
    ...(operation.batchRow === undefined ? {} : { batchRow: operation.batchRow }),
    createdAt: operation.createdAt,
    updatedAt,
    status: "build_queued",
    insight: operation.insight,
  };
}

export function createCloudBatchSeed(state: DashboardState, batchId: string, updatedAt: string): DashboardState {
  const operations = state.operations
    .filter((operation) => operation.batchId === batchId)
    .toSorted((left, right) => (left.batchRow ?? Number.MAX_SAFE_INTEGER) - (right.batchRow ?? Number.MAX_SAFE_INTEGER))
    .map((operation) => cloudOperation(operation, updatedAt));
  if (operations.length === 0) throw new RangeError(`대량 작업을 찾을 수 없습니다: ${batchId}`);
  const baseTime = Date.parse(updatedAt);
  const jobs = operations.map((operation, index) => {
    const createdAt = new Date(baseTime + index).toISOString();
    return {
      id: crypto.randomUUID(),
      operationId: operation.id,
      type: "book_build" as const,
      status: "queued" as const,
      createdAt,
      updatedAt: createdAt,
    };
  });
  return dashboardStateSchema.parse({ version: 1, operations, jobs });
}
