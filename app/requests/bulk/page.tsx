import { ArrowLeft, Files } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { BulkUpload } from "@/components/bulk-upload";
import { requireOwner } from "@/lib/require-owner";
import { readState } from "@/lib/store";

const STATUS_LABELS: Readonly<Record<string, string>> = {
  insight_queued: "기획 분석 대기", insight_processing: "기획 분석 중", plan_review: "기획 승인 대기",
  build_queued: "제작 대기", building: "제작 중", awaiting_review: "완성본 승인 대기", failed: "확인 필요",
};

export default async function BulkRequestPage({ searchParams }: { readonly searchParams: Promise<{ readonly batch?: string; readonly created?: string }> }) {
  await requireOwner();
  const query = await searchParams;
  const state = await readState();
  const operations = query.batch ? state.operations.filter((operation) => operation.batchId === query.batch).toSorted((left, right) => (left.batchRow ?? 0) - (right.batchRow ?? 0)) : [];
  return <AppShell><div className="request-page bulk-page">
    <Link className="back-link" href="/dashboard"><ArrowLeft size={16} /> 운영 현황으로</Link>
    <div className="request-heading"><span className="request-icon"><Files size={26} /></span><div><p className="eyebrow">BULK BOOKS</p><h1>대량 작업</h1><p>파일을 검증한 뒤 기획안을 만들고, 선택 승인한 책만 행 순서대로 한 권씩 제작합니다.</p></div></div>
    {operations.length ? <section className="batch-receipt"><div><strong>{operations.length}권 기획 요청 완료</strong><span>기획이 완성되면 대시보드 승인 영역에 나타납니다.</span></div><Link className="button primary" href="/dashboard#plan-approval">기획 승인 화면</Link><div className="batch-row-list">{operations.map((operation) => <div key={operation.id}><span>{operation.batchRow}행</span><strong>{operation.targetReader} · {operation.problem}</strong><small>{STATUS_LABELS[operation.status] ?? operation.status}</small></div>)}</div></section> : <BulkUpload />}
  </div></AppShell>;
}
