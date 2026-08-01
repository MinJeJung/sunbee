"use client";

import { ArrowClockwise, BookOpenText, Books, CheckCircle, DownloadSimple, Eye, FileText, WarningCircle } from "@phosphor-icons/react";
import ky from "ky";
import Image from "next/image";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { approveArtifactAction } from "@/app/actions";
import { CatalogTable } from "@/components/catalog-table";
import { DistributionOverview } from "@/components/distribution-overview";
import { RevisionRequestForm } from "@/components/revision-request-form";
import { dashboardSnapshotSchema, type DashboardSnapshotV2 } from "@/lib/dashboard-schema";
import type { CatalogPage } from "@/lib/dashboard-domain";

export function DashboardLive({ initialCatalog, initialSnapshot, planApproval }: { initialCatalog: CatalogPage; initialSnapshot: DashboardSnapshotV2; planApproval: ReactNode }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0);

  const refresh = useCallback(async () => {
    setUpdating(true);
    try {
      const value = await ky.get("/api/dashboard/snapshot", { cache: "no-store" }).json();
      setSnapshot(dashboardSnapshotSchema.parse(value));
      setCatalogRefreshKey((value) => value + 1);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "상태를 갱신하지 못했습니다.");
    } finally {
      setUpdating(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const metrics = snapshot.metrics;
  return <>
    <div className="dashboard-livebar" aria-live="polite">
      <span className={error ? "live-state error" : "live-state"}><i aria-hidden="true" />{error ? "갱신 실패" : "10초 자동 반영"}</span>
      <span>스냅샷 V{snapshot.version} · 배포 {snapshot.buildVersion}</span>
      <button className="refresh-now" disabled={updating} onClick={() => void refresh()} type="button"><ArrowClockwise size={15} />{updating ? "확인 중" : "지금 확인"}</button>
    </div>
    <section className="metric-grid" aria-label="AI 도서 운영 요약">
      <Metric icon={<BookOpenText size={21} />} label="AI 상품" value={`${metrics.productCount}건`} note={`PDF ${metrics.pdf} · EPUB ${metrics.epub}`} />
      <Metric icon={<Books size={21} />} label="고유 도서" value={`${metrics.workCount}권`} note="ISBN 우선 중복 판정" tone="blue" />
      <Metric icon={<CheckCircle size={21} />} label="5사 모두 판매중" value={`${metrics.allFiveLive}권`} note={`5사 상태 보유 ${metrics.knownAcrossFive}권`} tone="green" />
      <Metric icon={<WarningCircle size={21} />} label="조치 필요" value={`${metrics.actionRequired}권`} note={`심사중 ${metrics.reviewing} · 실패 ${metrics.failedOperations}`} tone="amber" />
    </section>
    <SourceStatusPanel snapshot={snapshot} />
    <BridgeWarningBanner snapshot={snapshot} />
    <ProductionStatus snapshot={snapshot} />
    {planApproval}
    <ApprovalQueue snapshot={snapshot} />
    <DistributionOverview platforms={snapshot.platforms} sources={snapshot.sources} total={metrics.productCount} />
    <CatalogTable initialPage={initialCatalog} refreshKey={catalogRefreshKey} />
  </>;
}

function SourceStatusPanel({ snapshot }: { snapshot: DashboardSnapshotV2 }) {
  const labels = {
    "local-state": snapshot.execution === "codex-cloud" ? "클라우드 상태" : "로컬 제작",
    "production-bridge": snapshot.execution === "codex-cloud" ? "Codex Cloud" : "제작 엔진",
    "kyobo-catalog": "교보 원장",
    "five-platform-catalog": "5사 원장",
    sales: "매출",
  };
  const states = { fresh: "정상", stale: "지연", fallback: "대체값", failed: "수집 실패" };
  // 제작 엔진은 원장류와 어휘가 다르다 — "수집 실패"가 아니라 "중단됨"으로 읽혀야 한다.
  const bridgeStates = { fresh: "가동 중", stale: "신호 지연", fallback: "대체값", failed: "중단됨" };
  return <section className="source-status-grid" aria-label="데이터 출처 상태">{snapshot.sources.map((source) => <article className={`source-status source-${source.state}`} key={source.source}>
    <div><strong>{labels[source.source]}</strong><span>{(source.source === "production-bridge" ? bridgeStates : states)[source.state]}</span></div>
    {source.source === "production-bridge"
      ? <small>{snapshot.execution === "codex-cloud"
        ? `실행 중 ${source.rowCount ?? 0}건 · 클라우드 연결`
        : `${source.state === "failed" ? "heartbeat 끊김" : `실행 중 ${source.rowCount ?? 0}건`} · 최근 신호 ${formatSignalTime(source.observedAt)}`}</small>
      : <small>기준일 {source.effectiveDate ?? "확인 불가"}</small>}
    {source.state === "fallback" ? <small>수집 시도 {source.attemptedAt?.slice(0, 10) ?? "확인 불가"}</small> : null}
  </article>)}</section>;
}

function formatSignalTime(value: string | null) {
  if (!value) return "없음";
  const ageMs = Date.now() - Date.parse(value);
  if (Number.isNaN(ageMs)) return "확인 불가";
  if (ageMs < 60_000) return "방금 전";
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${minutes}분 전`;
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분 전`;
}

// 브리지 신호가 끊겼는데 제작 중 표시가 남아 있으면, 화면의 "진행 중"은 허상일 수
// 있다 — 2026-07-19 크래시 루프에서 사용자가 겪은 바로 그 상태를 명시적으로 알린다.
function BridgeWarningBanner({ snapshot }: { snapshot: DashboardSnapshotV2 }) {
  const bridge = snapshot.sources.find((source) => source.source === "production-bridge");
  if (!bridge || bridge.state === "fresh" || snapshot.metrics.activeOperations === 0) return null;
  const failed = bridge.state === "failed";
  return <aside className="bridge-warning-banner" role="alert">
    <div>
      <strong>{failed ? "제작 엔진이 중단된 것으로 보입니다." : "제작 엔진 신호가 지연되고 있습니다."}</strong>
      <p>마지막 신호 {formatSignalTime(bridge.observedAt)} · 아래 &lsquo;진행 중&rsquo; 표시는 멈춘 상태일 수 있습니다. 백그라운드 서비스 로그(~/Library/Logs/SunbeeBooks/ebook-dashboard.log)를 확인하세요.</p>
    </div>
    <span>{failed ? "중단" : "지연"}</span>
  </aside>;
}

const productionLabels: Record<string, string> = {
  insight_queued: "인사이트 대기",
  insight_processing: "인사이트 추출 중",
  plan_review: "제작 기획 승인 대기",
  build_queued: "전자책 제작 대기",
  building: "전자책 제작 중",
  awaiting_review: "완성본 승인 대기",
  revision_requested: "수정 작업 중",
  isbn_processing: "제작 승인 완료",
  isbn_applied: "제작 승인 완료",
  distribution_processing: "제작 완료",
  completed: "제작 완료",
  failed: "제작 확인 필요",
};

const productionStatuses = new Set(["insight_queued", "insight_processing", "build_queued", "building", "revision_requested"]);

function ProductionStatus({ snapshot }: { snapshot: DashboardSnapshotV2 }) {
  const items = snapshot.operations
    .filter((operation) => productionStatuses.has(operation.status) || (operation.status === "failed" && operation.reviewArtifact === null))
    .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const latest = items.slice(0, 3);
  const previous = items.slice(3);
  return <section className="recent-books production-status" aria-labelledby="production-status-title">
    <div className="recent-books-heading">
      <div><p className="eyebrow">PRODUCTION STATUS</p><h2 id="production-status-title">제작 중인 도서 현황</h2><p>Hermes 접수부터 집필·검수·EPUB 제작까지 10초마다 반영합니다.</p></div>
      <span><i aria-hidden="true" />{items.length}권 제작 진행 중</span>
    </div>
    {latest.length ? <div className="recent-book-list" aria-label="최근 제작 중인 도서 3권">{latest.map((operation) => <ProductionRow key={operation.id} operation={operation} />)}</div> : <p className="recent-books-empty">현재 제작 중인 도서가 없습니다.</p>}
    {previous.length ? <details className="recent-books-archive">
      <summary><strong>추가 제작 도서 {previous.length}권</strong><span>열기·닫기</span></summary>
      <div className="recent-book-list">{previous.map((operation) => <ProductionRow key={operation.id} operation={operation} />)}</div>
    </details> : null}
  </section>;
}

function ProductionRow({ operation }: { operation: DashboardSnapshotV2["operations"][number] }) {
  const percent = operation.status === "building"
    ? operation.progress?.percent ?? (operation.productionJobState === "claimed" ? 2 : 0)
    : operation.status === "failed" ? 0 : operation.status === "build_queued" ? 1 : 5;
  const stateLabel = operation.status === "failed"
    ? "확인 필요"
    : operation.productionJobState === "queued"
      ? "제작 대기"
      : operation.progress?.label ?? productionLabels[operation.status] ?? operation.status;
  return <article className="recent-book-row production-book-row">
    <div className="recent-book-title"><strong title={operation.title}>{operation.title}</strong><small>최근 반영 {formatKst(operation.updatedAt)}</small></div>
    <div className="production-progress"><div><strong>{stateLabel}</strong><span>{percent}%</span></div><progress aria-label={`${operation.title} 제작 진척도`} max="100" value={percent} />{operation.progress?.note ? <small>{operation.progress.note}</small> : null}</div>
    <span className={operation.status === "failed" ? "production-state needs-check" : operation.productionJobState === "queued" ? "production-state queued" : "production-state active"}>{operation.status === "failed" ? "확인 필요" : operation.productionJobState === "queued" ? "대기" : "진행 중"}</span>
  </article>;
}

function ApprovalQueue({ snapshot }: { snapshot: DashboardSnapshotV2 }) {
  const reviews = snapshot.operations
    .filter((operation) => operation.status === "awaiting_review" && operation.reviewArtifact)
    .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return <section className="approval-queue" aria-labelledby="approval-queue-title">
    <div className="section-heading"><div><p className="eyebrow">APPROVAL REQUIRED</p><h2 id="approval-queue-title">완성본 승인 대기</h2><p>표지와 원고를 확인한 뒤 승인하면 ISBN 절차가 시작됩니다.</p></div><span>{reviews.length}권 승인 필요</span></div>
    {reviews.length ? <div className="review-list">{reviews.map((operation) => <ApprovalReviewCard key={operation.id} operation={operation} />)}</div> : <div className="approval-empty"><CheckCircle size={20} /><div><strong>현재 승인할 도서가 없습니다.</strong><p>제작이 완료되면 이곳에 표지와 원고가 자동으로 나타납니다.</p></div></div>}
  </section>;
}

function ApprovalReviewCard({ operation }: { operation: DashboardSnapshotV2["operations"][number] }) {
  const artifact = operation.reviewArtifact;
  if (!artifact) return null;
  return <article className="review-card" id={`review-${operation.id}`}>
    <a className="review-cover-link" href={`/api/artifacts/${operation.id}?kind=cover`} rel="noreferrer" target="_blank"><Image alt={`${artifact.title} 표지`} className="review-cover" height={270} src={`/api/artifacts/${operation.id}?kind=cover`} unoptimized width={180} /><span><Eye size={15} /> 표지 크게 보기</span></a>
    <div className="review-copy"><p className="eyebrow">완성본 검수</p><h3>{artifact.title}</h3><p>{formatNumber(artifact.characterCount)}자 · 팩트체크 {artifact.factCheckScore}점 · EPUB {artifact.epubCheckScore}점</p><div className="review-artifacts"><a className="artifact-link" href={`/api/artifacts/${operation.id}?kind=manuscript`} rel="noreferrer" target="_blank"><FileText size={17} /> 책 원고 보기</a><a className="artifact-link" href={`/api/artifacts/${operation.id}?kind=epub`}><DownloadSimple size={17} /> EPUB 다운로드</a></div><small className="review-guidance">표지 제목·목차·본문 흐름을 확인한 뒤 승인하거나 수정 요청을 보내세요.</small></div>
    <div className="review-buttons"><form action={approveArtifactAction}><input name="operationId" type="hidden" value={operation.id} /><input name="fingerprint" type="hidden" value={artifact.fingerprint} /><button className="button primary" type="submit">승인하고 ISBN 진행</button></form><RevisionRequestForm operationId={operation.id} title={artifact.title} /></div>
  </article>;
}

function formatNumber(value: number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatKst(value: string) {
  const kst = new Date(Date.parse(value) + 9 * 60 * 60 * 1_000);
  const hour = String(kst.getUTCHours()).padStart(2, "0");
  const minute = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${kst.getUTCMonth() + 1}. ${kst.getUTCDate()}. ${hour}:${minute}`;
}

function Metric({ icon, label, value, note, tone = "plain" }: { icon: ReactNode; label: string; value: string; note: string; tone?: string }) {
  return <article className={`metric-card metric-${tone}`}><div className="metric-label"><span>{icon}</span>{label}</div><strong>{value}</strong><small>{note}</small></article>;
}
