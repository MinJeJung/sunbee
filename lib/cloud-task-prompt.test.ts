import { describe, expect, it } from "vitest";
import { buildCloudTaskPrompt, type CloudDispatchPacket } from "@/lib/cloud-task-prompt";

describe("Codex Cloud task prompt", () => {
  it("carries every machine-consumed upload and callback endpoint", () => {
    // Given
    const packet: CloudDispatchPacket = {
      job: { id: "fd8bebe7-9649-4d84-bfb5-f23475db9f98", operationId: "b4b9e770-d255-4d41-a47a-547312a3bb9e", type: "book_build", status: "claimed", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
      operation: { id: "b4b9e770-d255-4d41-a47a-547312a3bb9e", direction: "데이터 분석 자동화", resources: [], createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", status: "building", insight: { recommendedTitle: "데이터 분석 자동화", targetReader: "분석가", readerPromise: "보고서를 자동화한다", keyInsights: ["검증 가능한 산출물"], chapterDirections: ["1장", "2장", "3장"], sourceNotes: [] } },
      uploads: [
        { artifactId: "gcs://bucket/artifacts/b4b9e770-d255-4d41-a47a-547312a3bb9e/cover.jpg", uploadUrl: "https://upload.example/cover", contentType: "image/jpeg" },
        { artifactId: "gcs://bucket/artifacts/b4b9e770-d255-4d41-a47a-547312a3bb9e/book.epub", uploadUrl: "https://upload.example/epub", contentType: "application/epub+zip" },
      ],
      callbackUrl: "https://dashboard.example/api/cloud/jobs/fd8bebe7-9649-4d84-bfb5-f23475db9f98/complete",
      callbackToken: "scoped-token",
      expiresAt: "2026-08-02T00:00:00.000Z",
    };

    // When
    const prompt = buildCloudTaskPrompt(packet);

    // Then
    expect(prompt).toContain("https://upload.example/cover");
    expect(prompt).toContain("https://upload.example/epub");
    expect(prompt).toContain(packet.callbackUrl);
    expect(prompt).toContain("Authorization: Bearer scoped-token");
  });
});
