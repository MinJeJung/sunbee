export const REWORK_STAGES = ["todo", "fixing", "approved", "resubmitted"] as const;
export type ReworkStage = (typeof REWORK_STAGES)[number];
export const REWORK_STAGE_LABELS: Record<ReworkStage, string> = { todo: "대기", fixing: "수정 중", approved: "검수 승인", resubmitted: "재제출함" };

export const REWORK_PLATFORMS = ["millie", "kyobo", "yes24", "ridi", "aladin"] as const;
export type ReworkPlatform = (typeof REWORK_PLATFORMS)[number];

export interface ReworkItem {
  id: string;
  title: string;
  slug: string;
  format: string;
  statusRaw: string;
  reason: string;
  guidance: string;
  stage: ReworkStage;
  autoDetected?: boolean | undefined;
  isbn?: string | undefined;
  hasCover?: boolean | undefined;
  epubFile?: string | undefined;
  runStatus?: "running" | "failed" | undefined;
  runNote?: string | undefined;
}

export interface ReworkBoardSummary {
  platform: ReworkPlatform;
  label: string;
  note: string;
  total: number;
  stageCounts: Record<ReworkStage, number>;
}
