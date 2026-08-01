import { describe, expect, it } from "vitest";
import { artifactContentType, artifactObjectName, cloudArtifactId, parseCloudArtifactId } from "@/lib/cloud-artifact-store";

describe("cloud artifact identifiers", () => {
  it("builds stable object names for every review artifact", () => {
    // Given
    const operationId = "fd8bebe7-9649-4d84-bfb5-f23475db9f98";

    // When / Then
    expect(artifactObjectName(operationId, "cover")).toBe(`artifacts/${operationId}/cover.jpg`);
    expect(artifactObjectName(operationId, "epub")).toBe(`artifacts/${operationId}/book.epub`);
    expect(artifactObjectName(operationId, "manuscript")).toBe(`artifacts/${operationId}/manuscript.md`);
  });

  it("round-trips a scoped GCS artifact identifier", () => {
    // Given
    const objectName = "artifacts/fd8bebe7-9649-4d84-bfb5-f23475db9f98/book.epub";

    // When
    const parsed = parseCloudArtifactId(cloudArtifactId("sunbee-books", objectName));

    // Then
    expect(parsed).toEqual({ bucket: "sunbee-books", objectName });
  });

  it("uses the normalized markdown media type required by signed Blob uploads", () => {
    expect(artifactContentType("manuscript")).toBe("text/markdown");
    expect(artifactContentType("meta")).toBe("text/markdown");
  });

  it("rejects path traversal in an artifact identifier", () => {
    // Given / When / Then
    expect(() => parseCloudArtifactId("gcs://sunbee-books/artifacts/../state/dashboard.json"))
      .toThrow("클라우드 산출물 경로");
  });
});
