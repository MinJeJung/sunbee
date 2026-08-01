import { formatCompactWon } from "@/lib/sales-format";
import { PLATFORM_KEYS, PLATFORM_LABELS, type DailySales, type MonthlySales } from "@/lib/sales-domain";

const CHART = { width: 820, height: 270, left: 48, right: 20, top: 24, bottom: 38 } as const;

export function CumulativeChart({ days }: { readonly days: readonly DailySales[] }) {
  const values = days.map((day) => day.cumulativeTotal);
  const scale = chartScale(values);
  const points = days.map((day, index) => ({
    x: chartX(index, days.length),
    y: chartY(day.cumulativeTotal, scale),
    day,
  }));
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const area = points.length === 0 ? "" : `${line} L${points.at(-1)?.x},${CHART.height - CHART.bottom} L${points[0]?.x},${CHART.height - CHART.bottom} Z`;
  const labelStep = Math.max(1, Math.ceil(days.length / 7));

  return <figure className="sales-chart-card">
    <figcaption><strong>일별 누적 순수익</strong><span>선택 월의 5사 합계</span></figcaption>
    <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img" aria-labelledby="cumulative-title cumulative-desc">
      <title id="cumulative-title">일별 누적 순수익 선 그래프</title>
      <desc id="cumulative-desc">날짜별 월 누적 순수익의 변화입니다.</desc>
      <defs><linearGradient id="sales-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#178653" stopOpacity=".24" /><stop offset="1" stopColor="#178653" stopOpacity="0" /></linearGradient></defs>
      <ChartGrid scale={scale} />
      <path d={area} fill="url(#sales-area)" />
      <path d={line} className="sales-line" />
      {points.map((point, index) => <g key={point.day.date}>
        <circle cx={point.x} cy={point.y} r="4" className={point.day.quality === "confirmed" ? "sales-dot" : "sales-dot estimated"}><title>{`${point.day.date} ${formatCompactWon(point.day.cumulativeTotal)} · ${point.day.quality === "confirmed" ? "확정" : "보강"}`}</title></circle>
        {(index % labelStep === 0 || index === points.length - 1) && <text x={point.x} y={CHART.height - 13} className="sales-axis-date">{point.day.date.slice(5)}</text>}
      </g>)}
    </svg>
  </figure>;
}

export function DailyRevenueChart({ days }: { readonly days: readonly DailySales[] }) {
  const values = days.flatMap((day) => day.dailyTotal === null ? [] : [day.dailyTotal]);
  const max = Math.max(...values, 1);
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const barWidth = Math.max(4, (CHART.width - CHART.left - CHART.right) / Math.max(days.length, 1) - 5);
  const labelStep = Math.max(1, Math.ceil(days.length / 7));

  return <figure className="sales-chart-card">
    <figcaption><strong>일별 순수익</strong><span>초록은 확정, 주황은 Slack 보강값입니다</span></figcaption>
    <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img" aria-labelledby="daily-title daily-desc">
      <title id="daily-title">일별 확정 순수익 막대 그래프</title>
      <desc id="daily-desc">정상 수집된 연속 스냅샷만 일 순수익으로 표시합니다.</desc>
      <line x1={CHART.left} x2={CHART.width - CHART.right} y1={CHART.height - CHART.bottom} y2={CHART.height - CHART.bottom} className="sales-grid-line" />
      {days.map((day, index) => {
        const x = chartX(index, days.length) - barWidth / 2;
        const height = day.dailyTotal === null ? 0 : Math.max(2, (Math.max(day.dailyTotal, 0) / max) * plotHeight);
        return <g key={day.date}>
          {day.dailyTotal === null
            ? <rect x={x} y={CHART.height - CHART.bottom - 4} width={barWidth} height="4" className="sales-bar missing"><title>{`${day.date} 집계 보류`}</title></rect>
            : <rect x={x} y={CHART.height - CHART.bottom - height} width={barWidth} height={height} className={day.quality === "confirmed" ? "sales-bar" : "sales-bar reconciled"}><title>{`${day.date} ${formatCompactWon(day.dailyTotal)} · ${day.quality === "confirmed" ? "확정" : day.quality === "reconciled" ? "Slack 보강" : "대체값"}`}</title></rect>}
          {(index % labelStep === 0 || index === days.length - 1) && <text x={chartX(index, days.length)} y={CHART.height - 13} className="sales-axis-date">{day.date.slice(5)}</text>}
        </g>;
      })}
    </svg>
  </figure>;
}

