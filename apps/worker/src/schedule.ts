// 일정 계산 — 순수 함수. 시간대는 IANA 이름이 아니라 고정 오프셋(분)으로 받는다:
// 운영 시간대는 KST(+09:00)이고 한국은 일광 절약 시간이 없다 → 실행 환경의 ICU 시간대 데이터에 기대지 않는다.

export const KST_OFFSET_MIN = 9 * 60;

export type Schedule =
  /** 매일 같은 벽시계 시각 */
  | { kind: "daily"; at: string; utcOffsetMin: number }
  /** N 분마다(에포크 기준 정렬 — 재시작해도 같은 격자) */
  | { kind: "every"; minutes: number };

const DAY_MS = 86_400_000;

export function daily(at: string, utcOffsetMin = KST_OFFSET_MIN): Schedule {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) throw new Error(`시각은 HH:MM 이어야 한다: ${at}`);
  return { kind: "daily", at, utcOffsetMin };
}

export function every(minutes: number): Schedule {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 24 * 60) throw new Error(`분 간격은 1~1440 정수여야 한다: ${minutes}`);
  return { kind: "every", minutes };
}

/** 그날(벽시계 기준) 예정 시각의 UTC epoch ms */
function dailySlot(s: Extract<Schedule, { kind: "daily" }>, wallDayStartMs: number): number {
  const [h, m] = s.at.split(":").map(Number) as [number, number];
  return wallDayStartMs + (h * 60 + m) * 60_000 - s.utcOffsetMin * 60_000;
}

/** after 보다 **뒤**인 첫 실행 시각 */
export function nextRun(s: Schedule, after: Date): Date {
  const t = after.getTime();
  if (s.kind === "every") {
    const step = s.minutes * 60_000;
    return new Date(Math.floor(t / step) * step + step);
  }
  const wall = t + s.utcOffsetMin * 60_000;
  const dayStart = Math.floor(wall / DAY_MS) * DAY_MS;
  const today = dailySlot(s, dayStart);
  return new Date(today > t ? today : dailySlot(s, dayStart + DAY_MS));
}

/** atOrBefore 이하인 마지막 예정 시각 — 놓친 실행(꺼져 있던 동안)을 찾을 때 쓴다 */
export function previousRun(s: Schedule, atOrBefore: Date): Date {
  const t = atOrBefore.getTime();
  if (s.kind === "every") {
    const step = s.minutes * 60_000;
    return new Date(Math.floor(t / step) * step);
  }
  const wall = t + s.utcOffsetMin * 60_000;
  const dayStart = Math.floor(wall / DAY_MS) * DAY_MS;
  const today = dailySlot(s, dayStart);
  return new Date(today <= t ? today : dailySlot(s, dayStart - DAY_MS));
}

export function describeSchedule(s: Schedule): string {
  if (s.kind === "every") return s.minutes % 60 === 0 ? `${s.minutes / 60}시간마다` : `${s.minutes}분마다`;
  const tz = s.utcOffsetMin === KST_OFFSET_MIN ? "KST" : `UTC${s.utcOffsetMin >= 0 ? "+" : "-"}${Math.abs(s.utcOffsetMin / 60)}`;
  return `매일 ${s.at} ${tz}`;
}
