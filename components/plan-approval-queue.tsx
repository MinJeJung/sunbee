import { CheckCircle, Files } from "@phosphor-icons/react/ssr";
import { approvePlansAction } from "@/app/request-actions";
import type { Operation } from "@/lib/types";

const TYPE_LABELS = { quick: "빠른 실전형", standard: "표준 실무형", deep: "심화형" } as const;

export function PlanApprovalQueue({ operations }: { readonly operations: readonly Operation[] }) {
  const plans = operations.filter((operation) => operation.status === "plan_review" && operation.insight)
    .toSorted((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  return <section className="plan-approval" id="plan-approval" aria-labelledby="plan-approval-title">
    <div className="section-heading"><div><p className="eyebrow">PLAN APPROVAL</p><h2 id="plan-approval-title">제작 기획 승인</h2><p>약속·목차·권장 분량·독자 자산을 확인한 뒤 제작할 책만 선택하세요.</p></div><span>{plans.length}권 승인 필요</span></div>
    {plans.length ? <form action={approvePlansAction}><div className="plan-list">{plans.map((operation) => {
      const insight = operation.insight;
      if (!insight) return null;
      const bookType = insight.bookType ?? "standard";
      const characters = insight.recommendedCharacters ?? { min: 60_000, max: 90_000 };
      return <label className="plan-card" key={operation.id}><input defaultChecked name="operationIds" type="checkbox" value={operation.id} /><div className="plan-card-body"><div className="plan-card-title"><span>{operation.batchId ? <Files size={17} /> : <CheckCircle size={17} />}{operation.batchRow ? `${operation.batchRow}행` : "단건"}</span><h3>{insight.recommendedTitle}</h3></div><p>{insight.readerPromise}</p><dl><div><dt>독자</dt><dd>{insight.targetReader}</dd></div><div><dt>유형</dt><dd>{TYPE_LABELS[bookType]}</dd></div><div><dt>권장 분량</dt><dd>{characters.min.toLocaleString("ko-KR")}~{characters.max.toLocaleString("ko-KR")}자</dd></div><div><dt>차별화</dt><dd>{insight.differentiation ?? "기존 도서와 다른 독자 결과 중심"}</dd></div></dl><div className="plan-assets"><strong>제공 자산</strong><span>{(insight.readerAssets ?? ["실행 체크리스트"]).join(" · ")}</span></div><ol>{insight.chapterDirections.map((chapter) => <li key={chapter}>{chapter}</li>)}</ol></div></label>;
    })}</div><div className="plan-approval-actions"><p>같은 대량 작업의 책은 체크한 행 순서대로 한 권씩 제작됩니다.</p><button className="button primary" type="submit">선택 기획 승인 및 순차 제작</button></div></form> : <div className="approval-empty"><CheckCircle size={20} /><div><strong>승인할 기획안이 없습니다.</strong><p>단건 또는 대량 작업을 등록하면 이곳에서 집필 전 검수할 수 있습니다.</p></div></div>}
  </section>;
}
