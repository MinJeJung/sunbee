import "server-only";

import { readBridgeHealth } from "@/lib/bridge-health";
import { readCatalog } from "@/lib/catalog";
import { readBuildProgressMap } from "@/lib/build-progress";
import { buildDashboardSnapshot } from "@/lib/dashboard-snapshot";
import { readLiveCatalog } from "@/lib/live-catalog";
import { loadSalesHistory, salesDataRoot, todayInKst } from "@/lib/sales-source";
import { readState } from "@/lib/store";

export const DASHBOARD_BUILD_VERSION = "0.3.2";

export async function loadDashboardSnapshot() {
  const generatedAt = new Date().toISOString();
  const [catalog, state, salesResult, bridge] = await Promise.all([
    readCatalog(),
    readState(),
    loadSalesHistory(salesDataRoot(), todayInKst(), { sync: async () => undefined }),
    readBridgeHealth(),
  ]);
  if (salesResult.kind === "unavailable") throw new Error(`매출 스냅샷을 읽을 수 없습니다: ${salesResult.reason}`);
  const [books, progress] = await Promise.all([
    readLiveCatalog(catalog.books, state.operations),
    readBuildProgressMap(state.operations),
  ]);
  return buildDashboardSnapshot({
    catalog,
    books,
    state,
    sales: salesResult.history,
    generatedAt,
    buildVersion: DASHBOARD_BUILD_VERSION,
    progress,
    bridge,
  });
}
