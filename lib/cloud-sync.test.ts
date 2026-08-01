import { describe, expect, it } from "vitest";
import { artifactFingerprint, buildCloudReviewSnapshot, mergeCloudReviewState, type LocalArtifactPaths } from "@/lib/cloud-sync";
import type { DashboardState, Operation } from "@/lib/types";

const operationId = "5693ae1c-e171-44f3-a311-b0400ec816de";
const jobId = "3ec2cde0-0960-4b0c-854c-104b65392602";

function cloudOperation(): Operation {
  return {
    id: operationId,
    direction: "AI 업무 자동화",
    resources: ["https://example.com/source"],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T09:20:00.000Z",
    status: "awaiting_review",
    artifact: {
      title: "AI 업무 자동화 실전",
      coverArtifactId: "blob://artifacts/cloud/cover.jpg",
      epubArtifactId: "blob://artifacts/cloud/book.epub",
      fingerprint: "cloud-fingerprint",
      characterCount: 54_000,
      factCheckScore: 96,
      epubCheckScore: 100,
    },
  };
}

const localPaths: LocalArtifactPaths = {
  operationId,
  bookDirectory: "/books/cloud/5693",
  coverPath: "/books/cloud/5693/cover.jpg",
  epubPath: "/books/cloud/5693/book.epub",
  metaPath: "/books/cloud/5693/_meta.md",
};

describe("mergeCloudReviewState", () => {
  it("replaces an unfinished local build with the completed cloud artifact", () => {
    const unfinished = cloudOperation();
    delete unfinished.artifact;
    const local: DashboardState = {
      version: 1,
      operations: [{ ...unfinished, status: "failed", error: "stopped" }],
      jobs: [{ id: jobId, operationId, type: "book_build", status: "claimed", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }],
    };

    const merged = mergeCloudReviewState(local, [cloudOperation()], [localPaths]);

    expect(merged.operations[0]).toMatchObject({
      id: operationId,
      status: "awaiting_review",
      bookDirectory: localPaths.bookDirectory,
      metaPath: localPaths.metaPath,
      metadataState: "ready",
      artifact: { coverArtifactId: localPaths.coverPath, epubArtifactId: localPaths.epubPath },
    });
    expect(merged.operations[0]?.error).toBeUndefined();
    expect(merged.jobs[0]?.status).toBe("completed");
  });

  it("preserves a locally approved workflow that already reached ISBN", () => {
    const approved = { ...cloudOperation(), status: "isbn_applied" as const, approvedFingerprint: "approved-local" };
    const local: DashboardState = { version: 1, operations: [approved], jobs: [] };

    const merged = mergeCloudReviewState(local, [cloudOperation()], [localPaths]);

    expect(merged.operations[0]).toEqual(approved);
  });
});

describe("buildCloudReviewSnapshot", () => {
  it("exports only completed books awaiting local review", () => {
    const ready = cloudOperation();
    const building: Operation = { ...cloudOperation(), id: "40f3993d-0951-4ed3-b16e-37646ae8a3d8", status: "building" };
    const state: DashboardState = {
      version: 1,
      operations: [ready, building],
      jobs: [{ id: jobId, operationId, type: "book_build", status: "completed", createdAt: ready.createdAt, updatedAt: ready.updatedAt }],
    };

    expect(buildCloudReviewSnapshot(state)).toEqual({ version: 1, operations: [ready], jobs: [] });
  });
});

describe("artifactFingerprint", () => {
  it("hashes cover bytes followed by EPUB bytes", () => {
    expect(artifactFingerprint(new Uint8Array([1, 2]), new Uint8Array([3, 4]))).toBe(
      "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
    );
  });
});
