import { weekday } from "./logic";

/** 2026-11-04T21:00 → 11.04 수 21:00 */
export function fmtSlot(iso: string): string {
  return `${iso.slice(5, 7)}.${iso.slice(8, 10)} ${weekday(iso)} ${iso.slice(11, 16)}`.trim();
}
export function fmtDay(iso: string): string {
  return `${iso.slice(5, 7)}.${iso.slice(8, 10)} ${weekday(iso)}`;
}
/** ISO 주차 */
export function isoWeek(iso: string): number {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
}
