import { ArrowLeft, DownloadSimple } from "@phosphor-icons/react/ssr";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { StatusPill } from "@/components/status-pill";
import { readCatalog } from "@/lib/catalog";
import { readLiveCatalog } from "@/lib/live-catalog";
import { requireOwner } from "@/lib/require-owner";
import { readState } from "@/lib/store";

const platforms = [["kyobo", "교보문고"], ["yes24", "예스24"], ["ridi", "리디북스"], ["aladin", "알라딘"], ["millie", "밀리의서재"]] as const;
export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const books = await readLiveCatalog((await readCatalog()).books, (await readState()).operations);
  const book = books.find((candidate) => candidate.id === decodeURIComponent(id));
  if (!book) notFound();
  return <AppShell><div className="book-detail"><Link className="back-link" href="/dashboard#catalog"><ArrowLeft size={16} /> 전체 도서 원장으로</Link><section className="book-hero">
    <div className="detail-cover">{book.cover && book.assetId ? <Image alt={`${book.title} 표지`} fill priority sizes="220px" src={`/api/library/${encodeURIComponent(book.id)}/asset?kind=cover`} unoptimized /> : <span>표지 없음</span>}</div>
    <div><p className="eyebrow">SUNBEE EBOOK RECORD</p><div className="detail-title-row"><span className={`format-badge format-${book.fileFormat.toLowerCase()}`}>{book.fileFormat}</span><span className="current-badge">{book.saleStatus || "상태 확인중"}</span></div><h1>{book.title}</h1>{book.subtitle ? <p className="subtitle">{book.subtitle}</p> : null}<dl className="detail-facts"><div><dt>저자 · 출판사</dt><dd>{book.author || "미기재"} · {book.publisher || "미기재"}</dd></div><div><dt>판매가</dt><dd>{book.price ? `${book.price.toLocaleString("ko-KR")}원` : "미정"}</dd></div><div><dt>출간일</dt><dd>{book.publicationDate || "미정"}</dd></div><div><dt>현재 상품 ISBN</dt><dd>{book.activeIsbn || "미확인"}</dd></div><div><dt>분류</dt><dd>{book.category || "미기재"}</dd></div><div><dt>교보 등록 ID</dt><dd>{book.kyoboSalesProductId || "미확인"}</dd></div></dl>
    <div className="detail-downloads">{book.manuscript && book.assetId ? <a className="button secondary" href={`/api/library/${encodeURIComponent(book.id)}/asset?kind=manuscript`}><DownloadSimple size={17} /> 원고</a> : null}{book.fileFormat === "EPUB" && book.epub && book.assetId ? <a className="button primary" href={`/api/library/${encodeURIComponent(book.id)}/asset?kind=epub`}><DownloadSimple size={17} /> EPUB 원본</a> : null}{book.fileFormat === "PDF" && book.pdf && book.assetId ? <a className="button primary" href={`/api/library/${encodeURIComponent(book.id)}/asset?kind=pdf`}><DownloadSimple size={17} /> PDF 원본</a> : null}</div></div>
  </section><section className="detail-grid"><article><h2>도서 소개</h2><p>{book.summary || "도서 소개가 등록되지 않았습니다."}</p></article><article><h2>5사 유통 현황</h2><div className="platform-list">{platforms.map(([key, label]) => <div key={key}><span>{label}</span><StatusPill platform={key} status={book.platforms[key]} /></div>)}</div><p className={book.attentionPlatforms.length ? "distribution-alert" : "distribution-ok"}>{book.attentionPlatforms.length ? `확인 필요: ${book.attentionPlatforms.join(", ")}` : "5사 상태 이상 없음"}</p></article><article className="detail-record"><h2>도서 등록 정보</h2><dl className="record-grid"><div><dt>상품코드</dt><dd>{book.kyoboProductCode || "-"}</dd></div><div><dt>등록 ID</dt><dd>{book.kyoboSalesProductId || "-"}</dd></div><div><dt>등록일</dt><dd>{book.registeredAt || "-"}</dd></div><div><dt>유통상태</dt><dd>{book.saleStatus || "-"}</dd></div><div><dt>B2B 구매</dt><dd>{book.b2bPurchaseStatus || "-"}</dd></div><div><dt>B2B 대여</dt><dd>{book.b2bRentalStatus || "-"}</dd></div><div><dt>SAM 프리미엄</dt><dd>{book.samPremiumStatus || "-"}</dd></div><div><dt>SAM 무제한</dt><dd>{book.samUnlimitedStatus || "-"}</dd></div></dl></article></section></div></AppShell>;
}
