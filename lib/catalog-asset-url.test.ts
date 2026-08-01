import { describe, expect, it } from "vitest";
import { catalogAssetUrl } from "@/lib/catalog-asset-url";

describe("catalog asset URLs", () => {
  it("routes pipeline books through the operation artifact API", () => {
    expect(catalogAssetUrl("pipeline:book-operation-id", "cover"))
      .toBe("/api/artifacts/book-operation-id?kind=cover");
    expect(catalogAssetUrl("pipeline:book-operation-id", "epub"))
      .toBe("/api/artifacts/book-operation-id?kind=epub");
  });

  it("keeps existing catalog books on the library asset API", () => {
    expect(catalogAssetUrl("legacy/book id", "cover", true))
      .toBe("/api/library/legacy%2Fbook%20id/asset?kind=cover&thumb=1");
  });
});
