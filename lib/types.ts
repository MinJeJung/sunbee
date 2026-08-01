export interface TopicInsight {
  readonly recommendedTitle: string;
  readonly targetReader: string;
  readonly readerPromise: string;
  readonly keyInsights: readonly string[];
  readonly chapterDirections: readonly string[];
  readonly sourceNotes: readonly { readonly url: string; readonly insight: string }[];
  readonly bookType?: "quick" | "standard" | "deep";
  readonly recommendedCharacters?: { readonly min: number; readonly max: number };
  readonly promiseChecklist?: readonly string[];
  readonly readerAssets?: readonly string[];
  readonly differentiation?: string;
}

export interface ProducedArtifact {
  title: string;
  coverArtifactId: string;
  epubArtifactId: string;
  fingerprint: string;
  characterCount: number;
  factCheckScore: number;
  epubCheckScore: number;
  betaReadScore?: number | undefined;
  betaReadSummary?: string | undefined;
}

export interface IsbnWorkflowResult {
  status: "completed";
  isbn: string;
  applicationNo: string;
  isbnStatus: "applied" | "issued";
  colophonStatus: "completed";
  bookSlug: string;
}

export type DistributionPlatform = "kyobo" | "yes24" | "ridi" | "aladin" | "millie";
export type ProductionJobType = "topic_insight" | "book_build";
export type RecoveryCause = "interrupted" | "timeout" | "provider_capacity" | "network" | "invalid_result" | "quality_gate" | "stalled" | "orphaned" | "unknown";

export type RecoveryRecord = {
  readonly at: string;
  readonly action: "retry" | "blocked";
  readonly cause: RecoveryCause;
  readonly summary: string;
  readonly jobType: ProductionJobType;
};

export interface DistributionWorkflowResult {
  status: "completed";
  platforms: DistributionPlatform[];
  epubArtifactId: string;
}

export interface RevisionAttachment {
  readonly id: string;
  readonly originalName: string;
  readonly contentType: "image/jpeg" | "image/png" | "image/webp";
  readonly size: number;
  readonly storageKey: string;
}

export type OperationStatus =
  | "insight_queued" | "insight_processing" | "plan_review" | "build_queued" | "building" | "awaiting_review"
  | "revision_requested" | "isbn_processing" | "isbn_applied" | "distribution_processing" | "completed" | "failed";

export interface Operation {
  id: string;
  direction: string;
  resources: string[];
  targetReader?: string;
  problem?: string;
  desiredOutcome?: string;
  recommendedOutline?: string;
  source?: "dashboard" | "dashboard_batch" | "hermes";
  batchId?: string;
  batchRow?: number;
  externalRequestId?: string;
  createdAt: string;
  updatedAt: string;
  status: OperationStatus;
  insight?: TopicInsight;
  artifact?: ProducedArtifact;
  approvedFingerprint?: string;
  revisionNotes?: string;
  revisionAttachments?: readonly RevisionAttachment[];
  reviewBatchId?: string;
  reviewEmailSentAt?: string;
  isbn?: string;
  isbnApplicationNo?: string;
  isbnStatus?: "applied" | "issued";
  colophonStatus?: "completed";
  distributionPlatforms?: DistributionPlatform[];
  bookDirectory?: string;
  metaPath?: string;
  metadataState?: "ready" | "missing";
  error?: string;
  recoveryAttempts?: number;
  recoveryHistory?: readonly RecoveryRecord[];
}

export type JobType = ProductionJobType | "review_email" | "isbn" | "distribution";
export interface Job {
  id: string;
  operationId: string;
  type: JobType;
  status: "queued" | "claimed" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  claimedAt?: string;
  operationIds?: string[];
}

export interface DashboardState {
  version: 1;
  operations: Operation[];
  jobs: Job[];
}

export function emptyState(): DashboardState {
  return { version: 1, operations: [], jobs: [] };
}
