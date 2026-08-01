import { z } from "zod";
import type { DashboardState } from "@/lib/types";
import { enqueueTopic } from "@/lib/topic-intake";

export type BulkBookRow = {
  readonly rowNumber: number;
  readonly targetReader: string;
  readonly problem: string;
  readonly desiredOutcome: string;
  readonly resources: readonly string[];
  readonly recommendedOutline: string;
  readonly errors: readonly string[];
};

export type BulkParseResult = {
  readonly rows: readonly BulkBookRow[];
  readonly validCount: number;
  readonly invalidCount: number;
};

const URL_SCHEMA = z.url();

function cell(record: Readonly<Record<string, unknown>>, ...keys: readonly string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") return String(value).trim();
  }
  return "";
}

function resourceCells(record: Readonly<Record<string, unknown>>): readonly string[] {
  const joined = cell(record, "참고 링크", "참고링크", "source_links", "resources");
  return [
    cell(record, "논문/유튜브 링크1", "논문/유튜브링크1", "링크1", "source_link_1"),
    cell(record, "논문/유튜브 링크2", "논문/유튜브링크2", "링크2", "source_link_2"),
    ...joined.split(/[\n,]/),
  ].map((value) => value.trim()).filter(Boolean);
}

export function parseBulkRows(records: readonly Readonly<Record<string, unknown>>[]): BulkParseResult {
  const fingerprints = new Set<string>();
  const rows = records.map((record, index): BulkBookRow => {
    const targetReader = cell(record, "예상독자", "예상 독자", "target_reader");
    const direction = cell(record, "책 제작 방향성", "책제작방향성", "direction");
    const problem = cell(record, "독자의 문제", "문제", "problem") || direction;
    const desiredOutcome = cell(record, "기대 결과", "원하는 결과", "desired_outcome") || direction;
    const recommendedOutline = cell(record, "추천 목차 구성", "추천목차구성", "추천 목차", "outline");
    const resources = resourceCells(record);
    const errors: string[] = [];
    if (!targetReader) errors.push("예상독자를 입력해 주세요.");
    if (problem.length < 5) errors.push("독자의 문제 또는 책 제작 방향성을 5자 이상 입력해 주세요.");
    if (desiredOutcome.length < 5) errors.push("기대 결과 또는 책 제작 방향성을 5자 이상 입력해 주세요.");
    if (resources.some((url) => !URL_SCHEMA.safeParse(url).success)) errors.push("유효한 URL만 입력해 주세요.");
    const fingerprint = `${targetReader}|${problem}|${desiredOutcome}|${resources.join("|")}`.toLocaleLowerCase("ko-KR");
    if (fingerprints.has(fingerprint)) errors.push("같은 파일 안의 중복 행입니다.");
    fingerprints.add(fingerprint);
    return { rowNumber: index + 2, targetReader, problem, desiredOutcome, resources, recommendedOutline, errors };
  });
  return { rows, validCount: rows.filter((row) => row.errors.length === 0).length, invalidCount: rows.filter((row) => row.errors.length > 0).length };
}

export function enqueueBulkTopics(
  state: DashboardState,
  rows: readonly BulkBookRow[],
  batchId: string,
  now: string,
  createId: () => string,
): DashboardState {
  return rows.filter((row) => row.errors.length === 0).reduce((current, row) => enqueueTopic(current, {
    direction: `${row.problem}\n\n기대 결과: ${row.desiredOutcome}`,
    targetReader: row.targetReader,
    problem: row.problem,
    desiredOutcome: row.desiredOutcome,
    resources: row.resources,
    recommendedOutline: row.recommendedOutline,
    source: "dashboard_batch",
    batchId,
    batchRow: row.rowNumber,
  }, now, createId).state, state);
}
