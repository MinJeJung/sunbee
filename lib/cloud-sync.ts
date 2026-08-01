import { createHash } from "node:crypto";
import type { DashboardState, Operation, OperationStatus } from "@/lib/types";

export type LocalArtifactPaths = {
  readonly operationId: string;
  readonly bookDirectory: string;
  readonly coverPath: string;
  readonly epubPath: string;
  readonly metaPath: string;
};

export function buildCloudReviewSnapshot(state: DashboardState): DashboardState {
  return {
    version: 1,
    operations: state.operations.filter((operation) => operation.status === "awaiting_review" && operation.artifact),
    jobs: [],
  };
}

const locallyOwnedStatuses: ReadonlySet<OperationStatus> = new Set([
  "isbn_processing",
  "isbn_applied",
  "distribution_processing",
  "completed",
]);

export function artifactFingerprint(cover: Uint8Array, epub: Uint8Array): string {
  return createHash("sha256").update(cover).update(epub).digest("hex");
}

export function mergeCloudReviewState(
  local: DashboardState,
  cloudOperations: readonly Operation[],
  paths: readonly LocalArtifactPaths[],
): DashboardState {
  const pathsByOperation = new Map(paths.map((entry) => [entry.operationId, entry]));
  const localById = new Map(local.operations.map((operation) => [operation.id, operation]));
  const replacements = new Map<string, Operation>();

  for (const cloud of cloudOperations) {
    const localOperation = localById.get(cloud.id);
    const localPaths = pathsByOperation.get(cloud.id);
    if (!cloud.artifact || !localPaths) continue;
    if (localOperation && (localOperation.approvedFingerprint || locallyOwnedStatuses.has(localOperation.status))) continue;

    const replacement: Operation = {
      ...(localOperation ?? cloud),
      ...cloud,
      status: "awaiting_review",
      artifact: {
        ...cloud.artifact,
        coverArtifactId: localPaths.coverPath,
        epubArtifactId: localPaths.epubPath,
      },
      bookDirectory: localPaths.bookDirectory,
      metaPath: localPaths.metaPath,
      metadataState: "ready",
    };
    delete replacement.approvedFingerprint;
    delete replacement.error;
    delete replacement.revisionNotes;
    delete replacement.revisionAttachments;
    replacements.set(cloud.id, replacement);
  }

  const operations = local.operations.map((operation) => replacements.get(operation.id) ?? operation);
  for (const cloud of cloudOperations) {
    const replacement = replacements.get(cloud.id);
    if (replacement && !localById.has(cloud.id)) operations.push(replacement);
  }

  const jobs = local.jobs.map((job) => {
    if (!replacements.has(job.operationId) || !["queued", "claimed"].includes(job.status)) return job;
    return {
      ...job,
      status: job.type === "book_build" ? "completed" as const : "failed" as const,
      updatedAt: replacements.get(job.operationId)?.updatedAt ?? job.updatedAt,
    };
  });
  return { version: 1, operations, jobs };
}
