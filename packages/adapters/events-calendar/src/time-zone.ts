// 시간대 변환 — 현지 시각(원천의 시간대) → UTC. 표준 Intl 만 쓴다(서머타임 포함, 외부 의존 없음).
import { eventUtcIso } from "@yunseo/domain";

/** 그 순간(UTC ms)의 시간대 오프셋(분). 동쪽이 +. 모르는 시간대면 null */
function offsetMinutes(utcMs: number, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs));
    const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
    return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
  } catch {
    return null;
  }
}

/** 현지 달력 시각 → UTC ISO. 서머타임 전환 경계에서도 두 번 보정해 안정적으로 맞춘다. 모르는 시간대면 null */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): string | null {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const first = offsetMinutes(naive, timeZone);
  if (first === null) return null;
  const guess = naive - first * 60000;
  const second = offsetMinutes(guess, timeZone) ?? first;
  const utc = new Date(naive - second * 60000);
  return eventUtcIso(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate(), utc.getUTCHours(), utc.getUTCMinutes());
}
