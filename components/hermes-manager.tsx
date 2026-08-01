import { ArrowRight, CheckCircle, Clock, CloudArrowDown, Pulse, Robot, WarningCircle } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import styles from "@/components/hermes-manager.module.css";
import type { HermesManagerSnapshot } from "@/lib/hermes-manager-domain";
import { formatWon } from "@/lib/sales-format";

const HEALTH_LABELS = {
  healthy: "정상 운영",
  attention: "확인 필요",
  offline: "연결 확인",
} as const satisfies Record<HermesManagerSnapshot["health"], string>;

const STATE_LABELS = {
  connected: "연결됨",
  offline: "연결 끊김",
  ok: "정상",
  error: "실패",
  waiting: "첫 확인 대기",
  current: "오늘 반영",
  manual: "수동 반영",
  delayed: "업데이트 지연",
  fallback: "대체값",
} as const;

const KST_DATE_TIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type SignalProps = {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: "good" | "warn" | "neutral";
};

export function HermesManager({ snapshot }: { readonly snapshot: HermesManagerSnapshot }) {
  const gatewayGood = snapshot.gateway.state === "connected" && snapshot.gateway.slackState === "connected";
  const monitorGood = snapshot.monitor.state === "ok";
  const n8nGood = snapshot.n8n.state === "current" || snapshot.n8n.state === "manual";
  const recoveryValue = snapshot.recovery.blocked > 0
    ? `${snapshot.recovery.blocked}건 사용자 확인`
    : snapshot.recovery.recovering > 0 ? `${snapshot.recovery.recovering}권 재제작 중` : snapshot.recovery.attempts > 0 ? `복구 완료 이력` : "자동 복구 대기";
  const recoveryDetail = snapshot.recovery.lastSummary
    ? `${snapshot.recovery.lastSummary} · 누적 ${snapshot.recovery.attempts}회`
    : snapshot.recovery.attempts > 0 ? `자동 재시작 ${snapshot.recovery.attempts}회 완료` : "실패·정지 시 원인 진단 후 최대 3회 재시작";
  return <section className={styles.manager} id="hermes-manager" aria-labelledby="hermes-manager-title">
    <header className={styles.header}>
      <div className={styles.heading}>
        <span className={styles.robot}><Robot size={24} weight="duotone" /></span>
        <div><p>HERMES OPERATIONS MANAGER</p><h2 id="hermes-manager-title">Hermes 운영 매니저</h2><span>Hermes 주제 접수·Codex 제작·사용자 승인을 한곳에서 관제합니다.</span></div>
      </div>
      <strong className={`${styles.health} ${styles[snapshot.health]}`}><Pulse size={15} />{HEALTH_LABELS[snapshot.health]}</strong>
    </header>

    <div className={styles.signals}>
      <Signal icon={<Robot size={21} />} label="에이전트 연결" value={`Gateway ${STATE_LABELS[snapshot.gateway.state]}`} detail={`Slack ${STATE_LABELS[snapshot.gateway.slackState]} · ${formatDateTime(snapshot.gateway.updatedAt)}`} tone={gatewayGood ? "good" : "warn"} />
      <Signal icon={<Clock size={21} />} label="15분 운영 감시" value={STATE_LABELS[snapshot.monitor.state]} detail={`최근 ${formatDateTime(snapshot.monitor.lastRunAt)} · 다음 ${formatDateTime(snapshot.monitor.nextRunAt)}`} tone={monitorGood ? "good" : "warn"} />
      <Signal icon={<CloudArrowDown size={21} />} label="n8n 07:00 수집" value={STATE_LABELS[snapshot.n8n.state]} detail={`${snapshot.n8n.latestDate ?? "수집 대기"} · 누적 ${formatWon(snapshot.n8n.cumulativeTotal)}`} tone={n8nGood ? "good" : "warn"} />
      <Signal icon={<CheckCircle size={21} />} label="제작 자동 복구" value={recoveryValue} detail={recoveryDetail} tone={snapshot.recovery.blocked > 0 ? "warn" : snapshot.recovery.recovering > 0 ? "good" : "neutral"} />
    </div>

    <div className={styles.briefing}>
      <div className={styles.briefingTitle}><div><p>DAILY OPERATIONS BRIEF</p><h3>지금 확인할 운영 항목</h3></div><span>Hermes 예약 작업 {snapshot.cron.active}개 · 실패 {snapshot.cron.failed}개</span></div>
      <ul>
        {snapshot.priorities.map((priority) => <li className={styles[priority.tone]} key={`${priority.title}-${priority.detail}`}>
          <span>{priority.tone === "urgent" ? <WarningCircle size={18} /> : <CheckCircle size={18} />}</span>
          <div><strong>{priority.title}</strong><p>{priority.detail}</p></div>
        </li>)}
      </ul>
      <footer><span>Hermes에 책 주제를 입력하면 제작이 바로 시작됩니다. 완성 도서의 ISBN 진행은 사용자가 최종 승인합니다.</span><Link href="/sales">매출 상세 보기 <ArrowRight size={15} /></Link></footer>
    </div>
  </section>;
}

function Signal({ icon, label, value, detail, tone }: SignalProps) {
  return <article className={`${styles.signal} ${styles[tone]}`}><div><span>{icon}</span><small>{label}</small></div><strong>{value}</strong><p>{detail}</p></article>;
}

function formatDateTime(value: string | null): string {
  return value === null ? "대기 중" : KST_DATE_TIME.format(new Date(value));
}
