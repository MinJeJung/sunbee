export type CatalogAssetKind = "cover" | "epub" | "manuscript" | "pdf";

export function catalogAssetUrl(bookId: string, kind: CatalogAssetKind, thumbnail = false): string {
  const pipelinePrefix = "pipeline:";
  if (bookId.startsWith(pipelinePrefix) && kind !== "pdf") {
    const operationId = bookId.slice(pipelinePrefix.length);
    return `/api/artifacts/${encodeURIComponent(operationId)}?kind=${kind}`;
  }
  const thumbnailQuery = thumbnail ? "&thumb=1" : "";
  return `/api/library/${encodeURIComponent(bookId)}/asset?kind=${kind}${thumbnailQuery}`;
}
