import { z } from "zod";
import type { DashboardState } from "@/lib/types";

const topicInsightSchema = z.object({
  recommendedTitle: z.string(),
  targetReader: z.string(),
  readerPromise: z.string(),
  keyInsights: z.array(z.string()),
  chapterDirections: z.array(z.string()),
  sourceNotes: z.array(z.object({ url: z.string(), insight: z.string() })),
  bookType: z.enum(["quick", "standard", "deep"]).optional(),
  recommendedCharacters: z.object({ min: z.number(), max: z.number() }).optional(),
  promiseChecklist: z.array(z.string()).optional(),
  readerAssets: z.array(z.string()).optional(),
  differentiation: z.string().optional(),
});

const artifactSchema = z.object({
  title: z.string(),
  coverArtifactId: z.string(),
  epubArtifactId: z.string(),
  fingerprint: z.string(),
  characterCount: z.number(),
  factCheckScore: z.number(),
  epubCheckScore: z.number(),
});

const revisionAttachmentSchema = z.object({
  id: z.string(),
  originalName: z.string(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number(),
  storageKey: z.string(),
});

const recoveryRecordSchema = z.object({
  at: z.string(),
  action: z.enum(["retry", "blocked"]),
  cause: z.enum(["interrupted", "timeout", "provider_capacity", "network", "invalid_result", "quality_gate", "stalled", "orphaned", "unknown"]),
  summary: z.string(),
  jobType: z.enum(["topic_insight", "book_build"]),
});

const operationSchema = z.object({
  id: z.string(),
  direction: z.string(),
  resources: z.array(z.string()),
  targetReader: z.string().optional(),
  problem: z.string().optional(),
  desiredOutcome: z.string().optional(),
  recommendedOutline: z.string().optional(),
  source: z.enum(["dashboard", "dashboard_batch", "hermes"]).optional(),
  batchId: z.string().optional(),
  batchRow: z.number().optional(),
  externalRequestId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: z.enum(["insight_queued", "insight_processing", "plan_review", "build_queued", "building", "awaiting_review", "revision_requested", "isbn_processing", "isbn_applied", "distribution_processing", "completed", "failed"]),
  insight: topicInsightSchema.optional(),
  artifact: artifactSchema.optional(),
  approvedFingerprint: z.string().optional(),
  revisionNotes: z.string().optional(),
  revisionAttachments: z.array(revisionAttachmentSchema).optional(),
  reviewBatchId: z.string().optional(),
  reviewEmailSentAt: z.string().optional(),
  isbn: z.string().optional(),
  isbnApplicationNo: z.string().optional(),
  isbnStatus: z.enum(["applied", "issued"]).optional(),
  colophonStatus: z.literal("completed").optional(),
  distributionPlatforms: z.array(z.enum(["kyobo", "yes24", "ridi", "aladin", "millie"])).optional(),
  bookDirectory: z.string().optional(),
  metaPath: z.string().optional(),
  metadataState: z.enum(["ready", "missing"]).optional(),
  error: z.string().optional(),
  recoveryAttempts: z.number().optional(),
  recoveryHistory: z.array(recoveryRecordSchema).optional(),
});

const jobSchema = z.object({
  id: z.string(),
  operationId: z.string(),
  type: z.enum(["topic_insight", "book_build", "review_email", "isbn", "distribution"]),
  status: z.enum(["queued", "claimed", "completed", "failed"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  claimedAt: z.string().optional(),
  operationIds: z.array(z.string()).optional(),
});

const rawDashboardStateSchema = z.object({
  version: z.literal(1),
  operations: z.array(operationSchema),
  jobs: z.array(jobSchema),
});

export const dashboardStateSchema = z.custom<DashboardState>(
  (value) => rawDashboardStateSchema.safeParse(value).success,
  "대시보드 상태 형식이 올바르지 않습니다.",
);
