import { readFile } from "node:fs/promises";
import { put } from "@vercel/blob";
import { z } from "zod";
import { createCloudBatchSeed } from "@/lib/cloud-batch-seed";
import { dashboardStateSchema } from "@/lib/state-schema";

const sourcePath = z.string().min(1).parse(process.env["CLOUD_SEED_SOURCE_STATE"]);
const batchId = z.string().min(1).parse(process.env["CLOUD_SEED_BATCH_ID"]);
const allowOverwrite = process.env["CLOUD_SEED_ALLOW_OVERWRITE"] === "true";

async function main(): Promise<void> {
  const source = dashboardStateSchema.parse(JSON.parse(await readFile(sourcePath, "utf8")));
  const seeded = createCloudBatchSeed(source, batchId, new Date().toISOString());
  await put("state/dashboard.json", JSON.stringify(seeded, null, 2), {
    access: "private",
    allowOverwrite,
    contentType: "application/json; charset=utf-8",
    cacheControlMaxAge: 60,
  });
  process.stdout.write(`operations=${seeded.operations.length} jobs=${seeded.jobs.length}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
