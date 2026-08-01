import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CatalogBook } from "@/lib/catalog-schema";
import type { DistributionPlatform, Operation } from "@/lib/types";

const platforms = ["kyobo", "yes24", "ridi", "aladin", "millie"] as const;
const platformLabels = { kyobo: "교보", yes24: "예스24", ridi: "리디", aladin: "알라딘", millie: "밀리" } as const;
type PlatformStatus = CatalogBook["platforms"][DistributionPlatform];
type OperationMetadata =
  | { readonly kind: "ready"; readonly values: Readonly<Record<string, string>> }
  | { readonly kind: "missing"; readonly values: Readonly<Record<string, string>> };

// 책이 만들어진 시점(artifact 존재, 검수 대기)부터 전체 도서에 바로 노출한다 —
// ISBN·유통은 이후 단계 진행에 따라 상태 라벨로 표시 (2026-07-16 사용자 요청).
const PIPELINE_VISIBLE_STATUSES = new Set<Operation["status"]>([
  "awaiting_review", "isbn_processing", "isbn_applied", "distribution_processing", "completed", "failed",
]);

export async function readLiveCatalog(
  baseBooks: readonly CatalogBook[],
  operations: readonly Operation[],
): Promise<readonly CatalogBook[]> {
  const visible = operations.filter((operation) =>
    operation.artifact && PIPELINE_VISIBLE_STATUSES.has(operation.status),
  );
  const metadata = await Promise.all(visible.map(readOperationMetadata));
  const books = [...baseBooks];
  const pipelineBooks: CatalogBook[] = [];

  visible.forEach((operation, index) => {
    const isbn = normalizeIsbn(operation.isbn ?? "");
    const title = operation.artifact?.title ?? operation.insight?.recommendedTitle ?? operation.direction;
    const duplicate = books.some((book) =>
      (isbn && normalizeIsbn(book.activeIsbn) === isbn) || normalizeTitle(book.title) === normalizeTitle(title),
    );
    const operationMetadata = metadata[index];
    if (!duplicate && operationMetadata !== undefined) {
      pipelineBooks.push(operationBook(operation, operationMetadata, baseBooks.length + index + 1));
    }
  });
  // 파이프라인 신간은 가장 최신이므로 목록 맨 앞에 노출
  return [...pipelineBooks, ...books];
}

async function readOperationMetadata(operation: Operation): Promise<OperationMetadata> {
  if (!operation.artifact) return { kind: "missing", values: {} };
  const metaPath = operation.metaPath ?? path.join(path.dirname(absoluteArtifact(operation.artifact.epubArtifactId)), "_meta.md");
  try {
    const source = await readFile(/* turbopackIgnore: true */ metaPath, "utf8");
    const values = Object.fromEntries(source.split("\n").flatMap((line) => {
      const match = /^([a-zA-Z0-9_]+):\s*(.*?)\s*$/.exec(line);
      if (!match?.[1] || match[2] === undefined) return [];
      return [[match[1], unquote(match[2])]];
    }));
    return { kind: "ready", values };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return { kind: "missing", values: {} };
    throw error;
  }
}

