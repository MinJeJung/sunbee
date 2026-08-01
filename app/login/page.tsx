import { ArrowRight } from "@phosphor-icons/react/ssr";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions";
import { Logo } from "@/components/logo";
import { isAuthenticated } from "@/lib/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAuthenticated()) redirect("/dashboard");
  const { error } = await searchParams;
  return <main className="login-page">
    <section className="login-card">
      <Logo />
      <div className="login-copy"><p className="eyebrow">OWNER ACCESS</p><h1>선비북스 전자책<br />대시보드</h1><p>교보문고 현재 판매 원장과 5사 판매 현황, 표지·원고·전자책 원본을 확인합니다.</p></div>
      <form action={loginAction} className="login-form">
        <input autoComplete="username" name="username" readOnly type="hidden" value="owner" />
        <label htmlFor="password">대시보드 암호</label>
        <div className="password-row"><input autoComplete="current-password" autoFocus id="password" name="password" placeholder="암호 입력" required type="password" /><button aria-label="로그인" type="submit"><ArrowRight size={20} /></button></div>
        {error ? <p className="form-error" role="alert">암호를 다시 확인해 주세요.</p> : null}
      </form>
      <small className="login-foot">SUNBEE BOOKS · PRIVATE CONSOLE</small>
    </section>
  </main>;
}
