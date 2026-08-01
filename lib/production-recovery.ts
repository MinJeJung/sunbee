import type {
  DashboardState,
  Job,
  Operation,
  ProductionJobType,
  RecoveryCause,
  RecoveryRecord,
} from "@/lib/types";

const MAX_RECOVERY_ATTEMPTS = 3;
const ORPHAN_STALE_MS = 15 * 60_000;
const CLAIM_STALE_MS = {
  topic_insight: 45 * 60_000,
  book_build: 2 * 60 * 60_000,
} as const satisfies Record<ProductionJobType, number>;
const ACTIVE_OPERATION_STATUSES = new Set(["insight_queued", "insight_processing", "building", "revision_requested"]);

export type ProductionRecoveryInput = {
  readonly state: DashboardState;
  readonly now: string;
  readonly progressUpdatedAt: Readonly<Record<string, string | null | undefined>>;
};

export type ProductionRecoveryAction = {
  readonly kind: "retry" | "blocked";
  readonly operationId: string;
  readonly jobType: ProductionJobType;
  readonly cause: RecoveryCause;
  readonly summary: string;
};

export type ProductionRecoveryResult = {
  readonly state: DashboardState;
  readonly actions: readonly ProductionRecoveryAction[];
  readonly restartRequired: boolean;
};

export function recoverProductionState(input: ProductionRecoveryInput): ProductionRecoveryResult {
  let jobs = [...input.state.jobs];
  let operations = [...input.state.operations];
  const actions: ProductionRecoveryAction[] = [];
  let restartRequired = false;

  for (const original of operations) {
    if (original.artifact) continue;
    const activeJob = jobs.filter(isProductionJob)
      .find((job) => job.operationId === original.id && (job.status === "queued" || job.status === "claimed"));
    if (activeJob?.status === "claimed" && isClaimStalled(activeJob, input)) {
      jobs = jobs.map((job) => job.id === activeJob.id ? { ...job, status: "failed", updatedAt: input.now } : job);
      const recovered = recoverOperation(original, activeJob.type, "stalled", input.now, jobs);
      operations = replaceOperation(operations, recovered.operation);
      jobs = recovered.jobs;
      actions.push(recovered.action);
      restartRequired = true;
      continue;
    }
    if (activeJob) continue;

    if (original.status === "failed") {
      const jobType = productionJobType(original);
      const cause = diagnoseFailure(original.error);
      const recovered = recoverOperation(original, jobType, cause, input.now, jobs);
      operations = replaceOperation(operations, recovered.operation);
      jobs = recovered.jobs;
      if (recovered.changed) actions.push(recovered.action);
      continue;
    }

    if (ACTIVE_OPERATION_STATUSES.has(original.status) && elapsedMs(original.updatedAt, input.now) > ORPHAN_STALE_MS) {
      const jobType = productionJobType(original);
      const recovered = recoverOperation(original, jobType, "orphaned", input.now, jobs);
      operations = replaceOperation(operations, recovered.operation);
      jobs = recovered.jobs;
      if (recovered.changed) actions.push(recovered.action);
    }
  }

  return { state: { ...input.state, operations, jobs }, actions, restartRequired };
}