function operationBook(operation: Operation, metadata: OperationMetadata, recordNo: number): CatalogBook {
  const artifact = operation.artifact;
  if (!artifact) throw new TypeError("도서 산출물이 없습니다.");
  const bookDirectory = operation.bookDirectory ?? path.dirname(absoluteArtifact(artifact.epubArtifactId));
  const values = metadata.values;
  const platformStatuses = {
    kyobo: platformStatus(values["epub_dist_kyobo_status"], operation.distributionPlatforms?.includes("kyobo") ?? false, metadata.kind),
    yes24: platformStatus(values["epub_dist_yes24_status"], operation.distributionPlatforms?.includes("yes24") ?? false, metadata.kind),
    ridi: platformStatus(values["epub_dist_ridi_status"], operation.distributionPlatforms?.includes("ridi") ?? false, metadata.kind),
    aladin: platformStatus(values["epub_dist_aladin_status"], operation.distributionPlatforms?.includes("aladin") ?? false, metadata.kind),
    millie: platformStatus(values["epub_dist_millie_status"], operation.distributionPlatforms?.includes("millie") ?? false, metadata.kind),
  } satisfies CatalogBook["platforms"];
  const missingPlatforms = platforms.filter((platform) => platformStatuses[platform] === "미등록").map((platform) => platformLabels[platform]);
  const attentionPlatforms = platforms
    .filter((platform) => ["심사중", "보완필요", "확인필요"].includes(platformStatuses[platform]))
    .map((platform) => platformLabels[platform]);
  const isbn = operation.isbn ?? "";
  const publicationDate = values["publication_date"] ?? new Date(operation.updatedAt).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const price = Number.parseInt(values["price"] ?? "9900", 10);
  const stageSaleStatus: Partial<Record<Operation["status"], string>> = {
    awaiting_review: "검수 승인 대기",
    isbn_processing: "ISBN 신청 중",
    isbn_applied: "ISBN 접수 완료",
    distribution_processing: "5사 유통 진행 중",
    failed: "파이프라인 실패",
  };

  return {
    id: `pipeline:${operation.id}`,
    assetId: path.basename(bookDirectory),
    recordNo,
    title: artifact.title,
    subtitle: "",
    author: "정민제",
    publisher: "선비북스",
    category: values["distribution_category_primary"] ?? "분류 확인중",
    price: Number.isFinite(price) ? price : 9_900,
    fileFormat: "EPUB",
    saleStatus: stageSaleStatus[operation.status] ?? (attentionPlatforms.length ? "5사 심사중" : "유통 등록 완료"),
    pdfIsbn: "",
    epubIsbn: isbn,
    activeIsbn: isbn,
    isbnStatus: !isbn ? "ISBN 신청 전" : operation.isbnStatus === "issued" ? "ISBN 발급완료" : "ISBN 신청완료",
    publicationDate,
    registeredAt: values["epub_dist_kyobo_submitted_at"] ?? operation.updatedAt,
    kyoboProductCode: values["epub_dist_kyobo_id"] ?? "",
    kyoboSalesProductId: values["epub_dist_kyobo_id"] ?? "",
    salesChannelCode: "",
    b2bPurchaseStatus: "확인중",
    b2bRentalStatus: "확인중",
    samPremiumStatus: "확인중",
    samUnlimitedStatus: "확인중",
    final: true,
    cover: relativeArtifact(bookDirectory, artifact.coverArtifactId),
    epub: relativeArtifact(bookDirectory, artifact.epubArtifactId),
    pdf: "",
    manuscript: "",
    summary: operation.insight?.readerPromise ?? operation.direction,
    platforms: platformStatuses,
    registeredCount: platforms.filter((platform) => platformStatuses[platform] !== "미등록").length,
    missingPlatforms,
    attentionPlatforms,
    assetMatchMethod: "dashboard-operation",
    fivePlatformMatchMethod: "dashboard-distribution-result",
    source: "dashboard-completed",
  };
}

function platformStatus(value: string | undefined, submitted: boolean, metadataState: OperationMetadata["kind"]): PlatformStatus {
  switch (value?.toLowerCase()) {
    case "active":
    case "complete":
    case "completed":
    case "live":
    case "selling":
      return "유통중";
    case "registered":
    case "submitted":
      return "등록";
    case "review":
    case "pending":
      return "심사중";
    case "revision_required":
      return "보완필요";
    case "check_required":
      return "확인필요";
    default:
      if (submitted && metadataState === "missing") return "확인필요";
      return submitted ? "심사중" : "미등록";
  }
}

function relativeArtifact(bookDirectory: string, artifactPath: string): string {
  const relative = path.relative(bookDirectory, absoluteArtifact(artifactPath));
  return relative.startsWith("..") || path.isAbsolute(relative) ? "" : relative;
}

function absoluteArtifact(artifactPath: string): string {
  if (path.isAbsolute(artifactPath)) return artifactPath;
  return path.join(/* turbopackIgnore: true */ process.cwd(), artifactPath);
}

function normalizeIsbn(value: string): string {
  return value.replaceAll(/\D/g, "");
}

function normalizeTitle(value: string): string {
  return value.normalize("NFKC").replaceAll(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
}

function unquote(value: string): string {
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1);
  }
  return value;
}
