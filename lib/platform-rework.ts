import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  type ReworkBoardSummary,
  type ReworkItem,
  type ReworkPlatform,
  type ReworkStage,
} from "@/lib/rework-domain";

export { REWORK_PLATFORMS, REWORK_STAGE_LABELS, REWORK_STAGES } from "@/lib/rework-domain";
export type { ReworkBoardSummary, ReworkItem, ReworkPlatform, ReworkStage } from "@/lib/rework-domain";

const DIST_LOGS_DIR = "/Users/minje/Documents/Obsidian Vault/7_AI시스템/자동화프로젝트/ebook-distribution-epub/logs";
export const BOOKS_ROOT = "/Users/minje/Documents/Obsidian Vault/3_출판 및 SNS/전자책원고";

const SNAPSHOT_PATH = "/Users/minje/Documents/Obsidian Vault/7_AI시스템/자동화프로젝트/ebook-distribution-epub/logs/platform_status_snapshot_latest.json";

export const REWORK_PLATFORM_LABELS: Record<ReworkPlatform, string> = {
  millie: "밀리의서재", kyobo: "교보문고", yes24: "YES24", ridi: "리디", aladin: "알라딘",
};

export interface ReworkStateEntry {
  stage: ReworkStage;
  updatedAt?: string;
  run?: { status: "running" | "done" | "failed"; note?: string; at: string };
}

const RUN_STALE_MS = 90 * 60_000; // 90분 넘게 running이면 중단으로 간주

export function runInfoOf(entry: ReworkStateEntry | undefined): { runStatus?: "running" | "failed"; runNote?: string } {
  const run = entry?.run;
  if (!run) return {};
  if (run.status === "running") {
    if (Date.now() - Date.parse(run.at) > RUN_STALE_MS) return { runStatus: "failed", runNote: "실행 시간 초과 — 로그 확인 후 다시 시도" };
    return { runStatus: "running" };
  }
  if (run.status === "failed") return { runStatus: "failed", ...(run.note ? { runNote: run.note } : {}) };
  return {};
}

export interface ReworkBoard {
  platform: ReworkPlatform;
  label: string;
  note: string;
  items: ReworkItem[];
  stageCounts: Record<ReworkStage, number>;
}

export function summarizeReworkBoard(board: ReworkBoard): ReworkBoardSummary {
  return { platform: board.platform, label: board.label, note: board.note, total: board.items.length, stageCounts: board.stageCounts };
}

export function reworkStatePath() {
  return path.join(process.cwd(), "data", "platform-rework.json");
}

// 작업판 제외 목록 — vault 밖 구간 도서 등 사용자가 별도 관리하는 항목 (플랫폼:도서코드)
const REWORK_EXCLUDED = new Set([
  "millie:179589777", // 우리집, 돈과 행운을 부르는 그림 그리기 (vault 미매칭 — 사용자 제외 지시 2026-07-15)
]);

function millieGuidance(reason: string, contentType: string): string {
  // 포괄 기준 안내문(저작권·중복·정가 기준 열거) — 구체 사유 불특정 반려는 중복과 구분한다
  if (reason.includes("아래 기준에 해당")) {
    return "포괄 기준 반려 (저작권·중복·정가 중 불특정) — EPUB 단독 재제작 후 재제출하되, AI 콘텐츠 기준 반려 가능성이 있어 재반려 시 contents@millie.town 문의 권장";
  }
  if (reason.includes("동일 도서") || reason.includes("중복으로 공급")) {
    return contentType.toLowerCase().includes("pdf")
      ? "중복 정책 반려 — PDF 재제출 금지. EPUB 단독으로 재제작해 제출"
      : "중복 정책 반려 — 기존 서비스본과 충돌. 서비스 중 판본 확인 후 교체 여부 결정";
  }
  if (reason.includes("파일") || reason.includes("교체")) return "파일 보완 반려 — 지적 사항 수정 후 같은 형식으로 재제출";
  if (!reason) return "사유 미수집 — 밀리 파트너 사이트에서 반려 사유 확인";
  return "사유 검토 후 보완 재제출";
}

