import { ArrowLeft, Brain, Check, LinkSimple, Sparkle } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { createTopicAction } from "@/app/request-actions";
import { AppShell } from "@/components/app-shell";
import { requireOwner } from "@/lib/require-owner";

export default async function NewRequestPage() {
  await requireOwner();
  return <AppShell><div className="request-page">
    <Link className="back-link" href="/dashboard"><ArrowLeft size={16} /> 운영 현황으로</Link>
    <div className="request-heading"><span className="request-icon"><Sparkle size={26} /></span><div><p className="eyebrow">NEW BOOK</p><h1>네 가지만 알려주세요.</h1><p>SOL이 출간 기획을 만들고, 승인받은 뒤에만 집필을 시작합니다.</p></div></div>
    <form action={createTopicAction} className="request-form">
      <section className="form-section compact-fields"><div className="form-section-title"><span>1</span><div><h2>독자와 문제</h2><p>필수 항목</p></div></div><label htmlFor="targetReader">예상 독자</label><input autoFocus id="targetReader" maxLength={120} name="targetReader" placeholder="예: 마케터, 데이터 분석가, 1인 사업자" required /><label htmlFor="problem">독자가 해결하고 싶은 문제</label><textarea id="problem" maxLength={1000} minLength={5} name="problem" placeholder="예: 반복되는 캠페인 기획과 성과 보고에 시간이 너무 많이 든다" required rows={4} /><label htmlFor="desiredOutcome">책을 읽고 얻게 될 결과</label><textarea id="desiredOutcome" maxLength={1000} minLength={5} name="desiredOutcome" placeholder="예: AI 에이전트로 마케팅 워크플로우를 직접 설계하고 운영한다" required rows={4} /></section>
      <section className="form-section"><div className="form-section-title"><span>2</span><div><h2>참고 자료</h2><p>선택 항목</p></div></div><label htmlFor="resources"><LinkSimple size={18} /> 논문·유튜브·문서 URL</label><textarea id="resources" name="resources" placeholder={"URL을 한 줄에 하나씩 입력\nhttps://arxiv.org/abs/..."} rows={5} /><small>최대 20개. 접근 가능한 실제 자료만 근거로 사용합니다.</small><label htmlFor="recommendedOutline">추천 목차</label><textarea id="recommendedOutline" maxLength={5000} name="recommendedOutline" placeholder="원하는 목차가 있을 때만 입력하세요." rows={5} /></section>
      <aside className="automation-note"><Brain size={24} /><div><strong>먼저 기획안만 만듭니다.</strong><p>자료 분석 → 독자 약속·권장 분량·목차·자산 기획 → 사용자 승인 → 순차 제작</p></div></aside>
      <button className="button primary submit-button" type="submit"><Check size={18} weight="bold" /> 기획안 생성 요청</button>
    </form>
  </div></AppShell>;
}
