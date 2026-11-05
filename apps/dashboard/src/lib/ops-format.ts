// [L6] 운영 화면 표시 도우미 — 순수 함수. 시각은 운영 시간대 KST(+09:00 고정)로 보인다.
import type { OpsRunStatus } from "@yunseo/application";

const KST_MS = 9 * 3_600_000;

/** ISO → "11.05 03:30" (KST). 값이 없으면 "—" */
export function fmtKst(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const k = new Date(t + KST_MS).toISOString();
  return `${k.slice(5, 7)}.${k.slice(8, 10)} ${k.slice(11, 16)}`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** from 이 now 보다 얼마나 앞인가(미래면 "후") */
export function fmtRelative(iso: string | null | undefined, now: string): string {
  if (!iso) return "—";
  const diff = Date.parse(now) - Date.parse(iso);
  if (Number.isNaN(diff)) return "—";
  const m = Math.round(Math.abs(diff) / 60_000);
  const word = m < 1 ? "1분 안" : m < 60 ? `${m}분` : m < 48 * 60 ? `${Math.floor(m / 60)}시간` : `${Math.floor(m / 1440)}일`;
  if (m < 1) return "방금";
  return diff >= 0 ? `${word} 전` : `${word} 후`;
}

export const RUN_LABEL: Record<OpsRunStatus, string> = { ok: "성공", failed: "실패", running: "실행 중" };
export const runTone = (s: OpsRunStatus): "accent" | "alert" | "neutral" => (s === "ok" ? "accent" : s === "failed" ? "alert" : "neutral");

/** 마지막 백업 경과 — 26시간을 넘기면 경고(하루 한 번 03:30 + 여유 2시간) */
export const backupStale = (hours: number | null) => hours === null || hours > 26;