function recoverOperation(operation: Operation, jobType: ProductionJobType, cause: RecoveryCause, now: string, jobs: Job[]) {
  const attempts = operation.recoveryAttempts ?? 0;
  const summary = recoverySummary(cause);
  if (attempts >= MAX_RECOVERY_ATTEMPTS) {
    const previous = operation.recoveryHistory?.at(-1);
    if (previous?.action === "blocked") {
      return { operation, jobs, action: recoveryAction("blocked", operation.id, jobType, cause, summary), changed: false };
    }
    const record = recoveryRecord(now, "blocked", cause, summary, jobType);
    return {
      operation: { ...operation, recoveryHistory: appendRecord(operation, record), updatedAt: now },
      jobs,
      action: recoveryAction("blocked", operation.id, jobType, cause, summary),
      changed: true,
    };
  }

  const record = recoveryRecord(now, "retry", cause, summary, jobType);
  const { error: _error, ...withoutError } = operation;
  void _error;
  const nextOperation: Operation = {
    ...withoutError,
    status: jobType === "topic_insight" ? "insight_queued" : "building",
    updatedAt: now,
    recoveryAttempts: attempts + 1,
    recoveryHistory: appendRecord(operation, record),
  };
  const retryJob: Job = {
    id: crypto.randomUUID(),
    operationId: operation.id,
    type: jobType,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
  return {
    operation: nextOperation,
    jobs: [retryJob, ...jobs],
    action: recoveryAction("retry", operation.id, jobType, cause, summary),
    changed: true,
  };
}

function isProductionJob(job: Job): job is Job & { readonly type: ProductionJobType } {
  return job.type === "topic_insight" || job.type === "book_build";
}

function isClaimStalled(job: Job & { readonly type: ProductionJobType }, input: ProductionRecoveryInput): boolean {
  if (!job.claimedAt) return false;
  const activity = latestIso(job.claimedAt, job.updatedAt, input.progressUpdatedAt[job.operationId]);
  return elapsedMs(activity, input.now) > CLAIM_STALE_MS[job.type];
}

function productionJobType(operation: Operation): ProductionJobType {
  return operation.insight ? "book_build" : "topic_insight";
}

export function diagnoseFailure(error: string | undefined): RecoveryCause {
  const value = error?.toLowerCase() ?? "";
  if (/sigterm|sigkill|lease|중단|종료 신호/.test(value)) return "interrupted";
  if (/timeout|timed out|시간 초과/.test(value)) return "timeout";
  if (/429|rate limit|quota|사용량|용량/.test(value)) return "provider_capacity";
  if (/econn|network|socket|dns|fetch failed|네트워크|연결 실패/.test(value)) return "network";
  if (/schema|json|zod|parse|형식/.test(value)) return "invalid_result";
  if (/quality|gate|분량|중복|품질|목차|toc/.test(value)) return "quality_gate";
  return "unknown";
}

function recoverySummary(cause: RecoveryCause): string {
  const summaries = {
    interrupted: "실행 프로세스가 종료 신호로 중단됨",
    timeout: "제작 단계가 허용 시간을 초과함",
    provider_capacity: "모델 사용량 또는 처리 용량이 일시 제한됨",
    network: "외부 연결 또는 네트워크 요청이 실패함",
    invalid_result: "작업 결과 형식 또는 JSON 검증이 실패함",
    quality_gate: "원고 품질 게이트를 통과하지 못함",
    stalled: "제작 진행 기록이 설정된 감시 한도 이상 갱신되지 않음",
    orphaned: "진행 상태인데 연결된 실행 작업이 없음",
    unknown: "실행 오류가 발생해 동일 제작 단계를 다시 시작함",
  } as const satisfies Record<RecoveryCause, string>;
  return summaries[cause];
}

function recoveryRecord(at: string, action: RecoveryRecord["action"], cause: RecoveryCause, summary: string, jobType: ProductionJobType): RecoveryRecord {
  return { at, action, cause, summary, jobType };
}

function recoveryAction(kind: ProductionRecoveryAction["kind"], operationId: string, jobType: ProductionJobType, cause: RecoveryCause, summary: string): ProductionRecoveryAction {
  return { kind, operationId, jobType, cause, summary };
}

function appendRecord(operation: Operation, record: RecoveryRecord): readonly RecoveryRecord[] {
  return [...(operation.recoveryHistory ?? []), record].slice(-5);
}

function replaceOperation(operations: Operation[], next: Operation): Operation[] {
  return operations.map((operation) => operation.id === next.id ? next : operation);
}

function elapsedMs(from: string, to: string): number {
  return Math.max(0, Date.parse(to) - Date.parse(from));
}

function latestIso(...values: readonly (string | null | undefined)[]): string {
  const latest = values.filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left)).at(0);
  return latest ?? "1970-01-01T00:00:00.000Z";
}
