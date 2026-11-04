// 날짜 계산 — 전부 UTC 자정 기준의 달력 날짜(YYYY-MM-DD). 시간대 변환은 표시 계층 몫이다.

export const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"] as const;

const at = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

export function addDays(iso: string, n: number): string {
  const d = at(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekday(iso: string): string {
  return WEEKDAY[at(iso).getUTCDay()] ?? "";
}

/** 그 날이 속한 주의 월요일 */
export function weekStartOf(iso: string): string {
  return addDays(iso, -((at(iso).getUTCDay() + 6) % 7));
}

export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** ISO 주차 */
export function isoWeek(iso: string): number {
  const d = at(iso);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
}
