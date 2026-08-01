// 원장 스키마·타입·순수 표시 헬퍼 — 클라이언트 컴포넌트에서도 import 가능해야 하므로
// node 내장 모듈(fs 등)을 절대 import하지 않는다. 파일 읽기는 lib/catalog.ts(readCatalog) 담당.
import { z } from "zod";

export const platformStatusSchema = z.enum(["미등록", "등록", "유통중", "심사중", "보완필요", "반려", "중지", "확인필요"]);
export const catalogBookSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  recordNo: z.number(),
  title: z.string(),
  subtitle: z.string(),
  author: z.string(),
  publisher: z.string(),
  category: z.string(),
  price: z.number(),
  fileFormat: z.enum(["PDF", "EPUB"]),
  saleStatus: z.string(),
  pdfIsbn: z.string(),
  epubIsbn: z.string(),
  activeIsbn: z.string(),
  isbnStatus: z.string(),
  publicationDate: z.string(),
  registeredAt: z.string(),
  kyoboProductCode: z.string(),
  kyoboSalesProductId: z.string(),
  salesChannelCode: z.string(),
  b2bPurchaseStatus: z.string(),
  b2bRentalStatus: z.string(),
  samPremiumStatus: z.string(),
  samUnlimitedStatus: z.string(),
  final: z.boolean(),
  cover: z.string(),
  epub: z.string(),
  pdf: z.string(),
  manuscript: z.string(),
  summary: z.string(),
  platforms: z.object({
    kyobo: platformStatusSchema,
    yes24: platformStatusSchema,
    ridi: platformStatusSchema,
    aladin: platformStatusSchema,
    millie: platformStatusSchema
  }),
  registeredCount: z.number(),
  missingPlatforms: z.array(z.string()),
  attentionPlatforms: z.array(z.string()),
  assetMatchMethod: z.string(),
  fivePlatformMatchMethod: z.string(),
  source: z.string()
});

export const catalogSchema = z.object({
  generatedAt: z.string(), sourceWorkbook: z.string(), sourceWorkbookUpdatedAt: z.string(),
  fivePlatformWorkbook: z.string(), fivePlatformWorkbookUpdatedAt: z.string(),
  count: z.number(), uniqueBookCount: z.number(), books: z.array(catalogBookSchema)
});

export type Catalog = z.infer<typeof catalogSchema>;
export type CatalogBook = z.infer<typeof catalogBookSchema>;
export type PlatformKey = keyof CatalogBook["platforms"];
export type PlatformDisplayStatus = "판매중" | "등록됨" | "심사중" | "보완" | "반려" | "중지" | "미등록" | "확인필요";

export function platformDisplayStatus(_platform: PlatformKey, status: CatalogBook["platforms"][PlatformKey]): PlatformDisplayStatus {
  if (status === "유통중") return "판매중";
  if (status === "심사중") return "심사중";
  // "등록"은 제출 성공 기록일 뿐 판매 확인이 아니다 — 낙관 승격 금지 (2026-07-15 밀리 대량 반려 사고).
  if (status === "등록") return "등록됨";
  if (status === "보완필요") return "보완";
  return status;
}

export function displayIsbnStatus(status: string) {
  return status.replace("교보 유통중", "교보 판매중");
}

export function catalogIsStale(generatedAt: string, maxAgeHours = 24) {
  return Date.now() - Date.parse(generatedAt) > maxAgeHours * 60 * 60 * 1_000;
}

export function getCatalogBook(catalog: Catalog, id: string) {
  return catalog.books.find((book) => book.id === id) ?? null;
}

export function catalogStats(books: readonly CatalogBook[]) {
  const productCount = books.length;
  const workCount = new Set(catalogWorkIds(books).values()).size;
  const allFiveLive = books.filter((book) => Object.values(book.platforms).every((status) => status === "유통중")).length;
  const reviewing = books.filter((book) => Object.values(book.platforms).some((status) => status === "심사중")).length;
  const actionRequired = books.filter(catalogNeedsAction).length;
  const knownAcrossFive = books.filter((book) => Object.values(book.platforms).every((status) => status !== "확인필요")).length;
  return {
    productCount,
    workCount,
    allFiveLive,
    reviewing,
    actionRequired,
    knownAcrossFive,
    total: books.length,
    uniqueBooks: new Set(books.map((book) => book.title.normalize("NFKC").replaceAll(/[^\p{L}\p{N}]+/gu, "").toLowerCase())).size,
    kyoboLive: books.filter((book) => book.platforms.kyobo === "유통중").length,
    allFive: books.filter((book) => book.registeredCount === 5).length,
    isbnReady: books.filter((book) => Boolean(book.pdfIsbn || book.epubIsbn)).length,
    missingDistribution: books.filter((book) => book.registeredCount < 5).length,
    pdf: books.filter((book) => book.fileFormat === "PDF").length,
    epub: books.filter((book) => book.fileFormat === "EPUB").length
  };
}

