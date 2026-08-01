import { afterEach, describe, expect, it, vi } from "vitest";
import { isLocalDashboardTrusted } from "@/lib/local-dashboard-auth";

describe("local dashboard authentication", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("trusts the dashboard when the local-only mode is explicitly enabled", () => {
    // Given
    vi.stubEnv("LOCAL_DASHBOARD_TRUSTED", "true");

    // When
    const authenticated = isLocalDashboardTrusted();

    // Then
    expect(authenticated).toBe(true);
  });

  it("keeps password authentication enabled by default", () => {
    // Given
    vi.stubEnv("LOCAL_DASHBOARD_TRUSTED", "false");

    // When
    const authenticated = isLocalDashboardTrusted();

    // Then
    expect(authenticated).toBe(false);
  });
});
