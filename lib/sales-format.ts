export function formatWon(value: number | null): string {
  return value === null ? "집계 보류" : `${value.toLocaleString("ko-KR")}원`;
}

export function formatCompactWon(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억원`;
  if (absolute >= 10_000) return `${(value / 10_000).toFixed(1)}만원`;
  return `${value.toLocaleString("ko-KR")}원`;
}

export function formatMonth(ym: string): string {
  const [year, month] = ym.split("-");
  return `${year}년 ${month}월`;
}
