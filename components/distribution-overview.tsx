import type { CatalogPlatformStat } from "@/lib/catalog-schema";
import type { SourceStatus } from "@/lib/dashboard-schema";

export function DistributionOverview({ platforms, sources, total }: { platforms: readonly CatalogPlatformStat[]; sources: readonly SourceStatus[]; total: number }) {
  const kyoboDate = sources.find((source) => source.source === "kyobo-catalog")?.effectiveDate ?? "확인 불가";
  const fiveDate = sources.find((source) => source.source === "five-platform-catalog")?.effectiveDate ?? "확인 불가";
  return <section className="distribution-section" aria-labelledby="distribution-title">
    <div className="section-heading"><div><p className="eyebrow">DISTRIBUTION CHECK</p><h2 id="distribution-title">5사 유통 비교</h2><p>교보문고 {kyoboDate} 기준 · 5사 통합 원장 {fiveDate} 기준</p>
    <p className="policy-notice">📌 밀리의서재 정책 공지(2026-07-15): 동일 도서의 PDF·EPUB 중복 공급분 일괄 반려 진행 중이며, AI 활용 콘텐츠는 회원 CS 누적 시 반려·서비스 중지될 수 있음 — 「등록됨」은 판매 확정이 아닌 제출 기록입니다.</p></div></div>
    <div className="distribution-grid">{platforms.map((platform) => {
      const coverage = total > 0 ? Math.round((platform.covered / total) * 100) : 0;
      return <article className={`distribution-card ${platform.key === "kyobo" ? "authoritative" : ""}`} key={platform.key}>
        <div className="distribution-card-head"><div><span>{platform.key === "kyobo" ? "현재 확정" : "통합 원장"}</span><h3>{platform.label}</h3></div><strong>{coverage}%</strong></div>
        <progress aria-label={`${platform.label} 등록률`} max={total} value={platform.covered} />
        <dl><div><dt>판매중</dt><dd>{platform.live}건</dd></div><div><dt>등록됨</dt><dd>{platform.registered}건</dd></div><div><dt>심사중</dt><dd>{platform.review}건</dd></div><div><dt>보완</dt><dd>{platform.supplement}건</dd></div><div><dt>반려</dt><dd className={platform.rejected ? "rejected-count" : ""}>{platform.rejected}건</dd></div><div><dt>미등록</dt><dd>{platform.missing}건</dd></div></dl>
      </article>;
    })}</div>
  </section>;
}
