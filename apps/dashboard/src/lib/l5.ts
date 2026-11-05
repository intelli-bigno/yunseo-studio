// 게시 계획(dry-run)·성과 화면의 표시 규칙 — 라벨과 숫자 모양. 값 계산은 도메인/유스케이스가 하고 여기는 글자로 바꾸기만 한다.
import { METRIC_DEFS, type EvidenceVerdict, type IssueSeverity, type MetricKey, type MetricPlatform, type PlanKind, type PlanParamValue, type QueueItem } from "@yunseo/domain";

export const PLATFORM_LABEL: Record<MetricPlatform, string> = { instagram: "Instagram", youtube: "YouTube" };

export const PLAN_KIND_LABEL: Record<PlanKind, string> = { ig_carousel: "Instagram 캐러셀", ig_image: "Instagram 이미지", ig_reel: "Instagram 릴스", yt_short: "YouTube Shorts" };

export const SEVERITY_LABEL: Record<IssueSeverity, string> = { block: "차단", warn: "경고" };

export const VERDICT_LABEL: Record<EvidenceVerdict, string> = { confirmed: "확인됨", changed: "바뀜", conflict: "문서끼리 다름", unverified: "근거 없음" };

export const CHANNEL_LABEL: Record<QueueItem["channel"], string> = { feed: "피드", reels: "릴스", story: "스토리" };

export const isChannel = (v: unknown): v is QueueItem["channel"] => v === "feed" || v === "reels" || v === "story";
export const isPlatform = (v: unknown): v is MetricPlatform => v === "instagram" || v === "youtube";

const nf = new Intl.NumberFormat("ko-KR");

/** 1200 → 1,200. 값이 없으면 — */
export const fmtNum = (v: number | undefined | null): string => (v === undefined || v === null ? "—" : Number.isInteger(v) ? nf.format(v) : nf.format(Math.round(v * 10) / 10));

/** 0.1234 → 12.3%. 분모가 없어 못 구하면 — */
export const fmtPct = (v: number | null | undefined): string => (v === null || v === undefined ? "—" : `${Math.round(v * 1000) / 10}%`);

/** 지표 값 한 칸 — 초는 m:ss, 나머지는 숫자 */
export function fmtMetric(key: MetricKey, v: number | undefined): string {
  if (v === undefined) return "—";
  if (METRIC_DEFS[key].unit === "seconds") return `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`;
  return fmtNum(v);
}

/** 요청 파라미터를 한 줄씩 — 긴 값은 줄여 보인다(전체는 title 로) */
export function fmtParams(params: Readonly<Record<string, PlanParamValue>>, max = 64): { key: string; value: string; full: string }[] {
  return Object.entries(params).map(([key, v]) => {
    const full = Array.isArray(v) ? v.join(", ") : String(v);
    const flat = full.replace(/\s*\n\s*/g, " ⏎ ");
    return { key, value: flat.length > max ? `${flat.slice(0, max - 1)}…` : flat, full };
  });
}

/** 2026-11-05T01:23:00.000Z → 11.05 */
export const fmtDate = (iso: string): string => `${iso.slice(5, 7)}.${iso.slice(8, 10)}`;
