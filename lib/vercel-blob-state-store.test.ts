import { describe, expect, it } from "vitest";
import { strongBlobEtag } from "@/lib/vercel-blob-state-store";

describe("Vercel Blob state store", () => {
  it("converts the weak ETag returned by get() into the strong ifMatch value", () => {
    expect(strongBlobEtag('W/"c4ecd50dfa9c1d5a2955c52cc7e411d4"')).toBe('"c4ecd50dfa9c1d5a2955c52cc7e411d4"');
    expect(strongBlobEtag('"c4ecd50dfa9c1d5a2955c52cc7e411d4"')).toBe('"c4ecd50dfa9c1d5a2955c52cc7e411d4"');
  });
});
