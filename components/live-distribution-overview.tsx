import {
  DISTRIBUTION_PLATFORM_KEYS,
  DISTRIBUTION_PLATFORM_LABELS,
  type DistributionSnapshot,
} from "@/lib/distribution-source";

export function LiveDistributionOverview({ snapshot }: { readonly snapshot: DistributionSnapshot }) {
  return <section className="distribution-section" aria-labelledby="live-distribution-title">
    <div className="section-heading"><div><p className="eyebrow">DAILY DISTRIBUTION STATUS</p><h2 id="live-distribution-title">전자책 5사 유통현황</h2><p>매일 07:00 KST n8n 자동화 기준 · {snapshot.date} 갱신 · 전체 {snapshot.total}건 · 5사 확인 {snapshot.allFive}건 · 확인 필요 {snapshot.attention}건</p></div><span>원장 {snapshot.sourceCatalogGeneratedAt.slice(0, 10)}</span></div>
    <div className="distribution-grid">{DISTRIBUTION_PLATFORM_KEYS.map((key) => {
      const platform = snapshot.platforms[key];
      const coverage = snapshot.total === 0 ? 0 : Math.round(platform.covered / snapshot.total * 100);
      return <article className={`distribution-card ${key === "kyobo" ? "authoritative" : ""}`} key={key}>
        <div className="distribution-card-head"><div><span>매일 자동 확인</span><h3>{DISTRIBUTION_PLATFORM_LABELS[key]}</h3></div><strong>{coverage}%</strong></div>
        <progress aria-label={`${DISTRIBUTION_PLATFORM_LABELS[key]} 등록률`} max={snapshot.total} value={platform.covered} />
        <dl><div><dt>판매중</dt><dd>{platform.live}건</dd></div><div><dt>등록됨</dt><dd>{platform.registered}건</dd></div><div><dt>보완</dt><dd>{platform.review}건</dd></div><div><dt>미등록</dt><dd>{platform.missing}건</dd></div></dl>
      </article>;
    })}</div>
  </section>;
}
