import { Brain, FileText, Robot, WarningCircle } from "@phosphor-icons/react/ssr";
import { rebuildHeldBooksAction, retryDistributionAction, retryIsbnAction, retryProductionAction, startDistributionAction } from "@/app/actions";
import { isHeldBookEligible } from "@/lib/held-book-rebuild";
import type { Job, Operation } from "@/lib/types";

const labels = {
  insight_queued: "리소스 인사이트 대기", insight_processing: "인사이트 추출 중", plan_review: "제작 기획 승인 대기", build_queued: "SOL 제작 대기", building: "SOL 제작 중",
  awaiting_review: "완성본 승인 필요", revision_requested: "수정 작업 중", isbn_processing: "ISBN 진행 중",
  isbn_applied: "ISBN 접수·판권 반영 완료", distribution_processing: "5사 유통 중", completed: "완료", failed: "확인 필요"
};

function formatKstTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function Operations({ operations, jobs }: { operations: Operation[]; jobs: Job[] }) {
  const activeDistributionIds = new Set(jobs
    .filter((job) => job.type === "distribution" && ["queued", "claimed"].includes(job.status))
    .map((job) => job.operationId));
  const rows = operations.filter((operation) => ["isbn_processing", "isbn_applied", "distribution_processing", "failed"].includes(operation.status));
  const heldCount = operations.filter((operation) => isHeldBookEligible(operation, jobs)).length;
  const archiveRows = operations.filter((operation) => operation.status === "completed");
  return <section className="operations-section">
    <div className="section-heading"><div><p className="eyebrow">POST PRODUCTION</p><h2>ISBN·유통 후속 작업</h2><p>승인 이후 ISBN과 5사 유통 단계만 모아 확인합니다.</p></div>
      {heldCount > 0
        ? <form action={rebuildHeldBooksAction}><button className="button secondary" type="submit">보류 {heldCount}권 전체 재제작</button></form>
        : <span>{rows.length}권 처리 중</span>}
    </div>
    {rows.length ? <div className="operation-list">{rows.map((operation) => <OperationRow key={operation.id} operation={operation} pendingDistribution={activeDistributionIds.has(operation.id)} />)}</div> : <p className="operations-empty">현재 처리 중인 ISBN·유통 작업이 없습니다.</p>}
    {archiveRows.length ? <details className="ops-archive">
      <summary><strong>이전 작업물</strong><span className="rework-summary-counts">{archiveRows.length}권 · 완료 {archiveRows.filter((operation) => operation.status === "completed" && operation.metadataState !== "missing").length}권</span></summary>
      <div className="operation-list">{archiveRows.map((operation) => <OperationRow key={operation.id} operation={operation} pendingDistribution={activeDistributionIds.has(operation.id)} />)}</div>
    </details> : null}
  </section>;
}

function OperationRow({ operation, pendingDistribution }: { operation: Operation; pendingDistribution: boolean }) {
  const failed = operation.status === "failed";
  const canRetry = failed && operation.artifact && operation.approvedFingerprint === operation.artifact.fingerprint;
  const canStartDistribution = operation.status === "isbn_applied" && !pendingDistribution
    && Boolean(operation.artifact) && operation.approvedFingerprint === operation.artifact?.fingerprint
    && Boolean(operation.isbn) && operation.colophonStatus === "completed";
  const statusLabel = operation.metadataState === "missing" ? "정보 확인 필요" : labels[operation.status];
  const detail = operation.error
    ? `${statusLabel} · ${operation.error}`
    : operation.isbn
      ? `${statusLabel} · ISBN ${operation.isbn}${operation.isbnStatus === "issued" ? " (발급 확정)" : " (신청)"}`
      : statusLabel;
  return <div className={`operation-row${failed ? " failed" : ""}`}>
    <span className="operation-icon">{failed ? <WarningCircle size={17} /> : operation.status.includes("insight") ? <Brain size={17} /> : operation.status === "building" ? <Robot size={17} /> : <FileText size={17} />}</span>
    <div>
      <strong>{operation.insight?.recommendedTitle || operation.direction}</strong>
      <small>{detail}</small>
    </div>
    {canRetry
      ? <form action={operation.isbn ? retryDistributionAction : retryIsbnAction}><input name="operationId" type="hidden" value={operation.id} /><button className="button secondary" type="submit">{operation.isbn ? "5사 유통 다시 실행" : "ISBN 다시 실행"}</button></form>
      : failed && !operation.artifact
        ? <form action={retryProductionAction}><input name="operationId" type="hidden" value={operation.id} /><button className="button secondary" type="submit">{operation.insight ? "다시 제작" : "인사이트부터 다시"}</button></form>
        : canStartDistribution
          ? <form action={startDistributionAction}><input name="operationId" type="hidden" value={operation.id} /><button className="button secondary" type="submit">5사 유통 시작</button></form>
          : <small className="operation-time">{formatKstTime(operation.updatedAt)}</small>}
  </div>;
}
