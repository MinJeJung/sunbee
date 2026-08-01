import { z } from "zod";

export const MAX_REVISION_IMAGES = 5;
export const MAX_REVISION_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_REVISION_TOTAL_BYTES = 15 * 1024 * 1024;

const acceptedImageTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const acceptedImageTypeSet = new Set<string>(acceptedImageTypes);
const acceptedImageTypeSchema = z.enum(acceptedImageTypes);
export type RevisionImageContentType = z.infer<typeof acceptedImageTypeSchema>;

const revisionImageSchema = z.custom<File>((value) => value instanceof File)
  .refine((file) => acceptedImageTypeSet.has(file.type), "JPG, PNG, WebP 이미지만 첨부할 수 있습니다.")
  .refine((file) => file.size <= MAX_REVISION_IMAGE_BYTES, "이미지 한 장은 5MB 이하여야 합니다.");

const revisionImagesSchema = z.array(revisionImageSchema)
  .max(MAX_REVISION_IMAGES, "이미지는 최대 5장까지 첨부할 수 있습니다.")
  .refine(
    (files) => files.reduce((total, file) => total + file.size, 0) <= MAX_REVISION_TOTAL_BYTES,
    "첨부 이미지 전체 용량은 15MB 이하여야 합니다.",
  );

export type RevisionPromptImage = {
  readonly name: string;
  readonly path: string;
};

export type RevisionActionState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "sent"; readonly message: string };

export const initialRevisionActionState: RevisionActionState = { status: "idle" };

export class RevisionFeedbackError extends Error {
  readonly code = "INVALID_REVISION_FEEDBACK";

  constructor(message: string) {
    super(message);
    this.name = "RevisionFeedbackError";
  }
}

export function parseRevisionImageFiles(files: readonly File[]): readonly File[] {
  const parsed = revisionImagesSchema.safeParse(files);
  if (parsed.success) return parsed.data;
  const firstIssue = parsed.error.issues[0];
  throw new RevisionFeedbackError(firstIssue?.message ?? "첨부 이미지를 확인할 수 없습니다.");
}

export function parseRevisionImageContentType(value: string) {
  return acceptedImageTypeSchema.parse(value);
}

export async function validateRevisionImageSignature(file: File) {
  const contentType = acceptedImageTypeSchema.parse(file.type);
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  let valid = false;
  switch (contentType) {
    case "image/jpeg":
      valid = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      break;
    case "image/png":
      valid = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
        && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
      break;
    case "image/webp":
      valid = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
      break;
  }
  if (!valid) throw new RevisionFeedbackError("이미지 파일이 손상되었거나 형식이 일치하지 않습니다.");
}

export function buildRevisionPromptContext(notes: string, images: readonly RevisionPromptImage[]) {
  if (images.length === 0) return `수정 요청:\n${notes}\n\n첨부 이미지: 없음`;
  const imageList = images.map((image, index) => `${index + 1}. ${image.path} (원본 파일명: ${image.name})`).join("\n");
  return `수정 요청:\n${notes}\n\n첨부 이미지:\n${imageList}\n\n모든 첨부 이미지를 직접 열어 확인하고, 이미지에 표시된 위치·문구·레이아웃을 텍스트 수정 요청과 함께 반영하라. 이미지를 확인하지 않은 채 추측으로 수정하지 말라.`;
}
