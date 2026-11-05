// 연준 달력 JSON — https://www.federalreserve.gov/json/calendar.json (2026-11-05 Aside 로 확인: 공식 일정 페이지가 쓰는 공개 파일).
// 모양: { events: [{ title, time: "2:00 p.m."(미 동부), month: "YYYY-MM", days: "9" | "1, 2, 3", type, description(HTML 이스케이프), link? }], announcement: [...] }
// 문서화된 API 가 아니라 달력 페이지가 읽는 파일이다 — 모양이 바뀌면 파싱이 0건이 되어 수집이 실패로 끝난다(빈 응답은 반영하지 않는다).
import type { CalendarEvent } from "@yunseo/domain";
import type { EventSource, EventSourceBatch } from "@yunseo/application";
import { getFile, DEFAULT_USER_AGENT, type FetchLike } from "./http";
import { classifyFed } from "./kinds";
import { zonedToUtc } from "./time-zone";

export const FED_CALENDAR_URL = "https://www.federalreserve.gov/json/calendar.json";
export const FED_CALENDAR_PAGE = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";
const SOURCE_NAME = "미 연준(Federal Reserve) 달력";
const DEFAULT_TYPES = ["FOMC", "Beige", "Testimony"] as const;

interface FedRow {
  title?: unknown;
  time?: unknown;
  month?: unknown;
  days?: unknown;
  type?: unknown;
  description?: unknown;
  link?: unknown;
}

const ENTITIES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#39;": "'", "&#10;": " ", "&nbsp;": " " };

/** 이스케이프된 HTML 설명 → 평문 한 줄 */
export function fedDescriptionText(raw: string): string {
  const once = raw.replace(/&(?:lt|gt|amp|quot|nbsp|#39|#10);/g, (m) => ENTITIES[m] ?? m);
  return once.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** "2:00 p.m." → [14, 0]. 시각이 없거나 모르는 형식이면 null */
export function parseFedTime(text: string): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})\s*([ap])\.?m\.?$/i.exec(text.trim());
  if (!m) return null;
  const hour12 = Number(m[1]);
  if (hour12 < 1 || hour12 > 12) return null;
  return [(hour12 % 12) + (m[3]!.toLowerCase() === "p" ? 12 : 0), Number(m[2])];
}

export interface FedParse {
  events: CalendarEvent[];
  warnings: string[];
}

export function parseFedCalendar(text: string, types: readonly string[] = DEFAULT_TYPES): FedParse {
  const warnings: string[] = [];
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("연준 달력 JSON 을 읽을 수 없다 (형식 변경 의심)");
  }
  const rows = (json as { events?: unknown }).events;
  if (!Array.isArray(rows)) throw new Error("연준 달력에 events 배열이 없다 (형식 변경 의심)");

  const seen = new Map<string, number>();
  const events: CalendarEvent[] = [];
  for (const row of rows as FedRow[]) {
    const type = typeof row.type === "string" ? row.type : "";
    if (!types.includes(type)) continue;
    const title = typeof row.title === "string" ? row.title : "";
    const month = typeof row.month === "string" ? row.month : "";
    const days = (typeof row.days === "string" ? row.days : "").split(",").map((d) => d.trim()).filter(Boolean);
    const classified = classifyFed(type, title);
    const ym = /^(\d{4})-(\d{2})$/.exec(month);
    if (!ym || days.length === 0) {
      warnings.push(`연준 항목 건너뜀 (type=${type}, title=${title.trim()}, month=${month || "없음"})`);
      continue;
    }
    const time = typeof row.time === "string" ? parseFedTime(row.time) : null;
    const description = typeof row.description === "string" ? fedDescriptionText(row.description) : "";
    for (const day of days) {
      const d = Number(day);
      const y = Number(ym[1]);
      const mo = Number(ym[2]);
      if (!Number.isInteger(d) || d < 1 || d > 31) {
        warnings.push(`연준 항목 건너뜀 (잘못된 날짜 ${day}, ${title.trim()})`);
        continue;
      }
      const base = `${type}|${title.trim()}|${month}${days.length > 1 ? `|${d}` : ""}`;
      const ordinal = (seen.get(base) ?? 0) + 1; // 같은 키가 겹치면 순번을 붙여 서로 다른 일정으로 둔다
      seen.set(base, ordinal);
      const startsAt = time ? zonedToUtc(y, mo, d, time[0], time[1], "America/New_York") : `${ym[1]}-${ym[2]}-${String(d).padStart(2, "0")}T00:00:00Z`;
      if (!startsAt) {
        warnings.push(`연준 항목 건너뜀 (시각 변환 실패 ${title.trim()})`);
        continue;
      }
      const link = typeof row.link === "string" && /^https?:\/\//.test(row.link) ? row.link : "";
      events.push({
        source: "fed-calendar",
        externalId: ordinal > 1 ? `${base}#${ordinal}` : base,
        kind: classified.kind,
        title: title.trim(),
        label: classified.label,
        startsAt,
        timeKnown: time !== null,
        sourceName: SOURCE_NAME,
        sourceUrl: type === "FOMC" ? FED_CALENDAR_PAGE : link || FED_CALENDAR_PAGE,
        ...(description ? { note: description } : {}),
      });
    }
  }
  return { events, warnings };
}

export interface FedSourceOptions {
  fetch: FetchLike;
  userAgent?: string;
  url?: string;
  types?: readonly string[];
}

export function createFedCalendarSource(options: FedSourceOptions): EventSource {
  return {
    id: "fed-calendar",
    name: SOURCE_NAME,
    officialUrl: FED_CALENDAR_PAGE,
    async pull(window): Promise<EventSourceBatch> {
      const text = await getFile(options.url ?? FED_CALENDAR_URL, "application/json", { fetch: options.fetch, userAgent: options.userAgent ?? DEFAULT_USER_AGENT });
      const parsed = parseFedCalendar(text, options.types);
      if (parsed.events.length === 0) throw new Error("연준 달력에서 가져올 일정이 0건이다 (형식 변경 의심)");
      return { source: "fed-calendar", events: parsed.events.filter((e) => e.startsAt >= window.from && e.startsAt <= window.to), complete: true, window, warnings: parsed.warnings };
    },
  };
}
