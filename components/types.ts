import type { CatalogBook } from "@/lib/catalog-schema";

export type PlatformStatus = CatalogBook["platforms"][keyof CatalogBook["platforms"]];
