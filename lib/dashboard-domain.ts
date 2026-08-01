import { z } from "zod";
import { catalogBookSchema, catalogNeedsAction, catalogWorkIds, type CatalogBook } from "@/lib/catalog-schema";

export const CATALOG_SCOPES = ["ai", "legacy"] as const;
export const CATALOG_STATUSES = ["all", "allFiveLive", "reviewing", "action", "pdf", "epub"] as const;

export type CatalogScope = (typeof CATALOG_SCOPES)[number];
export type CatalogStatusFilter = (typeof CATALOG_STATUSES)[number];

export type CatalogQuery = {
  readonly scope: CatalogScope;
  readonly query: string;
  readonly status: CatalogStatusFilter;
  readonly page: number;
  readonly pageSize: number;
};

export type PlatformObservation = {
  readonly platform: keyof CatalogBook["platforms"];
  readonly status: CatalogBook["platforms"][keyof CatalogBook["platforms"]];
  readonly observedAt: string;
  readonly source: string;
  readonly evidence: string;
};

export type CatalogProduct = CatalogBook & {
  readonly productId: string;
  readonly workId: string;
  readonly scope: CatalogScope;
  readonly platformObservations: readonly PlatformObservation[];
};

export type CatalogPage = {
  readonly scope: CatalogScope;
  readonly items: readonly CatalogProduct[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
};

export function queryCatalogPage(books: readonly CatalogBook[], query: CatalogQuery): CatalogPage {
  const workIds = catalogWorkIds(books);
  const needle = query.query.trim().toLocaleLowerCase("ko-KR");
  const filtered = books.filter((book) => {
    const searchable = `${book.title} ${book.author} ${book.activeIsbn} ${book.category} ${book.kyoboSalesProductId}`.toLocaleLowerCase("ko-KR");
    if (needle && !searchable.includes(needle)) return false;
    switch (query.status) {
      case "all":
        return true;
      case "allFiveLive":
        return Object.values(book.platforms).every((status) => status === "유통중");
      case "reviewing":
        return Object.values(book.platforms).some((status) => status === "심사중");
      case "action":
        return catalogNeedsAction(book);
      case "pdf":
        return book.fileFormat === "PDF";
      case "epub":
        return book.fileFormat === "EPUB";
      default:
        return assertNever(query.status);
    }
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / query.pageSize));
  const page = Math.min(query.page, totalPages);
  const offset = (page - 1) * query.pageSize;
  return {
    scope: query.scope,
    items: filtered.slice(offset, offset + query.pageSize).map((book) => toCatalogProduct(book, query.scope, workIds.get(book.id))),
    total: filtered.length,
    page,
    pageSize: query.pageSize,
    totalPages,
  };
}

const platformKeys = ["kyobo", "yes24", "ridi", "aladin", "millie"] as const;

function toCatalogProduct(book: CatalogBook, scope: CatalogScope, workId: string | undefined): CatalogProduct {
  return {
    ...book,
    productId: book.id,
    workId: workId ?? book.id,
    scope,
    platformObservations: platformKeys.map((platform) => ({
      platform,
      status: book.platforms[platform],
      observedAt: book.registeredAt,
      source: book.source,
      evidence: book.fivePlatformMatchMethod,
    })),
  };
}

export const catalogPageSchema = z.object({
  scope: z.enum(CATALOG_SCOPES),
  items: z.array(catalogBookSchema.extend({
    productId: z.string(),
    workId: z.string(),
    scope: z.enum(CATALOG_SCOPES),
    platformObservations: z.array(z.object({
      platform: z.enum(platformKeys),
      status: z.enum(["미등록", "등록", "유통중", "심사중", "보완필요", "반려", "중지", "확인필요"]),
      observedAt: z.string(),
      source: z.string(),
      evidence: z.string(),
    })),
  })),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().positive(),
});

function assertNever(value: never): never {
  throw new TypeError(`처리하지 않은 카탈로그 필터: ${value}`);
}
