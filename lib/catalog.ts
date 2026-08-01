import "server-only";

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { catalogSchema, type Catalog } from "@/lib/catalog-schema";

export * from "@/lib/catalog-schema";

function catalogPath(): string {
  return process.env["CATALOG_PATH"]?.trim() || path.join(process.cwd(), "data", "catalog.json");
}

const catalogCache = new Map<string, { mtimeMs: number; catalog: Catalog }>();

async function readCatalogCandidate(filePath: string): Promise<Catalog | null> {
  let mtimeMs: number;
  try {
    mtimeMs = (await stat(filePath)).mtimeMs;
  } catch {
    return null;
  }
  const cached = catalogCache.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.catalog;
  try {
    const parsed = catalogSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
    catalogCache.set(filePath, { mtimeMs, catalog: parsed });
    return parsed;
  } catch (error) {
    // 생성 스크립트가 쓰는 도중이거나 손상된 후보는 건너뛰고 다른 후보로 계속한다.
    console.error(`원장 후보 읽기 실패(건너뜀): ${filePath}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

export async function readCatalog(): Promise<Catalog> {
  const catalog = await readCatalogCandidate(catalogPath());
  if (!catalog) throw new Error("정본 catalog.json을 읽을 수 없습니다. build_kyobo_catalog.py로 원장을 생성하세요.");
  return catalog;
}
