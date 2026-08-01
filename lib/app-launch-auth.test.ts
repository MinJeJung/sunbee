import { describe, expect, it } from "vitest";
import { createAppLaunchSignature, verifyAppLaunchSignature } from "@/lib/app-launch-auth";

describe("cloud desktop app launch authentication", () => {
  const secret = "a-secure-cloud-app-launch-secret-that-is-long-enough";
  const now = 1_785_573_600;

  it("accepts a current signed launch and rejects replay after the short window", () => {
    const signature = createAppLaunchSignature(now, secret);
    expect(verifyAppLaunchSignature({ timestamp: now, signature, secret, nowSeconds: now + 30 })).toBe(true);
    expect(verifyAppLaunchSignature({ timestamp: now, signature, secret, nowSeconds: now + 121 })).toBe(false);
  });

  it("rejects an altered signature", () => {
    const signature = createAppLaunchSignature(now, secret);
    expect(verifyAppLaunchSignature({ timestamp: now, signature: `0${signature.slice(1)}`, secret, nowSeconds: now })).toBe(false);
  });
});
