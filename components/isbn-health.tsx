import type { IsbnHealth } from "@/lib/isbn-health";

function formatKstDate(value: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
}

function isRecent(value: string, days: number) {
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed) && Date.now() - parsed < days * 24 * 60 * 60 * 1_000;
}

export function IsbnHealthStrip({ health }: { health: IsbnHealth }) {
  const blocking = health.conflicts?.blockingConflictCount ?? 0;
  const recentPoolEvents = health.poolExhaustedEvents.filter((event) => isRecent(event.at, 7));
  return <section className="isbn-health" aria-label="ISBN 발급 헬스">
    <span className="eyebrow">ISBN HEALTH</span>
    <span className={`isbn-health-chip ${blocking > 0 ? "warn" : "ok"}`}>차단 충돌 {blocking}건</span>
    <span className="isbn-health-chip plain">과거 충돌 기록 {health.conflicts?.conflictCount ?? 0}건</span>
    <span className={`isbn-health-chip ${recentPoolEvents.length ? "warn" : "ok"}`}>
      {recentPoolEvents.length
        ? `풀 소진 발생 ${recentPoolEvents.map((event) => `${event.track} ${formatKstDate(event.at)}`).join(" · ")}`
        : "번호 풀 정상 (최근 7일 소진 이벤트 없음)"}
    </span>
    {health.conflicts ? <span className="isbn-health-meta">감사 {formatKstDate(health.conflicts.createdAt)} 기준</span> : <span className="isbn-health-meta">감사 데이터 없음</span>}
  </section>;
}
