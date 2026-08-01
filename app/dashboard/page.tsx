import { ArrowRight, Files } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DashboardLive } from "@/components/dashboard-live";
import { HermesManager } from "@/components/hermes-manager";
import { IsbnHealthStrip } from "@/components/isbn-health";
import { Operations } from "@/components/operations";
import { PlanApprovalQueue } from "@/components/plan-approval-queue";
import { loadDashboardSnapshot } from "@/lib/dashboard-source";
import type { CatalogPage } from "@/lib/dashboard-domain";
import { readIsbnHealth } from "@/lib/isbn-health";
import { readHermesManagerSnapshot } from "@/lib/hermes-manager-source";
import { QualityRefreshBoard } from "@/components/quality-refresh";
import { ReworkBoards } from "@/components/rework-boards";
import { loadReworkBoards, summarizeReworkBoard } from "@/lib/platform-rework";
import { readQualityRefreshReport } from "@/lib/quality-refresh";
import { requireOwner } from "@/lib/require-owner";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireOwner();
  const [state, isbnHealth, snapshot] = await Promise.all([readState(), readIsbnHealth(), loadDashboardSnapshot()]);
  const [rework, qualityRefresh] = await Promise.all([loadReworkBoards(), readQualityRefreshReport()]);
  const initialCatalog: CatalogPage = { scope: "ai", items: [], total: snapshot.metrics.productCount, page: 1, pageSize: 50, totalPages: Math.ceil(snapshot.metrics.productCount / 50) };
  const hermes = await readHermesManagerSnapshot({ state, distributionAttention: snapshot.metrics.actionRequired });
  return <AppShell>
    <div className="page-heading dashboard-heading"><div><p className="eyebrow">SUNBEE BOOKS CONTROL</p><h1>선비북스 전자책 대시보드</h1><p>AI 도서를 기본 범위로 제작·ISBN·5사 유통·매출 기준일을 함께 확인합니다.</p></div><div className="heading-actions"><Link className="button secondary" href="/requests/bulk"><Files size={17} /> 대량 작업</Link><Link className="button primary" href="/requests/new">새 책 시작 <ArrowRight size={17} /></Link></div></div>
    <DashboardLive initialCatalog={initialCatalog} initialSnapshot={snapshot} planApproval={<PlanApprovalQueue operations={state.operations} />} />
    <IsbnHealthStrip health={isbnHealth} />
    <HermesManager snapshot={hermes} />
    <Operations jobs={state.jobs} operations={state.operations} />
    <QualityRefreshBoard report={qualityRefresh} />
    <ReworkBoards boards={rework.boards.map(summarizeReworkBoard)} millieSource={rework.millieSource} />
  </AppShell>;
}
