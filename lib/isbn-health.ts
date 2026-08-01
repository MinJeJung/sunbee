import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const DEFAULT_STATE_ROOT = "/Users/minje/Documents/Obsidian Vault/7_AI시스템/자동화프로젝트/출판자동화시스템/state";

const conflictsSchema = z.object({
  created_at: z.string(),
  conflict_count: z.number(),
  blocking_conflict_count: z.number(),
}).loose();

const poolExhaustedSchema = z.record(z.string(), z.object({ at: z.string() }).loose());

const blockingQueuesSchema = z.object({
  updated_at: z.string(),
  latest_reason: z.string(),
}).loose();

export interface IsbnHealth {
  conflicts: { createdAt: string; conflictCount: number; blockingConflictCount: number } | null;
  poolExhaustedEvents: { track: string; at: string }[];
  blockingQueues: { updatedAt: string; latestReason: string } | null;
}

async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    console.error(`ISBN 헬스 파일 읽기 실패(${filePath}):`, error instanceof Error ? error.message : error);
    return null;
  }
}

export async function readIsbnHealth(stateRoot = DEFAULT_STATE_ROOT): Promise<IsbnHealth> {
  const [conflictsRaw, poolRaw, queuesRaw] = await Promise.all([
    readJsonFile(path.join(stateRoot, "epub_isbn_global_conflicts.json")),
    readJsonFile(path.join(stateRoot, "isbn_pool_exhausted.json")),
    readJsonFile(path.join(stateRoot, "isbn_blocking_queues.json")),
  ]);

  const conflictsParsed = conflictsRaw === null ? null : conflictsSchema.safeParse(conflictsRaw);
  const poolParsed = poolRaw === null ? null : poolExhaustedSchema.safeParse(poolRaw);
  const queuesParsed = queuesRaw === null ? null : blockingQueuesSchema.safeParse(queuesRaw);

  return {
    conflicts: conflictsParsed?.success
      ? {
          createdAt: conflictsParsed.data.created_at,
          conflictCount: conflictsParsed.data.conflict_count,
          blockingConflictCount: conflictsParsed.data.blocking_conflict_count,
        }
      : null,
    poolExhaustedEvents: poolParsed?.success
      ? Object.entries(poolParsed.data).map(([track, event]) => ({ track: track.toUpperCase(), at: event.at }))
      : [],
    blockingQueues: queuesParsed?.success
      ? { updatedAt: queuesParsed.data.updated_at, latestReason: queuesParsed.data.latest_reason }
      : null,
  };
}
