import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { catalogSchema, catalogWorkMatchKeys, type CatalogBook } from "@/lib/catalog-schema";
import type { CatalogScope } from "@/lib/dashboard-domain";
import { readCatalog } from "@/lib/catalog";

export async function readScopedCatalog(scope: CatalogScope, aiBooks?: readonly CatalogBook[]): Promise<readonly CatalogBook[]> {
  const ai = aiBooks ?? (await readCatalog()).books;
  if (scope === "ai") return ai;
  const filePath = process.env["KYOBO_ALL_CATALOG_PATH"]?.trim() || path.join(process.cwd(), "data", "kyobo-all-catalog.json");
  const full = catalogSchema.parse(JSON.parse(await readFile(/* turbopackIgnore: true */ filePath, "utf8")));
  const aiKeys = new Set(ai.flatMap(catalogWorkMatchKeys));
  return full.books.filter((book) => !catalogWorkMatchKeys(book).some((key) => aiKeys.has(key)));
}
