import { ArrowsClockwise } from "@phosphor-icons/react/ssr";
import type { QualityRefreshReport } from "@/lib/quality-refresh";

// 출간 도서 품질 재감사 결과 보드 — "완성 후에도 계속 좋아지는" 루프의 화면 접점.
// 후보 도서는 기존 수정 요청(재제작) 흐름 또는 correction 큐로 보내 업그레이드한다.
export function QualityRefreshBoard({ report }: { report: QualityRefreshReport | null }) {
  return <section className="operations-section" aria-labelledby="quality-refresh-title">
    <div className="section-heading">
      <div>
        <p className="eyebrow">QUALITY LOOP</p>
        <h2 id="quality-refresh-title">출간 도서 품질 재감사</h2>
        <p>주 1회 전체 도서를 현재 기준으로 다시 검사해 업그레이드 후보를 고릅니다. 기준은 시간이 지나며 올라갑니다.</p>
      </div>
      {report ? <span>{report.candidates.length}권 업그레이드 후보</span> : null}
    </div>
    {report === null
      ? <p className="operations-empty">아직 재감사 결과가 없습니다. <code>scripts/quality_refresh.py</code>를 실행하거나 주간 자동 실행(launchd)을 설치하면 이곳에 표시됩니다.</p>
      : <>
        <p className="quality-refresh-meta">
          최근 재감사 {report.generatedAt.slice(0, 16).replace("T", " ")} · {report.scanned}권 검사 · 통과 {report.passed}권 · 신규 표준 대기 {report.softPending}권
          · 기준: 자연도 {report.standards.min_naturalness} / 독자가치 {report.standards.min_reader_value} / 본문 {report.standards.min_body_chars.toLocaleString("ko-KR")}자
        </p>
        {report.candidates.length
          ? <div className="operation-list">{report.candidates.slice(0, 8).map((candidate) => <div className="operation-row" key={candidate.slug}>
            <span className="operation-icon"><ArrowsClockwise size={17} /></span>
            <div>
              <strong>{candidate.title}</strong>
              <small>{candidate.reasons.slice(0, 2).join(" · ")}{candidate.reasons.length > 2 ? ` 외 ${candidate.reasons.length - 2}건` : ""}</small>
            </div>
            <small className="operation-time">
              자연도 {candidate.metrics.koreanNaturalness ?? "–"} · 목차 {candidate.metrics.tocStatus === "pass" ? "정상" : "결함"}
            </small>
          </div>)}</div>
          : <p className="operations-empty">모든 도서가 현재 기준을 통과했습니다. 기준을 올려 다음 업그레이드 사이클을 시작할 수 있습니다.</p>}
        {report.candidates.length > 8 ? <p className="quality-refresh-meta">외 {report.candidates.length - 8}권 — data/quality-refresh.json에서 전체 목록 확인</p> : null}
      </>}
  </section>;
}