export function PlatformTrendChart({ days }: { readonly days: readonly DailySales[] }) {
  const values = days.flatMap((day) => PLATFORM_KEYS.map((key) => day.cumulativePlatforms[key]));
  const scale = chartScale(values);
  const labelStep = Math.max(1, Math.ceil(days.length / 7));

  return <figure className="sales-chart-card platform-trend-chart">
    <figcaption><strong>유통사별 누적 순수익 추이</strong><span>날짜별 5개 채널의 기여 변화를 비교합니다</span></figcaption>
    <div className="platform-chart-legend" aria-label="유통사 범례">
      {PLATFORM_KEYS.map((key) => <span key={key}><i className={`platform-swatch platform-${key}`} />{PLATFORM_LABELS[key]}</span>)}
    </div>
    <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img" aria-labelledby="platform-title platform-desc">
      <title id="platform-title">유통사별 누적 순수익 선 그래프</title>
      <desc id="platform-desc">교보문고, YES24, 알라딘, 리디, 밀리의서재의 날짜별 누적 순수익입니다.</desc>
      <ChartGrid scale={scale} />
      {PLATFORM_KEYS.map((key) => {
        const points = days.map((day, index) => ({ x: chartX(index, days.length), y: chartY(day.cumulativePlatforms[key], scale), day }));
        const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
        return <g key={key}>
          <path d={line} className={`platform-line platform-${key}`} />
          {points.map((point) => <circle key={point.day.date} cx={point.x} cy={point.y} r="2.5" className={`platform-dot platform-${key}`}>
            <title>{`${PLATFORM_LABELS[key]} · ${point.day.date} · ${formatCompactWon(point.day.cumulativePlatforms[key])}`}</title>
          </circle>)}
        </g>;
      })}
      {days.map((day, index) => (index % labelStep === 0 || index === days.length - 1)
        ? <text key={day.date} x={chartX(index, days.length)} y={CHART.height - 13} className="sales-axis-date">{day.date.slice(5)}</text>
        : null)}
    </svg>
  </figure>;
}

export function MonthlyChart({ months }: { readonly months: readonly MonthlySales[] }) {
  const chronological = months.toReversed();
  const max = Math.max(...chronological.map((month) => month.total), 1);
  return <figure className="sales-chart-card monthly-chart">
    <figcaption><strong>월별 순수익</strong><span>월말 완료 또는 월중 누적 기준</span></figcaption>
    <div className="monthly-bars" role="img" aria-label="월별 순수익 막대 그래프">
      {chronological.map((month) => <div className="monthly-bar-item" key={month.ym}>
        <div className="monthly-bar-track"><i style={{ height: `${Math.max(5, month.total / max * 100)}%` }}><span>{formatCompactWon(month.total)}</span></i></div>
        <strong>{month.ym.slice(5)}월</strong><small>{month.complete ? "마감" : "진행"}</small>
      </div>)}
    </div>
  </figure>;
}

function ChartGrid({ scale }: { readonly scale: { readonly min: number; readonly max: number } }) {
  return <>{[0, 0.5, 1].map((ratio) => {
    const value = scale.min + (scale.max - scale.min) * ratio;
    const y = chartY(value, scale);
    return <g key={ratio}><line x1={CHART.left} x2={CHART.width - CHART.right} y1={y} y2={y} className="sales-grid-line" /><text x={CHART.left - 8} y={y + 4} className="sales-axis-value">{formatCompactWon(value)}</text></g>;
  })}</>;
}

function chartScale(values: readonly number[]) {
  return { min: 0, max: Math.max(...values, 1) };
}

function chartX(index: number, length: number): number {
  const width = CHART.width - CHART.left - CHART.right;
  return CHART.left + (length <= 1 ? width / 2 : width * index / (length - 1));
}

function chartY(value: number, scale: { readonly min: number; readonly max: number }): number {
  const height = CHART.height - CHART.top - CHART.bottom;
  return CHART.height - CHART.bottom - (value - scale.min) / (scale.max - scale.min) * height;
}
