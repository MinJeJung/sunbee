"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession, isAuthenticated, verifyPassword } from "@/lib/auth";
import { prepareHeldBookRebuilds } from "@/lib/held-book-rebuild";
import { RevisionAttachmentStoreError, saveRevisionAttachments } from "@/lib/revision-attachment-store";
import { parseRevisionImageFiles, RevisionFeedbackError, type RevisionActionState } from "@/lib/revision-feedback";
import { readState, updateState } from "@/lib/store";
import type { RevisionAttachment } from "@/lib/types";

export async function loginAction(formData: FormData) {
  const password = z.string().min(1).parse(formData.get("password"));
  if (!verifyPassword(password)) redirect("/login?error=1");
  await createSession();
  redirect("/dashboard");
}

export async function logoutAction() { await destroySession(); redirect("/login"); }

export async function approveArtifactAction(formData: FormData) {
  if (!(await isAuthenticated())) redirect("/login");
  const fields = z.object({ operationId: z.uuid(), fingerprint: z.string().min(8) }).parse({
    operationId: formData.get("operationId"), fingerprint: formData.get("fingerprint")
  });
  const now = new Date().toISOString();
  await updateState((state) => {
    const operation = state.operations.find((candidate) => candidate.id === fields.operationId);
    if (!operation || operation.status !== "awaiting_review" || operation.artifact?.fingerprint !== fields.fingerprint) throw new Error("검수 중인 최신 완성본만 승인할 수 있습니다.");
    return {
      ...state,
      operations: state.operations.map((candidate) => candidate.id === fields.operationId
        ? { ...candidate, approvedFingerprint: fields.fingerprint, status: "isbn_processing" as const, updatedAt: now }
        : candidate),
      jobs: [{ id: crypto.randomUUID(), operationId: fields.operationId, type: "isbn" as const, status: "queued" as const, createdAt: now, updatedAt: now }, ...state.jobs]
    };
  });
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function retryIsbnAction(formData: FormData) {
  if (!(await isAuthenticated())) redirect("/login");
  const operationId = z.uuid().parse(formData.get("operationId"));
  const now = new Date().toISOString();
  await updateState((state) => {
    const operation = state.operations.find((candidate) => candidate.id === operationId);
    if (!operation || operation.status !== "failed" || !operation.artifact || operation.approvedFingerprint !== operation.artifact.fingerprint) {
      throw new Error("승인된 ISBN 실패 작업만 다시 실행할 수 있습니다.");
    }
    return {
      ...state,
      operations: state.operations.map((candidate) => {
        if (candidate.id !== operationId) return candidate;
        const { error: _error, ...rest } = candidate;
        void _error;
        return { ...rest, status: "isbn_processing" as const, updatedAt: now };
      }),
      jobs: [{ id: crypto.randomUUID(), operationId, type: "isbn" as const, status: "queued" as const, createdAt: now, updatedAt: now }, ...state.jobs],
    };
  });
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function retryDistributionAction(formData: FormData) {
  if (!(await isAuthenticated())) redirect("/login");
  const operationId = z.uuid().parse(formData.get("operationId"));
  const now = new Date().toISOString();
  await updateState((state) => {
    const operation = state.operations.find((candidate) => candidate.id === operationId);
    if (!operation || operation.status !== "failed" || !operation.artifact ||
        operation.approvedFingerprint !== operation.artifact.fingerprint || !operation.isbn || operation.colophonStatus !== "completed") {
      throw new Error("ISBN과 판권면이 확정된 유통 실패 작업만 다시 실행할 수 있습니다.");
    }
    return {
      ...state,
      operations: state.operations.map((candidate) => {
        if (candidate.id !== operationId) return candidate;
        const { error: _error, ...rest } = candidate;
        void _error;
        return { ...rest, status: "isbn_applied" as const, updatedAt: now };
      }),
      jobs: [{ id: crypto.randomUUID(), operationId, type: "distribution" as const, status: "queued" as const, createdAt: now, updatedAt: now }, ...state.jobs],
    };
  });
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function retryProductionAction(formData: FormData) {
  if (!(await isAuthenticated())) redirect("/login");
  const operationId = z.uuid().parse(formData.get("operationId"));
  const now = new Date().toISOString();
  await updateState((state) => {
    const operation = state.operations.find((candidate) => candidate.id === operationId);
    const hasActiveJob = state.jobs.some((job) =>
      job.operationId === operationId && ["queued", "claimed"].includes(job.status));
    if (!operation || operation.status !== "failed" || operation.artifact || hasActiveJob) {
      throw new Error("완성본이 없는 실패한 제작 건만 다시 시작할 수 있습니다.");
    }
    // 인사이트가 없으면 인사이트부터, 있으면 제작부터 재시작 — 항상 새 작업 ID로 만든다
    // (기존 작업 재사용은 구 브리지의 늦은 실패 보고와 충돌할 수 있음).
    const type = operation.insight ? ("book_build" as const) : ("topic_insight" as const);
    return {
      ...state,
      jobs: [{ id: crypto.randomUUID(), operationId, type, status: "queued" as const, createdAt: now, updatedAt: now }, ...state.jobs],
    };
  });
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function rebuildHeldBooksAction() {
  if (!(await isAuthenticated())) redirect("/login");
  const now = new Date().toISOString();
  await updateState((state) => prepareHeldBookRebuilds(state, now));
  revalidatePath("/dashboard");
  redirect("/dashboard?rebuild=queued");
}

export async function startDistributionAction(formData: FormData) {
  if (!(await isAuthenticated())) redirect("/login");
  const operationId = z.uuid().parse(formData.get("operationId"));
  const now = new Date().toISOString();
  await updateState((state) => {
    const operation = state.operations.find((candidate) => candidate.id === operationId);
    const hasActiveJob = state.jobs.some((job) =>
      job.operationId === operationId && job.type === "distribution" && ["queued", "claimed"].includes(job.status));
    if (!operation || operation.status !== "isbn_applied" || hasActiveJob || !operation.artifact ||
        operation.approvedFingerprint !== operation.artifact.fingerprint || !operation.isbn || operation.colophonStatus !== "completed") {
      throw new Error("ISBN·판권면이 확정되고 대기 중인 유통 작업이 없는 도서만 유통을 시작할 수 있습니다.");
    }
    return {
      ...state,
      jobs: [{ id: crypto.randomUUID(), operationId, type: "distribution" as const, status: "queued" as const, createdAt: now, updatedAt: now }, ...state.jobs],
    };
  });
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function requestRevisionAction(_previousState: RevisionActionState, formData: FormData): Promise<RevisionActionState> {
  if (!(await isAuthenticated())) redirect("/login");
  const parsedFields = z.object({ operationId: z.uuid(), notes: z.string().trim().min(5).max(5000) }).safeParse({
    operationId: formData.get("operationId"), notes: formData.get("notes")
  });
  if (!parsedFields.success) return { status: "error", message: "수정 내용을 5자 이상 5,000자 이하로 입력해 주세요." };
  const files = formData.getAll("images").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  let parsedFiles: readonly File[];
  try {
    parsedFiles = parseRevisionImageFiles(files);
  } catch (error) {
    if (error instanceof RevisionFeedbackError) return { status: "error", message: error.message };
    throw error;
  }
  const operation = (await readState()).operations.find((candidate) => candidate.id === parsedFields.data.operationId);
  if (!operation || operation.status !== "awaiting_review") {
    return { status: "error", message: "검수 중인 완성본만 수정 요청할 수 있습니다." };
  }
  let attachments: readonly RevisionAttachment[];
  try {
    attachments = await saveRevisionAttachments(parsedFields.data.operationId, parsedFiles);
  } catch (error) {
    if (error instanceof RevisionAttachmentStoreError) return { status: "error", message: error.message };
    throw error;
  }
  const now = new Date().toISOString();
  let transitionError = false;
  await updateState((state) => {
    const current = state.operations.find((candidate) => candidate.id === parsedFields.data.operationId);
    if (!current || current.status !== "awaiting_review") {
      transitionError = true;
      return state;
    }
    return {
      ...state,
      operations: state.operations.map((candidate) => {
        if (candidate.id !== parsedFields.data.operationId) return candidate;
        const { approvedFingerprint: _approvedFingerprint, ...rest } = candidate;
        void _approvedFingerprint;
        return { ...rest, revisionNotes: parsedFields.data.notes, revisionAttachments: attachments, status: "revision_requested" as const, updatedAt: now };
      }),
      jobs: [{ id: crypto.randomUUID(), operationId: parsedFields.data.operationId, type: "book_build" as const, status: "queued" as const, createdAt: now, updatedAt: now }, ...state.jobs]
    };
  });
  if (transitionError) return { status: "error", message: "검수 상태가 변경되었습니다. 화면을 새로고침해 주세요." };
  revalidatePath("/dashboard");
  return { status: "sent", message: "수정 요청을 Codex에 전달했습니다." };
}