function platformGuidance(platform: ReworkPlatform, status: string): string {
  if (platform === "kyobo") return "교보 보류(보완 요청) — 보류 사유 확인 후 보완 재제출";
  if (status === "suspended") return "판매중지 — 중지 사유 확인 후 재판매 신청 또는 재등록";
  return "상태 확인 후 보완 재제출";
}

const snapshotEntrySchema = z.object({
  status: z.string(),
  reason: z.string().optional(),
  status_raw: z.string().optional(),
  title: z.string().optional(),
  content_type: z.string().optional(),
  isbn: z.string().optional(),
}).loose();

const approvalListSchema = z.object({
  source: z.string(),
  importedAt: z.string(),
  books: z.array(z.object({
    code: z.string(), title: z.string(), isbn: z.string().optional(), status: z.string(),
    reason: z.string().optional(), contentType: z.string().optional(), vaultSlug: z.string().optional(),
    isbnMismatch: z.string().optional(),
  }).loose()),
}).loose();

async function readJson(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

export function isSafeSlug(slug: string) {
  return Boolean(slug) && !slug.includes("/") && !slug.includes("\\") && !slug.includes("..");
}

/** 검수 대상 EPUB 선택: _meta.md의 epub 필드가 실재하면 그것, 아니면 최신 수정 .epub */
export async function resolveReviewEpub(slug: string): Promise<string | null> {
  if (!isSafeSlug(slug)) return null;
  const folder = path.join(BOOKS_ROOT, slug);
  try {
    const metaText = await readFile(path.join(folder, "_meta.md"), "utf8");
    const match = metaText.match(/^epub:\s*(\S+)\s*$/m);
    const declared = match?.[1]?.replace(/^(['"])(.*)\1$/, "$2");
    if (declared && !declared.includes("/")) {
      try {
        await stat(path.join(folder, declared));
        return declared;
      } catch {
        // 아래 최신본 탐색으로 폴백
      }
    }
  } catch {
    // _meta 없음 — 최신본 탐색
  }
  try {
    const epubs = (await readdir(folder)).filter((name) => name.endsWith(".epub"));
    if (!epubs.length) return null;
    const withTimes = await Promise.all(epubs.map(async (name) => ({ name, mtime: (await stat(path.join(folder, name))).mtimeMs })));
    withTimes.sort((left, right) => right.mtime - left.mtime);
    return withTimes[0]?.name ?? null;
  } catch {
    return null;
  }
}

async function attachReviewAssets(item: ReworkItem): Promise<ReworkItem> {
  if (!item.slug || !isSafeSlug(item.slug)) return item;
  let hasCover = false;
  try {
    await stat(path.join(BOOKS_ROOT, item.slug, "cover.jpg"));
    hasCover = true;
  } catch {
    hasCover = false;
  }
  const epubFile = await resolveReviewEpub(item.slug);
  return { ...item, hasCover, epubFile: epubFile ?? undefined };
}

export async function loadReworkBoards(): Promise<{ boards: ReworkBoard[]; millieSource: string | null }> {
  const stagesRaw = await readJson(reworkStatePath());
  const stages = (stagesRaw ?? {}) as Record<string, ReworkStateEntry>;
  const stageOf = (platform: string, id: string): ReworkStage => stages[`${platform}:${id}`]?.stage ?? "todo";
  const runOf = (platform: string, id: string) => runInfoOf(stages[`${platform}:${id}`]);

  const boards: ReworkBoard[] = [];
  let millieSource: string | null = null;

  const snapshotRawEarly = await readJson(SNAPSHOT_PATH);
  const snapshotPlatforms = ((snapshotRawEarly ?? {}) as { platforms?: Record<string, Record<string, unknown>> }).platforms ?? {};

  // 밀리 — 승인 현황 엑셀(공식 목록)이 원천
  const approvalRaw = await readJson(path.join(process.cwd(), "data", "millie_approval_list.json"));
  if (approvalRaw) {
    const parsed = approvalListSchema.safeParse(approvalRaw);
    if (parsed.success) {
      millieSource = `${parsed.data.source} (${parsed.data.importedAt.slice(0, 16).replace("T", " ")})`;
      // 재신청 자동 감지: 같은 책의 다른 판본이 승인 대기 또는 서비스 중이면 재제출 완료로 본다.
      // 슬러그 + 정규화 제목 이중 매칭 — 밀리 등록 ISBN 오입력이 있어도 제목으로 형제를 잡는다 (2026-07-16).
      const normTitle = (value: string) => value.replaceAll(/[^0-9a-zA-Z가-힣]/g, "").toLowerCase();
      const pendingSlugs = new Set(parsed.data.books
        .filter((book) => book.status === "승인 대기" && book.vaultSlug)
        .map((book) => book.vaultSlug as string));
      const pendingTitles = new Set(parsed.data.books
        .filter((book) => book.status === "승인 대기")
        .map((book) => normTitle(book.title)));
      const servingSlugs = new Set(Object.entries(snapshotPlatforms["millie"] ?? {}).flatMap(([key, value]) => {
        const entry = snapshotEntrySchema.safeParse(value);
        return entry.success && entry.data.status === "approved" && key.includes("@") ? [key.slice(0, key.lastIndexOf("@"))] : [];
      }));
      const items = await Promise.all(parsed.data.books
        .filter((book) => book.status === "반려" && !REWORK_EXCLUDED.has(`millie:${book.code}`))
        .map((book) => {
          const slug = book.vaultSlug ?? "";
          const pending = Boolean((slug && pendingSlugs.has(slug)) || pendingTitles.has(normTitle(book.title)));
          const serving = Boolean(slug && servingSlugs.has(slug));
          const autoDetected = pending || serving;
          const mismatchNote = book.isbnMismatch
            ? ` ⚠️ 밀리 등록 ISBN이 vault 기준 다른 책(${book.isbnMismatch})의 번호 — 재제출 시 ISBN 교정 필요.`
            : "";
          return attachReviewAssets({
            id: book.code,
            title: book.title,
            slug,
            format: book.contentType ?? "",
            statusRaw: "반려",
            reason: book.reason ?? "",
            guidance: (autoDetected
              ? (serving ? "다른 판본이 이미 서비스 중 — 조치 불필요" : "다른 판본이 이미 승인 대기 중 — 재신청 완료, 밀리 검수 결과 대기")
              : millieGuidance(book.reason ?? "", book.contentType ?? "")) + mismatchNote,
            stage: autoDetected ? "resubmitted" : stageOf("millie", book.code),
            autoDetected,
            isbn: book.isbn,
            ...runOf("millie", book.code),
          });
        }));
      boards.push(buildBoard("millie", "재유통 원칙: 한 책당 한 형식만 — 중복 반려 PDF는 EPUB 단독본으로 재제작해 제출하세요. 제출 전 표지·EPUB을 검수하고 「검수 승인」 후 밀리에 재승인 요청하세요.", items));
    }
  }

  // 교보·YES24·리디 — 실사 스냅샷의 반려·판매중지 항목
  const platforms = snapshotPlatforms;
  for (const platform of ["kyobo", "yes24", "ridi"] as const) {
    const entries = platforms[platform] ?? {};
    const items: ReworkItem[] = [];
    for (const [key, value] of Object.entries(entries)) {
      const parsed = snapshotEntrySchema.safeParse(value);
      if (!parsed.success || !["rejected", "suspended"].includes(parsed.data.status)) continue;
      const slug = key.includes("@") ? key.slice(0, key.lastIndexOf("@")) : key;
      const format = key.includes("@") ? key.slice(key.lastIndexOf("@") + 1).toUpperCase() : (parsed.data.content_type ?? "");
      items.push({
        id: key,
        title: parsed.data.title || slug,
        slug: /^[0-9]+$/.test(slug) ? "" : slug,
        format,
        statusRaw: parsed.data.status_raw || parsed.data.status,
        reason: parsed.data.reason ?? "",
        guidance: platformGuidance(platform, parsed.data.status),
        stage: stageOf(platform, key),
        isbn: parsed.data.isbn,
      });
    }
    items.sort((left, right) => left.title.localeCompare(right.title, "ko"));
    const note = platform === "kyobo"
      ? "보류(보완 요청) 건 — 사유 확인 후 보완 재제출 대상입니다."
      : "판매중지 건 — 중지 사유를 확인하고 재판매 신청 또는 재등록으로 되살릴 수 있습니다.";
    boards.push(buildBoard(platform, note, items));
  }

  // 알라딘 — 판본(도서) 단위 판정: ItemId 부여 + 판매중 판본이 하나라도 있으면 실제 유통 중으로 간주 (2026-07-15 사용자 확정)
  boards.push(await loadAladinBoard(stageOf, platforms["aladin"] ?? {}));

  return { boards, millieSource };
}

const aladinRowSchema = z.object({
  product_code: z.string().optional(),
  item_id: z.string().optional(),
  title: z.string().optional(),
  sale_status: z.string().optional(),
}).loose();

async function loadAladinBoard(
  stageOf: (platform: string, id: string) => ReworkStage,
  snapshotEntries: Record<string, unknown>,
): Promise<ReworkBoard> {
  // 스냅샷은 슬러그 키 충돌로 판본 정보가 뭉개지므로 원시 수집 파일(전 판본 행)을 직접 읽는다.
  let rows: z.infer<typeof aladinRowSchema>[] = [];
  try {
    const files = (await readdir(DIST_LOGS_DIR))
      .filter((name) => name.startsWith("platform_catalog_aladin_") && name.endsWith(".json"))
      .sort();
    const latest = files.at(-1);
    if (latest) {
      const raw = JSON.parse(await readFile(path.join(DIST_LOGS_DIR, latest), "utf8")) as { entries?: unknown[] };
      rows = (raw.entries ?? []).flatMap((entry) => {
        const parsed = aladinRowSchema.safeParse(entry);
        return parsed.success ? [parsed.data] : [];
      });
    }
  } catch (error) {
    console.error("알라딘 원시 수집 파일 읽기 실패:", error instanceof Error ? error.message : error);
  }

  const titleToSlug = new Map<string, string>();
  for (const [key, value] of Object.entries(snapshotEntries)) {
    const parsed = snapshotEntrySchema.safeParse(value);
    if (parsed.success && parsed.data.title && !/^[0-9]+$/.test(key)) titleToSlug.set(parsed.data.title, key);
  }

  const byTitle = new Map<string, typeof rows>();
  for (const row of rows) {
    const title = (row.title ?? "").trim();
    if (!title) continue;
    byTitle.set(title, [...(byTitle.get(title) ?? []), row]);
  }
  const isActive = (row: z.infer<typeof aladinRowSchema>) =>
    Boolean(row.item_id && row.item_id !== "0" && (row.sale_status ?? "") === "판매중");

  let covered = 0;
  let pendingItemId = 0;
  const items: ReworkItem[] = [];
  for (const [title, versions] of byTitle) {
    if (versions.some(isActive)) {
      covered += 1;
      continue;
    }
    if (versions.every((row) => (row.sale_status ?? "") === "판매중")) {
      pendingItemId += 1; // ItemId 미부여 — 알라딘 상품화 처리 대기 (우리 조치 불필요)
      continue;
    }
    const representative = versions[0];
    items.push({
      id: representative?.product_code || title,
      title,
      slug: titleToSlug.get(title) ?? "",
      format: `판본 ${versions.length}개`,
      statusRaw: versions.map((row) => row.sale_status ?? "?").join(" / "),
      reason: "판매중(ItemId 부여) 판본 없음 — 전 판본 미유통",
      guidance: "알라딘 CMS에서 판본 상태 확인 후 재판매 신청 또는 재등록",
      stage: stageOf("aladin", representative?.product_code || title),
    });
  }
  items.sort((left, right) => left.title.localeCompare(right.title, "ko"));
  const note = `판정 기준: ProductList에서 ItemId가 부여되고 판매중인 판본이 1개라도 있으면 실제 유통 중으로 간주해 제외합니다. 현재 유통 중 ${covered}권 · 알라딘 상품화 처리 대기(ItemId 미부여) ${pendingItemId}권 — 중지 표시 판본은 중복 정리분으로 조치 불필요.`;
  return { ...buildBoard("aladin", note, items) };
}

function buildBoard(platform: ReworkPlatform, note: string, items: ReworkItem[]): ReworkBoard {
  const stageCounts: Record<ReworkStage, number> = { todo: 0, fixing: 0, approved: 0, resubmitted: 0 };
  for (const item of items) stageCounts[item.stage] += 1;
  return { platform, label: REWORK_PLATFORM_LABELS[platform], note, items, stageCounts };
}
