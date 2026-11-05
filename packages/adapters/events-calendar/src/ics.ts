// 최소 iCalendar(ICS) 읽기 — 공식 기관이 내려주는 VEVENT 의 DTSTART·SUMMARY·UID 등만 쓴다.
// 줄 접기(RFC 5545 §3.1: 다음 줄이 공백·탭으로 시작하면 앞 줄의 이어짐)와 LF/CRLF 를 모두 받는다.
import { eventUtcIso } from "@yunseo/domain";
import { zonedToUtc } from "./time-zone";

export interface IcsEvent {
  uid: string;
  summary: string;
  /** UTC ISO (`YYYY-MM-DDTHH:mm:00Z`). 날짜만 있으면 그 날 00:00Z */
  startsAt: string;
  timeKnown: boolean;
  categories: string[];
  location: string;
  sequence: number;
}

export interface IcsParse {
  events: IcsEvent[];
  /** 읽다가 건너뛴 항목 설명 */
  warnings: string[];
}

/** ICS 가 쓰는 비표준 시간대 이름 → IANA. BLS 는 `US-Eastern` 을 쓴다 */
const TZ_ALIAS: Record<string, string> = {
  "US-Eastern": "America/New_York",
  "US-Central": "America/Chicago",
  "US-Mountain": "America/Denver",
  "US-Pacific": "America/Los_Angeles",
};

function unfold(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) out[out.length - 1] += line.slice(1);
    else out.push(line);
  }
  return out;
}

function unescapeText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_m, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

function parseLine(line: string): Prop | null {
  const colon = line.indexOf(":");
  if (colon <= 0) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: (name ?? "").toUpperCase(), params, value: line.slice(colon + 1) };
}

function parseStart(prop: Prop): { startsAt: string; timeKnown: boolean } | null {
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(prop.value);
  if (date) return { startsAt: `${date[1]}-${date[2]}-${date[3]}T00:00:00Z`, timeKnown: false };
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z?)$/.exec(prop.value);
  if (!dt) return null;
  const [y, mo, d, h, mi] = [Number(dt[1]), Number(dt[2]), Number(dt[3]), Number(dt[4]), Number(dt[5])];
  if (dt[7] === "Z") return { startsAt: eventUtcIso(y, mo, d, h, mi), timeKnown: true };
  const tzid = prop.params["TZID"];
  if (!tzid) return null; // 시간대 없는 떠다니는 시각은 어느 시각인지 알 수 없다
  const zone = TZ_ALIAS[tzid] ?? tzid;
  const utc = zonedToUtc(y, mo, d, h, mi, zone);
  return utc ? { startsAt: utc, timeKnown: true } : null;
}

/** VEVENT 를 모아 돌려준다. 시작 시각을 못 읽는 항목은 건너뛰고 warnings 에 남긴다 */
export function parseIcs(text: string): IcsParse {
  const events: IcsEvent[] = [];
  const warnings: string[] = [];
  let current: Prop[] | null = null;

  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      current = [];
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) {
        const get = (name: string) => current?.find((p) => p.name === name);
        const uid = get("UID")?.value ?? "";
        const start = get("DTSTART");
        const when = start ? parseStart(start) : null;
        if (!uid || !when) warnings.push(`VEVENT 건너뜀 (uid=${uid || "없음"}, DTSTART=${start ? start.value : "없음"})`);
        else {
          events.push({
            uid,
            summary: unescapeText(get("SUMMARY")?.value ?? "").trim(),
            ...when,
            categories: (get("CATEGORIES")?.value ?? "").split(",").map((c) => c.trim()).filter(Boolean),
            location: unescapeText(get("LOCATION")?.value ?? "").trim(),
            sequence: Number(get("SEQUENCE")?.value ?? 0) || 0,
          });
        }
      }
      current = null;
      continue;
    }
    if (current) {
      const prop = parseLine(line);
      if (prop) current.push(prop);
    }
  }
  return { events, warnings };
}
