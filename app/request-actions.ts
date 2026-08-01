"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { enqueueBulkTopics } from "@/lib/bulk-intake";
import { isAuthenticated } from "@/lib/auth";
import { approvePlans } from "@/lib/production-flow";
import { updateState } from "@/lib/store";
import { enqueueTopic } from "@/lib/topic-intake";

const BULK_ROW_SCHEMA = z.object({
  rowNumber: z.number().int().min(2),
  targetReader: z.string().trim().min(1).max(120),
  problem: z.string().trim().min(5).max(1_000),
  desiredOutcome: z.string().trim().min(5).max(1_000),
  resources: z.array(z.url()).max(20),
  recommendedOutline: z.string().trim().max(5_000),
  errors: z.array(z.string()).max(20),
}).strict();

function resourcesFrom(value: FormDataEntryValue | null): readonly string[] {
  const lines = z.string().parse(value ?? "").split("\n").map((item) => item.trim()).filter(Boolean);
  return z.array(z.url()).max(20).parse(lines);
}

export async function createTopicAction(formData: FormData) {
  if (!(await isAuthenticated())) redirect("/login");
  const fields = z.object({
    targetReader: z.string().trim().min(1).max(120),
    problem: z.string().trim().min(5).max(1_000),
    desiredOutcome: z.string().trim().min(5).max(1_000),
    recommendedOutline: z.string().trim().max(5_000),
  }).parse({
    targetReader: formData.get("targetReader"),
    problem: formData.get("problem"),
    desiredOutcome: formData.get("desiredOutcome"),
    recommendedOutline: formData.get("recommendedOutline") ?? "",
  });
  const resources = resourcesFrom(formData.get("resources"));
  await updateState((state) => enqueueTopic(state, {
    direction: `${fields.problem}\n\n기대 결과: ${fields.desiredOutcome}`,
    ...fields,
    resources,
    source: "dashboard",
  }).state);
  redirect("/dashboard?created=1#plan-approval");
}

export async function createBulkTopicsAction(formData: FormData) {
  if (!(await isAuthenticated())) redirect("/login");
  const rows = z.array(BULK_ROW_SCHEMA).min(1).max(100).parse(JSON.parse(z.string().parse(formData.get("rows"))));
  const validRows = rows.filter((row) => row.errors.length === 0);
  if (validRows.length === 0) throw new Error("등록 가능한 행이 없습니다.");
  const batchId = crypto.randomUUID();
  const now = new Date().toISOString();
  await updateState((state) => enqueueBulkTopics(state, validRows, batchId, now, () => crypto.randomUUID()));
  redirect(`/requests/bulk?batch=${batchId}&created=${validRows.length}`);
}

export async function approvePlansAction(formData: FormData) {
  if (!(await isAuthenticated())) redirect("/login");
  const operationIds = z.array(z.uuid()).min(1).max(100).parse(formData.getAll("operationIds"));
  const now = new Date().toISOString();
  await updateState((state) => approvePlans(state, operationIds, now, () => crypto.randomUUID()));
  redirect("/dashboard?plans=approved#production-status-title");
}
