// ICS 로 일정을 내려주는 공식 원천 — BLS 발표 일정, BEA 발표 일정.
//  · BLS: https://www.bls.gov/schedule/news_release/bls.ics (text/calendar, LF, TZID=US-Eastern, UID 고정, 2025-01 ~ 2026-12 313건 — 2026-11-05 실측)
//  · BEA: https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics (CRLF·줄 접기, UTC `Z`, SEQUENCE 로 개정 표시, 169건 — 2026-11-05 실측)
import type { CalendarEvent } from "@yunseo/domain";
import type { EventSource, EventSourceBatch } from "@yunseo/application";
import { getFile, DEFAULT_USER_AGENT, type FetchLike } from "./http";
import { parseIcs, type IcsEvent } from "./ics";
import { classifyBea, classifyBls, type Classified } from "./kinds";

export const BLS_ICS_URL = "https://www.bls.gov/schedule/news_release/bls.ics";
export const BLS_SCHEDULE_PAGE = "https://www.bls.gov/schedule/news_release/";
export const BEA_ICS_URL = "https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics";
export const BEA_SCHEDULE_PAGE = "https://www.bea.gov/news/schedule";

interface IcsSourceSpec {
  id: string;
  name: string;
  officialUrl: string;
  fileUrl: string;
  classify: (title: string) => Classified;
}

export interface IcsSourceOptions {
  fetch: FetchLike;
  userAgent?: string;
  url?: string;
}

function toEvent(spec: IcsSourceSpec, e: IcsEvent): CalendarEvent | null {
  if (!e.summary) return null;
  const { kind, label } = spec.classify(e.summary);
  return { source: spec.id, externalId: e.uid, kind, title: e.summary, label, startsAt: e.startsAt, timeKnown: e.timeKnown, sourceName: spec.name, sourceUrl: spec.officialUrl };
}

function createIcsSource(spec: IcsSourceSpec, options: IcsSourceOptions): EventSource {
  return {
    id: spec.id,
    name: spec.name,
    officialUrl: spec.officialUrl,
    async pull(window): Promise<EventSourceBatch> {
      const text = await getFile(options.url ?? spec.fileUrl, "text/calendar", { fetch: options.fetch, userAgent: options.userAgent ?? DEFAULT_USER_AGENT });
      if (!text.includes("BEGIN:VCALENDAR")) throw new Error(`${spec.name}: ICS 가 아니다 (BEGIN:VCALENDAR 없음)`);
      const parsed = parseIcs(text);
      const events = parsed.events.flatMap((e) => toEvent(spec, e) ?? []);
      if (events.length === 0) throw new Error(`${spec.name}: ICS 에서 읽은 일정이 0건이다 (형식 변경 의심)`);
      return { source: spec.id, events: events.filter((e) => e.startsAt >= window.from && e.startsAt <= window.to), complete: true, window, warnings: parsed.warnings };
    },
  };
}

export const createBlsIcsSource = (options: IcsSourceOptions): EventSource =>
  createIcsSource({ id: "bls-ics", name: "미 노동통계국(BLS) 발표 일정", officialUrl: BLS_SCHEDULE_PAGE, fileUrl: BLS_ICS_URL, classify: classifyBls }, options);

export const createBeaIcsSource = (options: IcsSourceOptions): EventSource =>
  createIcsSource({ id: "bea-ics", name: "미 경제분석국(BEA) 발표 일정", officialUrl: BEA_SCHEDULE_PAGE, fileUrl: BEA_ICS_URL, classify: classifyBea }, options);