const ACTION_STATUSES = new Set<CatalogBook["platforms"][PlatformKey]>(["미등록", "보완필요", "반려", "중지", "확인필요"]);

export function catalogNeedsAction(book: CatalogBook): boolean {
  return Object.values(book.platforms).some((status) => ACTION_STATUSES.has(status));
}

export function catalogWorkKey(book: CatalogBook): string {
  const isbn = (book.activeIsbn || book.epubIsbn || book.pdfIsbn).replaceAll(/\D/g, "");
  if (isbn) return `isbn:${isbn}`;
  const productCode = book.kyoboProductCode || book.kyoboSalesProductId;
  if (productCode) return `product:${productCode}`;
  const title = book.title.normalize("NFKC").replaceAll(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
  const author = book.author.normalize("NFKC").replaceAll(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
  return `title:${title}:${author}`;
}

export function catalogWorkMatchKeys(book: CatalogBook): readonly string[] {
  const isbn = normalizeIsbn(book.activeIsbn || book.epubIsbn || book.pdfIsbn);
  const productCode = book.kyoboProductCode || book.kyoboSalesProductId;
  return [isbn ? `isbn:${isbn}` : "", productCode ? `product:${productCode}` : "", `title:${normalizedWorkTitle(book)}`]
    .filter((value) => Boolean(value));
}

export function catalogWorkIds(books: readonly CatalogBook[]): ReadonlyMap<string, string> {
  const groups: Array<{ id: string; isbns: Set<string>; productCodes: Set<string>; titles: Set<string> }> = [];
  const result = new Map<string, string>();
  for (const book of books) {
    const isbn = normalizeIsbn(book.activeIsbn || book.epubIsbn || book.pdfIsbn);
    const productCode = book.kyoboProductCode || book.kyoboSalesProductId;
    const title = normalizedWorkTitle(book);
    let group = groups.find((candidate) => Boolean(isbn) && candidate.isbns.has(isbn));
    group ??= groups.find((candidate) => Boolean(productCode) && candidate.productCodes.has(productCode));
    group ??= groups.find((candidate) => candidate.titles.has(title));
    if (group === undefined) {
      group = { id: catalogWorkKey(book), isbns: new Set(), productCodes: new Set(), titles: new Set() };
      groups.push(group);
    }
    if (isbn) group.isbns.add(isbn);
    if (productCode) group.productCodes.add(productCode);
    group.titles.add(title);
    result.set(book.id, group.id);
  }
  return result;
}

function normalizedWorkTitle(book: CatalogBook): string {
  const title = book.title.normalize("NFKC").replaceAll(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
  const author = book.author
    .replaceAll(/\([^)]*\)/g, "")
    .normalize("NFKC")
    .replaceAll(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();
  return `${title}:${author}`;
}

function normalizeIsbn(value: string): string {
  return value.replaceAll(/\D/g, "");
}

const platformKeys = ["kyobo", "yes24", "ridi", "aladin", "millie"] as const;
const platformLabels = { kyobo: "교보문고", yes24: "예스24", ridi: "리디북스", aladin: "알라딘", millie: "밀리의서재" };

export function catalogPlatformStats(books: readonly CatalogBook[]) {
  return platformKeys.map((key) => {
    const statuses = books.map((book) => platformDisplayStatus(key, book.platforms[key]));
    return {
      key,
      label: platformLabels[key],
      covered: statuses.filter((status) => status === "판매중" || status === "등록됨").length,
      live: statuses.filter((status) => status === "판매중").length,
      registered: statuses.filter((status) => status === "등록됨").length,
      review: statuses.filter((status) => status === "심사중").length,
      supplement: statuses.filter((status) => status === "보완" || status === "확인필요").length,
      rejected: statuses.filter((status) => status === "반려" || status === "중지").length,
      missing: statuses.filter((status) => status === "미등록").length
    };
  });
}

export type CatalogPlatformStat = ReturnType<typeof catalogPlatformStats>[number];
