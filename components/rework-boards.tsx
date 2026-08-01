"use client";

import { DownloadSimple } from "@phosphor-icons/react";
import ky from "ky";
import Image from "next/image";
import { useState } from "react";
import { executeMillieResubmitAction, setReworkStageAction } from "@/app/rework/actions";
import { REWORK_STAGE_LABELS, REWORK_STAGES, type ReworkBoardSummary, type ReworkItem } from "@/lib/rework-domain";

type ReworkPage = ReworkBoardSummary & {
  readonly items: readonly ReworkItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
  readonly millieSource: string | null;
};

export function ReworkBoards({ boards, millieSource }: { boards: readonly ReworkBoardSummary[]; millieSource: string | null }) {
  const total = boards.reduce((sum, board) => sum + board.total, 0);
  return <section className="rework-section" id="rework">
    <div className="section-heading"><div><p className="eyebrow">REWORK BOARDS</p><h2>플랫폼별 재유통 작업판 — 총 {total}권</h2>
      <p>반려·판매중지 도서를 플랫폼별로 한 권씩 처리합니다: 사유 확인 → 보완 재제작 → <b>표지·EPUB 검수 후 「검수 승인」</b> → 플랫폼 제출 → 「재제출함」 체크. 월·목 11시 실사 수집이 결과를 자동 검증합니다.{millieSource ? ` 밀리 원천: ${millieSource}` : ""}</p>
    </div></div>
    {boards.map((board) => <ReworkPanel board={board} key={board.platform} />)}
  </section>;
}

function ReworkPanel({ board }: { board: ReworkBoardSummary }) {
  const [result, setResult] = useState<ReworkPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = async (page: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ platform: board.platform, page: String(page), pageSize: "25" });
      setResult(await ky.get(`/api/rework?${params}`, { cache: "no-store" }).json<ReworkPage>());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "재작업판을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return <details className="rework-panel" onToggle={(event) => {
    if (event.currentTarget.open && result === null && !loading) void loadPage(1);
  }}>
      <summary>
        <strong>{board.label}</strong>
        <span className="rework-summary-counts">작업 대상 {board.total}권 · 대기 {board.stageCounts.todo} · 수정 중 {board.stageCounts.fixing} · 검수 승인 {board.stageCounts.approved} · 재제출함 {board.stageCounts.resubmitted}</span>
      </summary>
      <p className="rework-note">{board.note}</p>
      {loading && result === null ? <div className="empty-table">작업판 조회 중…</div> : null}
      {error ? <div className="empty-table" role="alert">{error}</div> : null}
      {result ? result.items.length ? <div className="table-wrap"><table className="catalog-table"><thead><tr><th>도서</th><th>형식</th><th>상태·사유</th><th>권장 조치</th><th>진행</th></tr></thead><tbody>
        {result.items.map((item) => <ReworkRow item={item} key={item.id} platform={board.platform} />)}
      </tbody></table></div> : <div className="empty-table">작업 대상이 없습니다.</div> : null}
      {result && result.totalPages > 1 ? <nav className="catalog-pagination" aria-label={`${board.label} 재작업 페이지`}>
        <button disabled={result.page <= 1 || loading} onClick={() => void loadPage(result.page - 1)} type="button">이전</button>
        <span>{result.page} / {result.totalPages}</span>
        <button disabled={result.page >= result.totalPages || loading} onClick={() => void loadPage(result.page + 1)} type="button">다음</button>
      </nav> : null}
    </details>;
}

function ReworkRow({ platform, item }: { platform: ReworkBoardSummary["platform"]; item: ReworkItem }) {
  return <tr className={item.stage === "resubmitted" ? "" : "rework-open"}>
    <td><div className="book-cell">
      {item.hasCover && item.slug
        ? <a href={`/api/rework/asset?slug=${encodeURIComponent(item.slug)}&kind=cover`} rel="noreferrer" target="_blank" title="표지 원본 크게 보기">
            <Image alt={`${item.title} 표지`} className="cover-thumb" height={58} loading="lazy" src={`/api/rework/asset?slug=${encodeURIComponent(item.slug)}&kind=cover&thumb=1`} unoptimized width={40} />
          </a>
        : null}
      <div><strong>{item.title}</strong><small>{item.slug || "vault 미매칭"}{item.isbn ? ` · ${item.isbn}` : ""}</small>
      {item.epubFile && item.slug ? <small><a className="artifact-link" href={`/api/rework/asset?slug=${encodeURIComponent(item.slug)}&kind=epub`}><DownloadSimple size={13} /> {item.epubFile}</a></small> : null}</div>
    </div></td>
    <td>{item.format || "-"}</td>
    <td><small><b>{item.statusRaw}</b>{item.reason ? ` — ${item.reason.slice(0, 160)}` : ""}</small></td>
    <td><small>{item.guidance}</small></td>
    <td>{item.autoDetected
      ? <span className="stage-chip active stage-resubmitted">재제출함 · 자동 감지</span>
      : <div className="stage-buttons">{REWORK_STAGES.map((stage) => item.stage === stage
        ? <span className={`stage-chip active stage-${stage}`} key={stage}>{REWORK_STAGE_LABELS[stage]}</span>
        : <form action={setReworkStageAction} key={stage}>
            <input name="platform" type="hidden" value={platform} />
            <input name="id" type="hidden" value={item.id} />
            <input name="stage" type="hidden" value={stage} />
            <button className="stage-chip" type="submit">{REWORK_STAGE_LABELS[stage]}</button>
          </form>)}
      </div>}
    {platform === "millie" && item.slug ? <ResubmitControls item={item} /> : null}
    </td>
  </tr>;
}

function ResubmitControls({ item }: { item: ReworkItem }) {
  if (item.runStatus === "running") {
    return <span className="resubmit-running">⏳ 통합 재유통 실행 중… kdc·EPUB ISBN·판권·제출 순서로 진행 — ISBN 신청이 필요한 책은 최대 1시간 (완료 시 자동 「재제출함」)</span>;
  }
  return <>
    {item.runStatus === "failed" && item.runNote ? <small className="resubmit-failed">⚠️ {item.runNote}</small> : null}
    {item.stage === "approved"
      ? <form action={executeMillieResubmitAction}>
          <input name="code" type="hidden" value={item.id} />
          <input name="slug" type="hidden" value={item.slug} />
          <button className="button primary resubmit-button" type="submit">통합 재유통 실행</button>
        </form>
      : null}
  </>;
}
