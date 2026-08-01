"use server";

import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { freelanceItemSchema, runDirectory, SETTLEMENT_ROOT, type FreelanceItem } from "@/lib/settlement-source";

const execFileAsync = promisify(execFile);
const ymSchema = z.string().regex(/^\d{4}-\d{2}$/);

// 클라이언트에는 주민번호를 마스킹해 보내므로, 저장 시 마스킹 값이 오면 기존 값을 유지한다.
const submittedItemSchema = freelanceItemSchema.extend({
  rrn: z.string().trim().max(20).optional(),
});

export async function saveFreelanceAction(formData: FormData) {
  if (!(await isAuthenticated())) redirect("/login");
  const ym = ymSchema.parse(formData.get("ym"));
  const items = z.array(submittedItemSchema).max(100).parse(JSON.parse(z.string().parse(formData.get("items"))));

  const filePath = path.join(runDirectory(ym), "freelance_input.json");
  let existing: FreelanceItem[] = [];
  try {
    const raw = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    if (Array.isArray(raw)) existing = raw as FreelanceItem[];
  } catch {
    // 첫 저장
  }
  const existingByName = new Map(existing.map((item) => [item.name, item]));

  const merged = items.map((item) => {
    const previous = existingByName.get(item.name);
    const next: FreelanceItem = { name: item.name, gross: item.gross, net: item.net };
    const rrn = item.rrn && !item.rrn.includes("*") ? item.rrn : previous?.rrn;
    if (rrn) next.rrn = rrn;
    if (item.bank) next.bank = item.bank;
    else if (previous?.bank) next.bank = previous.bank;
    if (item.account) next.account = item.account;
    else if (previous?.account) next.account = previous.account;
    if (item.note) next.note = item.note;
    return next;
  });

  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(merged, null, 2) + "\n", "utf8");
  await rename(temporary, filePath);
  revalidatePath("/settlement");
  redirect(`/settlement?ym=${ym}&saved=1`);
}

export async function generateTaxXlsxAction(formData: FormData) {
  if (!(await isAuthenticated())) redirect("/login");
  const ym = ymSchema.parse(formData.get("ym"));
  try {
    const { stdout, stderr } = await execFileAsync("/Users/minje/.hermes/node/bin/node", ["generate_tax_xlsx.js"], {
      cwd: SETTLEMENT_ROOT,
      env: { ...process.env, SETTLEMENT_YM: ym },
      timeout: 180_000,
      maxBuffer: 4_194_304,
    });
    console.log("원천세 xlsx 생성:", (stdout || stderr).slice(-400));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("원천세 xlsx 생성 실패:", detail);
    redirect(`/settlement?ym=${ym}&error=${encodeURIComponent(detail.slice(0, 180))}`);
  }
  revalidatePath("/settlement");
  redirect(`/settlement?ym=${ym}&generated=1`);
}
