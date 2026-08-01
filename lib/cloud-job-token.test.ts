import { afterEach, describe, expect, it, vi } from "vitest";
import { createCloudJobToken, verifyCloudJobToken } from "@/lib/cloud-job-token";

describe("cloud job callback token", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("authorizes only the scoped job before expiry", () => {
    // Given
    vi.stubEnv("CLOUD_CALLBACK_SECRET", "test-secret-with-enough-entropy-123456");
    const jobId = "fd8bebe7-9649-4d84-bfb5-f23475db9f98";
    const token = createCloudJobToken(jobId, new Date("2026-08-02T00:00:00.000Z"));

    // When / Then
    expect(verifyCloudJobToken(token, jobId, new Date("2026-08-01T12:00:00.000Z"))).toBe(true);
    expect(verifyCloudJobToken(token, "b4b9e770-d255-4d41-a47a-547312a3bb9e", new Date("2026-08-01T12:00:00.000Z"))).toBe(false);
    expect(verifyCloudJobToken(token, jobId, new Date("2026-08-02T00:00:00.001Z"))).toBe(false);
  });

  it("rejects a modified signature", () => {
    // Given
    vi.stubEnv("CLOUD_CALLBACK_SECRET", "test-secret-with-enough-entropy-123456");
    const jobId = "fd8bebe7-9649-4d84-bfb5-f23475db9f98";
    const token = createCloudJobToken(jobId, new Date("2026-08-02T00:00:00.000Z"));

    // When / Then
    expect(verifyCloudJobToken(`${token}x`, jobId, new Date("2026-08-01T12:00:00.000Z"))).toBe(false);
  });
});
