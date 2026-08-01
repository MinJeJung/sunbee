import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readDistributionPlatforms } from "./distribution";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function writeMeta(lines: string[]) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "distribution-meta-"));
  temporaryDirectories.push(directory);
  const metaPath = path.join(directory, "_meta.md");
  await writeFile(metaPath, `---\n${lines.join("\n")}\n---\n`, "utf8");
  return metaPath;
}

describe("readDistributionPlatforms", () => {
  it("accepts all five platforms only after review or live registration", async () => {
    const metaPath = await writeMeta([
      "epub_dist_kyobo_status: review",
      "epub_dist_yes24_status: live",
      "epub_dist_ridi_status: review",
      "epub_dist_aladin_status: review",
      "epub_dist_millie_status: live",
    ]);

    await expect(readDistributionPlatforms(metaPath)).resolves.toEqual(["kyobo", "yes24", "ridi", "aladin", "millie"]);
  });

  it("rejects a partial five-platform result", async () => {
    const metaPath = await writeMeta([
      "epub_dist_kyobo_status: review",
      "epub_dist_yes24_status: failed",
      "epub_dist_ridi_status: review",
      "epub_dist_aladin_status: review",
      "epub_dist_millie_status: review",
    ]);

    await expect(readDistributionPlatforms(metaPath)).rejects.toThrow("yes24");
  });
});
