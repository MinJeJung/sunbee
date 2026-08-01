import type { PlatformStatus } from "@/components/types";
import { platformDisplayStatus, type PlatformDisplayStatus, type PlatformKey } from "@/lib/catalog-schema";

export function StatusPill({ platform, status, compact = false }: { platform: PlatformKey; status: PlatformStatus; compact?: boolean }) {
  const label = platformDisplayStatus(platform, status);
  const tone: Record<PlatformDisplayStatus, string> = { "미등록": "missing", "등록됨": "registered", "판매중": "selling", "심사중": "review", "보완": "review", "반려": "rejected", "중지": "rejected", "확인필요": "check" };
  const detail = label === "등록됨" ? "등록 완료·판매 여부 미확인" : label === "반려" ? "플랫폼 검수 반려 — 보완 재제출 필요" : `플랫폼 원문 상태: ${status}`;
  return <span aria-label={`${label}. ${detail}`} className={`status status-${tone[label]} ${compact ? "status-compact" : ""}`} title={detail}>{label}</span>;
}
