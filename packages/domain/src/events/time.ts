// 시간 — 저장은 UTC, 표시는 KST(UTC+9, 서머타임 없음). 다른 시간대 변환은 어댑터가 한다(도메인은 표준 날짜 계산만).
import { weekday } from "../story/calendar";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const UTC_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?Z$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

const validDate = (y: number, m: number, d: number): boolean => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

export const isCalendarDateText = (value: string): boolean => {
  const m = DATE.exec(value);
  return m !== null && validDate(Number(m[1]), Number(m[2]), Number(m[3]));
};

export const isClockTimeText = (value: string): boolean => TIME.test(value);

/** `YYYY-MM-DDTHH:mm(:ss)Z` 를 `YYYY-MM-DDTHH:mm:00Z` 로 맞춘다. 잘못된 값은 null */
export function normalizeEventUtc(value: string): string | null {
  const m = UTC_ISO.exec(value);
  if (!m || !validDate(Number(m[1]), Number(m[2]), Number(m[3]))) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00Z`;
}

/** UTC 날짜·시각 조각 → UTC ISO (분 단위로 맞춘다) */
export function eventUtcIso(year: number, month: number, day: number, hour = 0, minute = 0): string {
  return new Date(Date.UTC(year, month - 1, day, hour, minute)).toISOString().replace(/:\d{2}\.\d{3}Z$/, ":00Z");
}

export interface KstParts {
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  time: string;
  /** 요일 한 글자 */
  weekday: string;
}

/** UTC ISO → KST 날짜·시각. 시각을 모르는 일정(timeKnown=false)은 `eventKstDisplay` 를 쓴다 */
export function eventKstParts(utc: string): KstParts {
  const norm = normalizeEventUtc(utc);
  if (!norm) throw new Error(`UTC ISO 형식이 아니다: ${utc}`);
  const iso = new Date(new Date(norm).getTime() + KST_OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16), weekday: weekday(iso) };
}

/** 화면 표시용 — 시각을 모르면 날짜 그대로(시간대 변환 없음), 알면 KST */
export function eventKstDisplay(utc: string, timeKnown: boolean): KstParts & { tz: string } {
  if (!timeKnown) {
    const date = utc.slice(0, 10);
    return { date, time: "—", weekday: weekday(date), tz: "" };
  }
  return { ...eventKstParts(utc), tz: "KST" };
}

/** 운영자가 KST 로 입력한 날짜(+시각) → UTC ISO. 시각이 없으면 날짜만 아는 일정(00:00Z) */
export function eventKstInputToUtc(date: string, time: string | null): { startsAt: string; timeKnown: boolean } | null {
  const d = DATE.exec(date);
  if (!d || !validDate(Number(d[1]), Number(d[2]), Number(d[3]))) return null;
  if (time === null || time === "") return { startsAt: `${date}T00:00:00Z`, timeKnown: false };
  const t = TIME.exec(time);
  if (!t) return null;
  const ms = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2])) - KST_OFFSET_MS;
  return { startsAt: new Date(ms).toISOString().replace(/:\d{2}\.\d{3}Z$/, ":00Z"), timeKnown: true };
}

/** 이 일정이 속한 KST 날짜 (시각을 모르면 적힌 날짜) */
export function eventDate(startsAt: string, timeKnown: boolean): string {
  return timeKnown ? eventKstParts(startsAt).date : startsAt.slice(0, 10);
}
