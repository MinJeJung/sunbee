import { CalendarBlank, CurrencyKrw, Database, WarningCircle } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import type { ReactNode } from "react";
import { CumulativeChart, DailyRevenueChart, MonthlyChart, PlatformTrendChart } from "@/components/sales-charts";
import { PLATFORM_KEYS, PLATFORM_LABELS, type DailySales, type MonthlySales, type SalesHistory } from "@/lib/sales-domain";
import { formatMonth, formatWon } from "@/lib/sales-format";

export function SalesView({ history, selected }: { readonly history: SalesHistory; readonly selected: MonthlySales }) {
  const latestDay = selected.days.at(-1);
  const calculatedDays = selected.days.filter((day) => day.dailyTotal !== null).length;
  const reconciledDays = selected.days.filter((day) => day.quality === "reconciled").length;
  const unavailableDays = selected.days.length - calculatedDays;
  const expectedDays = Number(selected.latestDate.slice(8));
  const freshnessLabel = history.freshness.kind === "current" ? "정상" : `${history.freshness.days}일 지연`;
  const automationLabel = history.sourceState === "fallback" ? "대체값" : freshnessLabel;

  return <>
    <nav className="sales-month-nav" aria-label="매출 조회 월">
      {history.months.map((month) => <Link className={month.ym === selected.ym ? "active" : ""} href={`/sales?month=${month.ym}`} key={month.ym} prefetch={false}>
        {month.ym.slice(2)}<small>{month.complete ? "마감" : "진행 중"}</small>
      </Link>)}
    </nav>
    <section className="metric-grid sales-metrics" aria-label={`${formatMonth(selected.ym)} 매출 요약`}>
      <Metric icon={<CurrencyKrw size={21} />} label="월 누적 순수익" value={formatWon(selected.total)} note={`${selected.latestDate} 기준 · 5사 합계`} tone="green" />
      <Metric icon={<CalendarBlank size={21} />} label="최근 일 순수익" value={formatWon(latestDay?.dailyTotal ?? null)} note={latestDay === undefined ? "데이터 없음" : `${latestDay.date} · ${qualityLabel(latestDay)}`} tone="blue" />
      <Metric icon={<Database size={21} />} label="일별 계산 가능" value={`${calculatedDays}일`} note={`기록 ${selected.days.length}/${expectedDays}일 · Slack 보강 ${reconciledDays}일 · 기준점 ${unavailableDays}일`} />
      <Metric icon={<WarningCircle size={21} />} label="자동화 데이터" value={automationLabel} note={`기준 ${history.latestDate} · 시도 ${history.attemptedDate}`} tone={history.sourceState === "confirmed" && history.freshness.kind === "current" ? "green" : "amber"} />
    </section>
    <section className="sales-chart-grid" aria-label="매출 그래프">
      <CumulativeChart days={selected.days} />
      <MonthlyChart months={history.months} />
      <DailyRevenueChart days={selected.days} />
      <ChannelSummary month={selected} />
      <PlatformTrendChart days={selected.days} />
    </section>
    <section className="sales-table-section">
      <div className="section-heading"><div><p className="eyebrow">DAILY DETAIL</p><h2>일별 순수익 상세</h2><p>연속 누적액의 차이로 일 순수익을 계산하며, 보류 후 재집계된 값은 Slack 보강으로 구분합니다.</p></div><span>{selected.days.length}일 기록</span></div>
      <div className="table-wrap"><table className="sales-table">
        <thead><tr><th>날짜</th><th>상태</th><th>일 순수익</th><th>누적 순수익</th>{PLATFORM_KEYS.map((key) => <th key={key}>{PLATFORM_LABELS[key]}</th>)}</tr></thead>
        <tbody>{selected.days.toReversed().map((day) => <tr key={day.date}>
          <td className="number">{day.date}</td>
          <td><QualityCell day={day} /></td>
          <td className="number strong">{formatWon(day.dailyTotal)}</td>
          <td className="number">{formatWon(day.cumulativeTotal)}</td>
          {PLATFORM_KEYS.map((key) => <td className="number" key={key}>{formatWon(day.dailyPlatforms?.[key] ?? null)}</td>)}
        </tr>)}</tbody>
      </table></div>
    </section>
    <section className="sales-table-section">
      <div className="section-heading"><div><p className="eyebrow">MONTHLY LEDGER</p><h2>월별 매출 표</h2><p>각 월의 마지막 스냅샷을 기준으로 유통사별 순수익을 집계합니다.</p></div></div>
      <div className="table-wrap"><table className="sales-table monthly-ledger">
        <thead><tr><th>월</th><th>상태</th><th>5사 합계</th>{PLATFORM_KEYS.map((key) => <th key={key}>{PLATFORM_LABELS[key]}</th>)}</tr></thead>
        <tbody>{history.months.map((month) => <tr key={month.ym}>
          <td><Link href={`/sales?month=${month.ym}`} className="sales-month-link" prefetch={false}>{formatMonth(month.ym)}</Link><small>{month.latestDate} 기준</small></td>
          <td><span className={month.complete ? "sales-data-state confirmed" : "sales-data-state current"}>{month.complete ? "마감" : "진행 중"}</span></td>
          <td className="number strong">{formatWon(month.total)}</td>
          {PLATFORM_KEYS.map((key) => <td className="number" key={key}>{formatWon(month.platforms[key])}</td>)}
        </tr>)}</tbody>
      </table></div>
    </section>
  </>;
}

function QualityCell({ day }: { readonly day: DailySales }) {
  const tone = day.quality === "confirmed" ? "confirmed" : day.quality === "reconciled" ? "reconciled" : "pending";
  return <div className="sales-quality-cell">
    <span className={`sales-data-state ${tone}`}>{qualityLabel(day)}</span>
    {day.sourceUrl !== undefined && <a href={day.sourceUrl} target="_blank" rel="noreferrer">Slack 원문</a>}
  </div>;
}

function qualityLabel(day: DailySales): string {
  if (day.quality === "confirmed") return "확정";
  if (day.quality === "reconciled") return "Slack 보강";
  if (day.quality === "fallback") return "대체값 · 집계 불가";
  return "누적 기준점";
}

function ChannelSummary({ month }: { readonly month: MonthlySales }) {
  const latestDay = month.days.at(-1);
  return <article className="sales-chart-card channel-summary">
    <header><div><strong>유통사별 기여도</strong><span>{formatMonth(month.ym)} 누적</span></div></header>
    <div className="channel-list">{PLATFORM_KEYS.map((key) => {
      const amount = month.platforms[key];
      const share = month.total === 0 ? 0 : amount / month.total * 100;
      const daily = latestDay?.dailyPlatforms?.[key] ?? null;
      return <div className="channel-row" key={key}>
        <div><strong>{PLATFORM_LABELS[key]}</strong><span>최근 일 {formatWon(daily)}</span></div>
        <div className="channel-amount"><strong>{formatWon(amount)}</strong><span>{share.toFixed(1)}%</span></div>
        <progress max="100" value={share} aria-label={`${PLATFORM_LABELS[key]} 비중 ${share.toFixed(1)}%`} />
      </div>;
    })}</div>
  </article>;
}

function Metric({ icon, label, value, note, tone }: { readonly icon: ReactNode; readonly label: string; readonly value: string; readonly note: string; readonly tone?: string }) {
  return <article className={`metric-card metric-${tone ?? "plain"}`}><div className="metric-label"><span>{icon}</span>{label}</div><strong>{value}</strong><small>{note}</small></article>;
}
