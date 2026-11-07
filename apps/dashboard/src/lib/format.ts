import { weekday } from "@yunseo/domain";

/** 2026-11-04T21:00 → 11.04 수 21:00 */
export function fmtSlot(iso: string): string {
  return `${iso.slice(5, 7)}.${iso.slice(8, 10)} ${weekday(iso)} ${iso.slice(11, 16)}`.trim();
}

export function fmtDay(iso: string): string {
  return `${iso.slice(5, 7)}.${iso.slice(8, 10)} ${weekday(iso)}`;
}
