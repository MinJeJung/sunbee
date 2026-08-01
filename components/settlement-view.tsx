"use client";

import { DownloadSimple, FloppyDisk, Plus, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { generateTaxXlsxAction, saveFreelanceAction } from "@/app/settlement/actions";
import type { FreelanceItem, SettlementRun } from "@/lib/settlement-source";

const WITHHOLDING_RATE = 0.967; // 원천세 3.3% 공제 후

function won(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

type EditableItem = FreelanceItem & { rrnMasked?: string | undefined };

export function SettlementView({ run, notice }: { run: SettlementRun; notice?: string | undefined }) {
  const [items, setItems] = useState<EditableItem[]>(run.freelance.map((item) => ({
    ...item,
    rrnMasked: item.rrn,
    rrn: item.rrn,
  })));

  const update = (index: number, patch: Partial<EditableItem>) => {
    setItems((current) => current.map((item, i) => {
      if (i !== index) return item;
      const next = { ...item, ...patch };
      if (patch.gross !== undefined) next.net = Math.round(patch.gross * WITHHOLDING_RATE);
      return next;
    }));
  };

  const authorTotal = run.aggregated?.eligibleSettlement ?? 0;
  const freelanceGross = items.reduce((sum, item) => sum + (item.gross || 0), 0);
  const freelanceNet = items.reduce((sum, item) => sum + (item.net || 0), 0);

  return <>
    {notice ? <p className="settlement-notice">{notice}</p> : null}

    <section className="catalog-section">
      <div className="section-heading"><div><p className="eyebrow">AUTHORS</p><h2>작가 인세 (자동 집계)</h2><p>정산 수집 자동화(교보·YES24·알라딘)의 계산 결과입니다. 금액 수정은 수집 파이프라인에서 처리합니다.</p></div><span>{run.aggregated ? `합계 ${won(authorTotal)}` : ""}</span></div>
      {run.aggregated
        ? <div className="table-wrap"><table className="catalog-table"><thead><tr><th>작가</th><th>인세내역</th><th>원천세(3.3%)</th><th>공제 후 입금액</th></tr></thead><tbody>
            {run.aggregated.authors.map((author) => <tr key={author.recipient}><td>{author.recipient}</td><td className="number">{won(author.totalSettlement)}</td><td className="number">{won(author.withholdingTax)}</td><td className="number">{won(author.netDeposit)}</td></tr>)}
          </tbody></table>{run.aggregated.authors.length === 0 ? <div className="empty-table">이번 달 정산 대상 작가가 없습니다.</div> : null}</div>
        : <div className="empty-table">{run.aggregatedError}</div>}
      {run.aggregated && run.aggregated.negativeAuthorCount > 0 ? <p className="settlement-warn">⚠️ 음수 정산 작가 {run.aggregated.negativeAuthorCount}명 — 발송 제외·다음 달 검토 대상입니다.</p> : null}
    </section>

    <section className="catalog-section">
      <div className="section-heading"><div><p className="eyebrow">FREELANCE</p><h2>강사·프리랜서 원천세 입력</h2><p>세전(gross)을 입력하면 공제 후(net)는 ×0.967로 자동 계산됩니다. 주민번호는 화면에 마스킹되며, 비워 두면 기존 값이 유지됩니다.</p></div><span>세전 {won(freelanceGross)} · 공제후 {won(freelanceNet)}</span></div>
      <div className="table-wrap"><table className="catalog-table settlement-input-table"><thead><tr><th>이름</th><th>세전 금액</th><th>공제 후</th><th>주민등록번호</th><th>은행</th><th>계좌번호</th><th>비고</th><th /></tr></thead><tbody>
        {items.map((item, index) => <tr key={index}>
          <td><input aria-label="이름" onChange={(event) => update(index, { name: event.target.value })} value={item.name} /></td>
          <td><input aria-label="세전 금액" inputMode="numeric" onChange={(event) => update(index, { gross: Number(event.target.value.replaceAll(/\D/g, "")) || 0 })} value={item.gross ? item.gross.toLocaleString("ko-KR") : ""} /></td>
          <td><input aria-label="공제 후" inputMode="numeric" onChange={(event) => update(index, { net: Number(event.target.value.replaceAll(/\D/g, "")) || 0 })} value={item.net ? item.net.toLocaleString("ko-KR") : ""} /></td>
          <td><input aria-label="주민등록번호" onChange={(event) => update(index, { rrn: event.target.value })} placeholder={item.rrnMasked || "000000-0000000"} value={item.rrn === item.rrnMasked ? "" : item.rrn ?? ""} /></td>
          <td><input aria-label="은행" onChange={(event) => update(index, { bank: event.target.value })} value={item.bank ?? ""} /></td>
          <td><input aria-label="계좌번호" onChange={(event) => update(index, { account: event.target.value })} value={item.account ?? ""} /></td>
          <td><input aria-label="비고" onChange={(event) => update(index, { note: event.target.value })} value={item.note ?? ""} /></td>
          <td><button aria-label="행 삭제" className="row-remove" onClick={() => setItems((current) => current.filter((_, i) => i !== index))} type="button"><Trash size={15} /></button></td>
        </tr>)}
      </tbody></table>{items.length === 0 ? <div className="empty-table">아직 입력된 강사·프리랜서가 없습니다.</div> : null}</div>
      <div className="settlement-actions">
        <button className="button secondary" onClick={() => setItems((current) => [...current, { name: "", gross: 0, net: 0 }])} type="button"><Plus size={16} /> 행 추가</button>
        <form action={saveFreelanceAction}>
          <input name="ym" type="hidden" value={run.ym} />
          <input name="items" type="hidden" value={JSON.stringify(items.filter((item) => item.name.trim()).map(({ rrnMasked: _rrnMasked, ...item }) => ({ ...item, rrn: item.rrn === _rrnMasked ? _rrnMasked : item.rrn })))} />
          <button className="button secondary" type="submit"><FloppyDisk size={16} /> 저장</button>
        </form>
        <form action={generateTaxXlsxAction}>
          <input name="ym" type="hidden" value={run.ym} />
          <button className="button primary" type="submit">세무사 발송용 엑셀 생성</button>
        </form>
        {run.exportFile ? <a className="button secondary" href={`/api/settlement/export?ym=${run.ym}`}><DownloadSimple size={16} /> {run.exportFile.name} 다운로드</a> : null}
      </div>
    </section>
  </>;
}
