import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { LiveDistributionOverview } from "@/components/live-distribution-overview";
import { SalesAutoRefresh } from "@/components/sales-auto-refresh";
import { SalesView } from "@/components/sales-view";
import type { SalesHistory } from "@/lib/sales-domain";
import { loadDistributionStatus, type DistributionLoadResult } from "@/lib/distribution-source";
import { formatMonth } from "@/lib/sales-format";
import { requireOwner } from "@/lib/require-owner";
import { loadSalesHistory, salesDataRoot, todayInKst } from "@/lib/sales-source";
import "./sales.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "매출 분석" };

type SalesPageProps = {
  readonly searchParams: Promise<{ readonly month?: string }>;
};

export default async function SalesPage({ searchParams }: SalesPageProps) {
  await requireOwner();
  const dataRoot = salesDataRoot();
  const [{ month: requestedMonth }, result] = await Promise.all([
    searchParams,
    loadSalesHistory(dataRoot, todayInKst(), { sync: async () => undefined }),
  ]);
  const distribution = await loadDistributionStatus(dataRoot);

  return <AppShell><div className="sales-page">
    <div className="page-heading sales-page-heading"><div><p className="eyebrow">NET PROFIT ANALYTICS</p><h1>전자책 매출 분석</h1><p>교보문고·YES24·알라딘·리디·밀리의서재의 순수익을 일별·월별로 확인합니다.</p></div>{result.kind === "ready" ? <SalesAutoRefresh initialVersion={`${result.history.attemptedDate}:${result.history.latestDate}`} /> : null}</div>
    {result.kind === "unavailable"
      ? <section className="sales-unavailable"><strong>매출 데이터를 불러오지 못했습니다.</strong><p>전자책 정산 자동화의 스냅샷 연결 상태를 확인해 주세요.</p><small>{result.reason}</small></section>
      : <SalesReady requestedMonth={requestedMonth} history={result.history} distribution={distribution} />}
  </div></AppShell>;
}

function SalesReady({ requestedMonth, history, distribution }: { readonly requestedMonth: string | undefined; readonly history: SalesHistory; readonly distribution: DistributionLoadResult }) {
  const selected = history.months.find((month) => month.ym === requestedMonth) ?? history.months[0];
  if (selected === undefined) return <section className="sales-unavailable"><strong>표시할 월별 매출이 없습니다.</strong></section>;
  const fallback = history.sourceState === "fallback";
  const delayed = history.freshness.kind === "delayed";
  return <>
    <aside className={fallback || delayed ? "sales-source-banner delayed" : "sales-source-banner current"}>
      <div><strong>{fallback ? "이전 성공값을 대체 표시하고 있습니다." : delayed ? "자동 집계 갱신이 지연되고 있습니다." : "자동 집계 데이터가 정상입니다."}</strong><p>{fallback ? `${history.latestDate} 값 대체 · ${history.attemptedDate} 수집 실패` : `최신 원천 데이터 ${history.latestDate}`} · 선택 월 {formatMonth(selected.ym)} · 매일 아침 정산 자동화와 연결</p></div>
      <span>{fallback ? "대체값" : delayed ? `${history.freshness.days}일 전` : "최신"}</span>
    </aside>
    {distribution.kind === "ready"
      ? <LiveDistributionOverview snapshot={distribution.snapshot} />
      : <section className="sales-unavailable"><strong>유통현황 첫 동기화를 기다리고 있습니다.</strong><p>다음 07:00 KST n8n 실행 후 자동으로 표시됩니다.</p></section>}
    <SalesView history={history} selected={selected} />
  </>;
}
