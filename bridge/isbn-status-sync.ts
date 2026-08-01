import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Operation } from "../lib/types";

const operationsSchema = z.object({ operations: z.array(z.custom<Operation>()) });

function frontmatterValue(source: string, key: string) {
  const escaped = key.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`^${escaped}:\\s*(.*?)\\s*$`, "m"));
  return match?.[1]?.replace(/^(['"])(.*)\1$/, "$2").trim() ?? "";
}

/**
 * SEOJI 발급 확정(check_isbn 크론이 _meta.md를 issued로 갱신)을 대시보드 상태로 역동기화한다.
 * 실패는 조용히 넘기지 않고 로그로 남기되, 브리지 루프는 계속 돈다.
 */
export async function syncIssuedIsbnStatuses(baseUrl: string, headers: () => Record<string, string>) {
  const response = await fetch(`${baseUrl}/api/bridge/operations`, { headers: headers() });
  if (!response.ok) throw new Error(`ISBN 상태 조회 실패 (${response.status}): ${await response.text()}`);
  const { operations } = operationsSchema.parse(await response.json());

  for (const operation of operations) {
    if (operation.isbnStatus !== "applied" || !operation.artifact) continue;
    const metaPath = operation.metaPath ?? path.join(path.dirname(path.resolve(operation.artifact.epubArtifactId)), "_meta.md");
    let metaSource: string;
    try {
      metaSource = await readFile(metaPath, "utf8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
      console.error(`ISBN 발급 동기화 — _meta.md 읽기 실패(${metaPath}): ${error instanceof Error ? error.message : error}`);
      continue;
    }
    if (frontmatterValue(metaSource, "epub_isbn_status") !== "issued") continue;

    const update = await fetch(`${baseUrl}/api/bridge/operations/${encodeURIComponent(operation.id)}/isbn-status`, {
      method: "POST", headers: headers(), body: JSON.stringify({ isbnStatus: "issued" }),
    });
    if (!update.ok) {
      console.error(`ISBN 발급 동기화 실패(${operation.id}, ${update.status}): ${await update.text()}`);
      continue;
    }
    console.log(`ISBN 발급 확정 반영: ${operation.artifact.title} (${operation.isbn ?? "ISBN 미기록"})`);
  }
}
