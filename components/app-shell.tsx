import { Books, ChartLineUp, Files, Gauge, Plus, Receipt, Robot, SignOut } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions";
import { Logo } from "@/components/logo";

export function AppShell({ children }: { children: ReactNode }) {
  return <div className="shell">
    <aside className="sidebar">
      <Logo />
      <nav aria-label="주요 메뉴">
        <Link href="/dashboard"><Gauge size={18} />운영 현황</Link>
        <Link href="/dashboard#hermes-manager"><Robot size={18} />Hermes 관제</Link>
        <Link href="/sales"><ChartLineUp size={18} />매출 분석</Link>
        <Link href="/settlement"><Receipt size={18} />정산 관리</Link>
        <Link href="/requests/new"><Plus size={18} />새 책 시작</Link>
        <Link href="/requests/bulk"><Files size={18} />대량 작업</Link>
        <Link href="/dashboard#catalog"><Books size={18} />전체 도서</Link>
        <Link href="/dashboard#rework"><Books size={18} />재유통 작업판</Link>
      </nav>
      <form action={logoutAction}><button type="submit"><SignOut size={18} />로그아웃</button></form>
    </aside>
    <div className="content-column"><header className="mobile-header"><Logo /><Link className="button primary small" href="/requests/new">새 책</Link></header><main>{children}</main></div>
  </div>;
}
