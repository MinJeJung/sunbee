import ky from "ky";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { RevisionPromptImage } from "../lib/revision-feedback";
import type { Operation, RevisionAttachment } from "../lib/types";

const extensionByContentType = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const satisfies Record<RevisionAttachment["contentType"], string>;

export class RevisionImageMaterializationError extends Error {
  readonly code = "REVISION_IMAGE_DOWNLOAD_FAILED";

  constructor(cause: unknown) {
    super("수정 요청의 첨부 이미지를 Codex 작업 공간으로 가져오지 못했습니다.", { cause });
    this.name = "RevisionImageMaterializationError";
  }
}

export async function materializeRevisionImages(operation: Operation, baseUrl: string, token: string) {
  const attachments = operation.revisionAttachments ?? [];
  if (attachments.length === 0) {
    const images: readonly RevisionPromptImage[] = [];
    return { images, cleanup: () => Promise.resolve() };
  }
  const directory = await mkdtemp(path.join(tmpdir(), "sol-revision-images-"));
  try {
    const images = await Promise.all(attachments.map(async (attachment, index) => {
      const response = await ky.get(`${baseUrl}/api/revision-attachments/${encodeURIComponent(attachment.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
        retry: { limit: 2 },
        timeout: 60_000,
      });
      const destination = path.join(directory, `${index + 1}-${attachment.id}.${extensionByContentType[attachment.contentType]}`);
      await writeFile(destination, new Uint8Array(await response.arrayBuffer()), { flag: "wx" });
      return { name: attachment.originalName, path: destination };
    }));
    return { images, cleanup: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw new RevisionImageMaterializationError(error);
  }
}
