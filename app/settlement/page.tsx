import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SettlementView } from "@/components/settlement-view";
import { requireOwner } from "@/lib/require-owner";
import { listSettlementMonths, loadSettlementRun, maskRrn } from "@/lib/settlement-source";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "정산 관리" };

function deadlineBadge(paymentDeadline: string | null) {
  if (!paymentDeadline) return null;
  const deadline = Date.parse(`${paymentDeadline.replaceAll(".", "-")}T23:59:59+09:00`);
  if (Number.isNaN(deadline)) return null;
  const days = Math.ceil((deadline - Date.now()) / 86_400_000);
  return { deadline: paymentDeadline, days };
}

export default async function SettlementPage({ searchParams }: { searchParams: Promise<{ ym?: string; saved?: string; generated?: string; error?: string }> }) {
  await requireOwner();
  const { ym: requestedYm, saved, generated, error } = await searchParams;
  const months = await listSettlementMonths();
  const ym = requestedYm && /^\d{4}-\d{2}$/.test(requestedYm) ? requestedYm : months[0];
  if (!ym) {
    return <AppShell><div className="page-heading"><div><p className="eyebrow">SETTLEMENT</p><h1>정산 관리</h1><p>정산 run 데이터가 없습니다 — sunbee-author-settlement 수집을 먼저 실행해 주세요.</p></div></div></AppShell>;
  }
  const run = await loadSettlementRun(ym);
  // 주민번호는 화면으로 원문을 보내지 않는다 — 파일 생성 시점에 원본 JSON이 직접 쓰인다.
  const maskedRun = { ...run, freelance: run.freelance.map((item) => ({ ...item, ...(item.rrn ? { rrn: maskRrn(item.rrn) } : {}) })) };
  const badge = deadlineBadge(run.aggregated?.paymentDeadline ?? null);
  const notice = error ? `엑셀 생성 실패: ${error}` : generated ? "세무사 발송용 엑셀을 생성했습니다." : saved ? "강사·프리랜서 입력을 저장했습니다." : undefined;

  return <AppShell><div className="settlement-page">
    <div className="page-heading"><div><p className="eyebrow">SETTLEMENT</p><h1>정산 관리</h1><p>{ym} 판매분 — 작가 인세 자동 집계 확인, 강사·프리랜서 입력, 세무사 발송용 원천세 엑셀 생성까지 한 화면에서 처리합니다.</p></div>
      {badge ? <span className={`settlement-deadline${badge.days <= 3 ? " urgent" : ""}`}>지급 기한 {badge.deadline} · {badge.days >= 0 ? `D-${badge.days}` : `${-badge.days}일 지남`}</span> : null}</div>
    <nav aria-label="정산 월 선택" className="settlement-months">{months.slice(0, 8).map((month) => <Link className={month === ym ? "active" : ""} href={`/settlement?ym=${month}`} key={month}>{month}</Link>)}</nav>
    <SettlementView notice={notice} run={maskedRun} />
  </div></AppShell>;
}
