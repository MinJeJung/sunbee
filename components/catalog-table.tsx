"use client";

import { DownloadSimple, MagnifyingGlass, SlidersHorizontal } from "@phosphor-icons/react";
import ky from "ky";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { StatusPill } from "@/components/status-pill";
import { catalogAssetUrl } from "@/lib/catalog-asset-url";
import { catalogPageSchema, type CatalogPage, type CatalogScope, type CatalogStatusFilter } from "@/lib/dashboard-domain";

const platformNames = ["kyobo", "yes24", "ridi", "aladin", "millie"] as const;
const platformLabels = { kyobo: "교보", yes24: "예스24", ridi: "리디", aladin: "알라딘", millie: "밀리" };

export function CatalogTable({ initialPage, refreshKey }: { initialPage: CatalogPage; refreshKey: number }) {
  const [page, setPage] = useState(initialPage);
  const [scope, setScope] = useState<CatalogScope>(initialPage.scope);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CatalogStatusFilter>("all");
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ scope, q: query, status: filter, page: String(pageNumber), pageSize: "50" });
      setLoading(true);
      setError(null);
      void ky.get(`/api/catalog?${params}`, { signal: controller.signal, cache: "no-store" }).json()
        .then((value) => setPage(catalogPageSchema.parse(value)))
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "원장을 불러오지 못했습니다.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filter, initialPage, pageNumber, query, refreshKey, scope]);

  const selectScope = (value: CatalogScope) => {
    setScope(value);
    setPageNumber(1);
  };
  const selectFilter = (value: CatalogStatusFilter) => {
    setFilter(value);
    setPageNumber(1);
  };

  return <section className="catalog-section" id="catalog">
    <div className="section-heading"><div><p className="eyebrow">CURRENT CATALOG</p><h2>{scope === "ai" ? "AI 도서 원장" : "기존 일반 도서"}</h2></div><span>{loading ? "조회 중" : `${page.total}건 · ${page.page}/${page.totalPages}쪽`}</span></div>
    <div className="catalog-scope" aria-label="원장 범위">
      <FilterButton active={scope === "ai"} onClick={() => selectScope("ai")}>AI 도서</FilterButton>
      <FilterButton active={scope === "legacy"} onClick={() => selectScope("legacy")}>기존 일반 도서</FilterButton>
    </div>
    <div className="catalog-tools">
      <label className="search" htmlFor="catalog-search"><MagnifyingGlass size={18} /><input aria-label="도서 검색" id="catalog-search" name="catalog-search" onChange={(event) => { setQuery(event.target.value); setPageNumber(1); }} placeholder="도서명, 저자, ISBN 검색" value={query} /></label>
      <div className="filters" aria-label="도서 필터"><SlidersHorizontal size={17} />
        <FilterButton active={filter === "all"} onClick={() => selectFilter("all")}>전체</FilterButton>
        <FilterButton active={filter === "allFiveLive"} onClick={() => selectFilter("allFiveLive")}>5사 판매중</FilterButton>
        <FilterButton active={filter === "reviewing"} onClick={() => selectFilter("reviewing")}>심사중</FilterButton>
        <FilterButton active={filter === "action"} onClick={() => selectFilter("action")}>조치 필요</FilterButton>
        <FilterButton active={filter === "pdf"} onClick={() => selectFilter("pdf")}>PDF</FilterButton>
        <FilterButton active={filter === "epub"} onClick={() => selectFilter("epub")}>EPUB</FilterButton>
      </div>
    </div>
    {error ? <p className="catalog-error" role="alert">{error}</p> : null}
    <div className="table-wrap" aria-busy={loading}><table className="catalog-table">
      <thead><tr><th>도서</th><th>형식</th><th>가격</th><th>ISBN</th>{platformNames.map((name) => <th key={name}>{platformLabels[name]}</th>)}<th>확인</th><th>파일</th></tr></thead>
      <tbody>{page.items.map((book) => <tr key={book.productId}>
        <td><div className="book-cell">{book.cover && book.assetId ? <Image alt={`${book.title} 표지`} className="cover-thumb" height={58} src={catalogAssetUrl(book.id, "cover", true)} unoptimized width={40} /> : <span className="cover-placeholder" />}<div><Link href={`/library/${encodeURIComponent(book.id)}`}>{book.title}</Link><small>{book.author || "저자 미기재"} · {book.category || "분류 미기재"}</small><small>교보 {book.kyoboSalesProductId || "상품 ID 미확인"}</small></div></div></td>
        <td><span className={`format-badge format-${book.fileFormat.toLowerCase()}`}>{book.fileFormat}</span></td>
        <td className="number">{book.price ? `${book.price.toLocaleString("ko-KR")}원` : "-"}</td>
        <td><div className="isbn-cell"><span>{book.activeIsbn || "ISBN 미확인"}</span></div></td>
        {platformNames.map((name) => <td key={name}><StatusPill compact platform={name} status={book.platforms[name]} /></td>)}
        <td><span className={book.attentionPlatforms.length ? "coverage-attention" : "coverage-clear"}>{book.attentionPlatforms.length ? book.attentionPlatforms.join(", ") : "이상 없음"}</span></td>
        <td><FileActions book={book} /></td>
      </tr>)}</tbody>
    </table>{page.items.length === 0 ? <div className="empty-table">조건에 맞는 도서가 없습니다.</div> : null}</div>
    <nav className="catalog-pagination" aria-label="원장 페이지">
      <button disabled={page.page <= 1 || loading} onClick={() => setPageNumber((value) => Math.max(1, value - 1))} type="button">이전</button>
      <span>{page.page} / {page.totalPages}</span>
      <button disabled={page.page >= page.totalPages || loading} onClick={() => setPageNumber((value) => value + 1)} type="button">다음</button>
    </nav>
  </section>;
}

function FileActions({ book }: { book: CatalogPage["items"][number] }) {
  return <div className="file-actions">
    {book.manuscript && book.assetId ? <a aria-label="원고 다운로드" href={catalogAssetUrl(book.id, "manuscript")}><DownloadSimple size={15} />원고</a> : null}
    {book.fileFormat === "EPUB" && book.epub && book.assetId ? <a aria-label="EPUB 다운로드" href={catalogAssetUrl(book.id, "epub")}><DownloadSimple size={15} />EPUB</a> : null}
    {book.fileFormat === "PDF" && book.pdf && book.assetId ? <a aria-label="PDF 다운로드" href={catalogAssetUrl(book.id, "pdf")}><DownloadSimple size={15} />PDF</a> : null}
  </div>;
}

function FilterButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return <button aria-pressed={active} className={active ? "active" : ""} onClick={onClick} type="button">{children}</button>;
}
