import { z } from "zod";
import type { CatalogPlatformStat } from "@/lib/catalog-schema";
import type { DistributionPlatform } from "@/lib/types";

export type SourceState = "fresh" | "stale" | "fallback" | "failed";

export type SourceStatus = {
  readonly source: "local-state" | "production-bridge" | "kyobo-catalog" | "five-platform-catalog" | "sales";
  readonly state: SourceState;
  readonly observedAt: string | null;
  readonly attemptedAt: string | null;
  readonly lastSuccessAt: string | null;
  readonly effectiveDate: string | null;
  readonly rowCount: number | null;
  readonly errorCode: string | null;
};

export type DashboardOperation = {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly isbn: string | null;
  readonly isbnStatus: "applied" | "issued" | null;
  readonly distributionPlatforms: readonly DistributionPlatform[];
  readonly metadataState: "pending" | "ready" | "missing";
  readonly productionJobState: "queued" | "claimed" | null;
  readonly progress: {
    readonly percent: number;
    readonly label: string;
    readonly note: string | null;
  } | null;
  readonly reviewArtifact: {
    readonly title: string;
    readonly fingerprint: string;
    readonly characterCount: number;
    readonly factCheckScore: number;
    readonly epubCheckScore: number;
  } | null;
};

export type DashboardMetrics = {
  readonly productCount: number;
  readonly workCount: number;
  readonly allFiveLive: number;
  readonly reviewing: number;
  readonly actionRequired: number;
  readonly knownAcrossFive: number;
  readonly pdf: number;
  readonly epub: number;
  readonly activeOperations: number;
  readonly reviewOperations: number;
  readonly failedOperations: number;
};

export type DashboardSnapshotV2 = {
  readonly version: 2;
  readonly scope: "ai";
  readonly generatedAt: string;
  readonly buildVersion: string;
  readonly catalogVersion: string;
  readonly salesVersion: string;
  readonly metrics: DashboardMetrics;
  readonly platforms: readonly CatalogPlatformStat[];
  readonly sources: readonly SourceStatus[];
  readonly operations: readonly DashboardOperation[];
};

const sourceStatusSchema = z.object({
  source: z.enum(["local-state", "production-bridge", "kyobo-catalog", "five-platform-catalog", "sales"]),
  state: z.enum(["fresh", "stale", "fallback", "failed"]),
  observedAt: z.string().nullable(),
  attemptedAt: z.string().nullable(),
  lastSuccessAt: z.string().nullable(),
  effectiveDate: z.string().nullable(),
  rowCount: z.number().nullable(),
  errorCode: z.string().nullable(),
});

export const dashboardSnapshotSchema = z.object({
  version: z.literal(2),
  scope: z.literal("ai"),
  generatedAt: z.string(),
  buildVersion: z.string(),
  catalogVersion: z.string(),
  salesVersion: z.string(),
  metrics: z.object({
    productCount: z.number(),
    workCount: z.number(),
    allFiveLive: z.number(),
    reviewing: z.number(),
    actionRequired: z.number(),
    knownAcrossFive: z.number(),
    pdf: z.number(),
    epub: z.number(),
    activeOperations: z.number(),
    reviewOperations: z.number(),
    failedOperations: z.number(),
  }),
  platforms: z.array(z.object({
    key: z.enum(["kyobo", "yes24", "ridi", "aladin", "millie"]),
    label: z.string(),
    covered: z.number(),
    live: z.number(),
    registered: z.number(),
    review: z.number(),
    supplement: z.number(),
    rejected: z.number(),
    missing: z.number(),
  })),
  sources: z.array(sourceStatusSchema),
  operations: z.array(z.object({
    id: z.string(),
    title: z.string(),
    status: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    isbn: z.string().nullable(),
    isbnStatus: z.enum(["applied", "issued"]).nullable(),
    distributionPlatforms: z.array(z.enum(["kyobo", "yes24", "ridi", "aladin", "millie"])),
    metadataState: z.enum(["pending", "ready", "missing"]),
    productionJobState: z.enum(["queued", "claimed"]).nullable(),
    progress: z.object({
      percent: z.number(),
      label: z.string(),
      note: z.string().nullable(),
    }).nullable(),
    reviewArtifact: z.object({
      title: z.string(),
      fingerprint: z.string(),
      characterCount: z.number(),
      factCheckScore: z.number(),
      epubCheckScore: z.number(),
    }).nullable(),
  })),
});
