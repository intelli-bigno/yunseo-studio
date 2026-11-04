import { weekday } from "@yunseo/domain";

/** 2026-11-04T21:00 → 11.04 수 21:00 */
export function fmtSlot(iso: string): string {
  return `${iso.slice(5, 7)}.${iso.slice(8, 10)} ${weekday(iso)} ${iso.slice(11, 16)}`.trim();
}

export function fmtDay(iso: string): string {
  return `${iso.slice(5, 7)}.${iso.slice(8, 10)} ${weekday(iso)}`;
}

/** 2026-11-02 ~ 2026-11-08 → 11월 2일 — 8일 (달이 넘어가면 양쪽 달을 쓴다) */
export function fmtWeekRange(from: string, to: string): string {
  const m = (iso: string) => Number(iso.slice(5, 7));
  const d = (iso: string) => Number(iso.slice(8, 10));
  return m(from) === m(to) ? `${m(from)}월 ${d(from)}일 — ${d(to)}일` : `${m(from)}월 ${d(from)}일 — ${m(to)}월 ${d(to)}일`;
}
