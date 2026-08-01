import { classifyBridgeHealth, runningJobCount, type BridgeHealth } from "@/lib/bridge-health";
import { catalogPlatformStats, catalogStats, type Catalog, type CatalogBook } from "@/lib/catalog-schema";
import type { DashboardSnapshotV2, SourceState, SourceStatus } from "@/lib/dashboard-schema";
import type { SalesHistory } from "@/lib/sales-domain";
import type { BuildProgress } from "@/lib/build-progress";
import type { DashboardState, Operation } from "@/lib/types";

type SnapshotInput = {
  readonly catalog: Catalog;
  readonly books: readonly CatalogBook[];
  readonly state: DashboardState;
  readonly sales: SalesHistory;
  readonly generatedAt: string;
  readonly buildVersion: string;
  readonly execution?: "local" | "codex-cloud";
  readonly progress?: Readonly<Record<string, BuildProgress>>;
  readonly bridge?: BridgeHealth | null;
};

export function buildDashboardSnapshot(input: SnapshotInput): DashboardSnapshotV2 {
  const stats = catalogStats(input.books);
  const sources = buildSources(input);
  return {
    version: 2,
    scope: "ai",
    execution: input.execution ?? "local",
    generatedAt: input.generatedAt,
    buildVersion: input.buildVersion,
    catalogVersion: `${input.catalog.generatedAt}:${input.books.length}`,
    salesVersion: `${input.sales.attemptedDate}:${input.sales.latestDate}:${input.sales.months[0]?.total ?? 0}`,
    metrics: {
      productCount: stats.productCount,
      workCount: stats.workCount,
      allFiveLive: stats.allFiveLive,
      reviewing: stats.reviewing,
      actionRequired: stats.actionRequired,
      knownAcrossFive: stats.knownAcrossFive,
      pdf: stats.pdf,
      epub: stats.epub,
      activeOperations: input.state.operations.filter(isActive).length,
      reviewOperations: input.state.operations.filter((operation) => operation.status === "awaiting_review").length,
      failedOperations: input.state.operations.filter((operation) => operation.status === "failed").length,
    },
    platforms: catalogPlatformStats(input.books),
    sources,
    operations: input.state.operations.map((operation) => {
      const metadataState = operation.artifact ? operation.metadataState ?? "missing" : "pending";
      const productionJob = input.state.jobs.find((job) =>
        job.operationId === operation.id
        && ["topic_insight", "book_build"].includes(job.type)
        && job.status === "claimed")
        ?? input.state.jobs.find((job) =>
          job.operationId === operation.id
          && ["topic_insight", "book_build"].includes(job.type)
          && job.status === "queued");
      const progress = input.progress?.[operation.id] ?? null;
      return {
        id: operation.id,
        title: operation.artifact?.title ?? operation.insight?.recommendedTitle ?? operation.direction,
        status: operation.status,
        createdAt: operation.createdAt,
        updatedAt: operation.updatedAt,
        isbn: operation.isbn ?? null,
        isbnStatus: operation.isbnStatus ?? null,
        distributionPlatforms: operation.distributionPlatforms ?? [],
        metadataState,
        productionJobState: productionJob?.status === "queued" || productionJob?.status === "claimed" ? productionJob.status : null,
        progress: progress ? { percent: progress.percent, label: progress.label, note: progress.note ?? null } : null,
        reviewArtifact: operation.artifact ? {
          title: operation.artifact.title,
          fingerprint: operation.artifact.fingerprint,
          characterCount: operation.artifact.characterCount,
          factCheckScore: operation.artifact.factCheckScore,
          epubCheckScore: operation.artifact.epubCheckScore,
          betaReadScore: operation.artifact.betaReadScore ?? null,
          betaReadSummary: operation.artifact.betaReadSummary ?? null,
        } : null,
      };
    }),
  };
}

function buildSources(input: SnapshotInput): readonly SourceStatus[] {
  const catalogAttempt = input.catalog.generatedAt;
  const kyoboEffective = input.catalog.sourceWorkbookUpdatedAt;
  const fiveEffective = input.catalog.fivePlatformWorkbookUpdatedAt;
  const salesState: SourceState = input.sales.sourceState === "fallback"
    ? "fallback"
    : freshnessState(`${input.sales.latestDate}T23:59:59+09:00`, input.generatedAt);
  return [
    sourceStatus("local-state", "fresh", input.generatedAt, input.generatedAt, input.state.operations.length),
    bridgeSourceStatus(input),
    sourceStatus("kyobo-catalog", freshnessState(kyoboEffective, input.generatedAt), catalogAttempt, kyoboEffective, input.books.length),
    sourceStatus("five-platform-catalog", freshnessState(fiveEffective, input.generatedAt), catalogAttempt, fiveEffective, input.books.length),
    sourceStatus("sales", salesState, `${input.sales.attemptedDate}T23:59:59+09:00`, `${input.sales.latestDate}T23:59:59+09:00`, null),
  ];
}

// 제작 엔진(브리지) heartbeat → 데이터 출처 카드. state.json의 "제작 중" 표시는
// 브리지가 죽어도 그대로 남으므로, 이 소스가 "진행 중 표시가 실제로 움직이는가"를
// 판별하는 유일한 화면 신호다. dead여도 제작 중 작업이 없으면 stale로 낮춰
// 불필요한 빨간 경보를 피한다.
function bridgeSourceStatus(input: SnapshotInput): SourceStatus {
  if (input.execution === "codex-cloud") {
    const runningJobs = input.state.jobs.filter((job) =>
      job.status === "claimed" && ["topic_insight", "book_build"].includes(job.type)).length;
    return {
      source: "production-bridge",
      state: "fresh",
      observedAt: input.generatedAt,
      attemptedAt: input.generatedAt,
      lastSuccessAt: input.generatedAt,
      effectiveDate: input.generatedAt.slice(0, 10),
      rowCount: runningJobs,
      errorCode: null,
    };
  }
  const bridge = input.bridge ?? null;
  const nowMs = Date.parse(input.generatedAt);
  const health = classifyBridgeHealth(bridge, Number.isNaN(nowMs) ? undefined : nowMs);
  const hasActiveProduction = input.state.operations.some((operation) =>
    ["insight_queued", "insight_processing", "build_queued", "building", "revision_requested"].includes(operation.status));
  const state: SourceState = health === "fresh" ? "fresh" : health === "stale" ? "stale" : hasActiveProduction ? "failed" : "stale";
  const observedAt = bridge?.lastPollAt ?? null;
  return {
    source: "production-bridge",
    state,
    observedAt,
    attemptedAt: input.generatedAt,
    lastSuccessAt: observedAt,
    effectiveDate: observedAt?.slice(0, 10) ?? null,
    rowCount: runningJobCount(bridge),
    errorCode: state === "failed" ? "bridge-signal-lost" : null,
  };
}

function sourceStatus(
  source: SourceStatus["source"],
  state: SourceState,
  attemptedAt: string,
  effectiveAt: string,
  rowCount: number | null,
): SourceStatus {
  return {
    source,
    state,
    observedAt: effectiveAt,
    attemptedAt,
    lastSuccessAt: state === "failed" ? null : effectiveAt,
    effectiveDate: effectiveAt.slice(0, 10),
    rowCount,
    errorCode: null,
  };
}

function freshnessState(effectiveAt: string, generatedAt: string): SourceState {
  const age = Date.parse(generatedAt) - Date.parse(effectiveAt);
  return age > 24 * 60 * 60 * 1_000 ? "stale" : "fresh";
}

function isActive(operation: Operation): boolean {
  return !["completed", "failed"].includes(operation.status);
}
