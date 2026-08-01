import "server-only";

import { get, put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseRevisionImageContentType, validateRevisionImageSignature, type RevisionImageContentType } from "@/lib/revision-feedback";
import { usesLocalStore } from "@/lib/store";
import type { RevisionAttachment } from "@/lib/types";

const extensionByContentType = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const satisfies Record<RevisionImageContentType, string>;

export class RevisionAttachmentStoreError extends Error {
  readonly code = "REVISION_ATTACHMENT_STORE_FAILED";

  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "RevisionAttachmentStoreError";
  }
}

function dataFilePath(storageKey: string) {
  const dataRoot = path.resolve(process.cwd(), "data");
  const resolved = path.resolve(dataRoot, storageKey);
  if (!resolved.startsWith(`${dataRoot}${path.sep}`)) {
    throw new RevisionAttachmentStoreError("첨부 이미지 저장 경로가 올바르지 않습니다.");
  }
  return resolved;
}

function isMissingFile(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export async function saveRevisionAttachments(operationId: string, files: readonly File[]) {
  const attachments: RevisionAttachment[] = [];
  try {
    for (const file of files) {
      await validateRevisionImageSignature(file);
      const contentType = parseRevisionImageContentType(file.type);
      const id = crypto.randomUUID();
      const storageKey = `revision-attachments/${operationId}/${id}.${extensionByContentType[contentType]}`;
      const bytes = Buffer.from(await file.arrayBuffer());
      if (usesLocalStore()) {
        const destination = dataFilePath(storageKey);
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, bytes, { flag: "wx" });
      } else {
        await put(storageKey, bytes, { access: "private", addRandomSuffix: false, allowOverwrite: false, contentType });
      }
      attachments.push({ id, originalName: file.name, contentType, size: file.size, storageKey });
    }
    return attachments;
  } catch (error) {
    if (error instanceof RevisionAttachmentStoreError) throw error;
    throw new RevisionAttachmentStoreError("첨부 이미지를 저장하지 못했습니다. 다시 시도해 주세요.", error);
  }
}

export async function readRevisionAttachment(attachment: RevisionAttachment) {
  if (usesLocalStore()) {
    try {
      const file = await readFile(dataFilePath(attachment.storageKey));
      return { body: new Uint8Array(file), contentType: attachment.contentType, fileName: attachment.originalName };
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw new RevisionAttachmentStoreError("첨부 이미지를 읽지 못했습니다.", error);
    }
  }
  try {
    const result = await get(attachment.storageKey, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    return { body: result.stream, contentType: attachment.contentType, fileName: attachment.originalName };
  } catch (error) {
    throw new RevisionAttachmentStoreError("첨부 이미지를 읽지 못했습니다.", error);
  }
}
