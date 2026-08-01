import { spawn } from "node:child_process";
import path from "node:path";

// 목차 하이퍼링크 게이트 — 스킬 프롬프트의 "빌드 후 목차 검증" 지시는 모델이 잊으면
// 그대로 출고된다. 제작 완료 보고 직전(run.ts)과 5사 유통 시작 직전(distribution.ts)
// 두 지점에서 코드로 강제한다. 검증 내용은 bridge/validate_epub_toc.py 참조.
const TOC_VALIDATOR = path.join(import.meta.dirname, "validate_epub_toc.py");

export async function assertTocTargets(epubPath: string, options: { requireBodyToc?: boolean } = {}) {
  const args = [TOC_VALIDATOR, epubPath];
  if (options.requireBodyToc) args.push("--require-body-toc");
  await new Promise<void>((resolve, reject) => {
    const child = spawn("/usr/bin/python3", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 3 * 60_000);
    child.stdout.on("data", (chunk: Buffer) => { stdout = `${stdout}${chunk.toString("utf8")}`.slice(-20_000); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = `${stderr}${chunk.toString("utf8")}`.slice(-20_000); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) { resolve(); return; }
      let failures = stderr.trim();
      try {
        const verdict = JSON.parse(stdout) as { failures?: string[] };
        if (verdict.failures?.length) failures = verdict.failures.join(" / ");
      } catch { /* stderr 원문 사용 */ }
      reject(new Error(`목차 하이퍼링크 검증 실패 — ${failures.slice(0, 1_500)}`));
    });
  });
}
