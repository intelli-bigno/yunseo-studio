// 일정 유스케이스 — 대시보드(편성·수집 현황·수동 입력)가 부르는 입구. 포트만 안다(04 규칙 2).
// 판정은 사람이 누른다: 자동은 점검표·제안만, 올릴 때는 사유가 필요하다(02 §3.2).
import {
  CALENDAR_EVENT_KINDS,
  MANUAL_EVENT_SOURCE,
  MANUAL_SOURCE_HINTS,
  addDays,
  eventDecisionIssues,
  effectiveEventImportance,
  eventIssues,
  isCalendarDateText,
  isEventSourceUrl,
  eventKstDisplay,
  eventKstInputToUtc,
  suggestEventImportance,
  type CalendarEvent,
  type CalendarEventKind,
  type EventChange,
  type EventDecision,
  type EventImportance,
  type ManualSourceHint,
  type StoredEvent,
} from "@yunseo/domain";
import type { Clock } from "../ports";
import type { EventFeed, EventFetchRun } from "./ports";

export interface EventSourceInfo {
  id: string;
  name: string;
  officialUrl: string;
}

export interface EventUseCaseDeps {
  feed: EventFeed;
  clock: Clock;
  /** 등록된 공식 원천 (수집 현황에 표시) */
  sources: readonly EventSourceInfo[];
  /** UTC ISO */
  now: () => string;
  /** 수동 입력 일정의 외부 id 를 만든다 (테스트에서는 고정값) */
  newId: () => string;
}

export interface EventRow {
  event: StoredEvent;
  /** 화면 표시용 KST */
  when: { date: string; time: string; weekday: string; tz: string };
  suggested: EventImportance;
  /** 사람이 누른 판정 (없으면 null) */
  human: EventDecision | null;
  effective: EventImportance;
}

export interface EventSourceStatus extends EventSourceInfo {
  lastRun: EventFetchRun | null;
  /** 이 원천에서 받아 둔(사라지지 않은) 일정 수 */
  stored: number;
}

export interface EventChangeRow {
  change: EventChange;
  label: string;
  /** KST 로 본 이전·이후 (일시 변경만) */
  from: string | null;
  to: string | null;
}

export interface EventsOverview {
  today: string;
  sources: EventSourceStatus[];
  /** 오늘부터 30일 안의 일정 전부(수집 + 수동). 노이즈 포함 — 후보함이 아니라 전체 목록이다 */
  upcoming: EventRow[];
  manual: EventRow[];
  changes: EventChangeRow[];
  hints: readonly ManualSourceHint[];
  kinds: readonly CalendarEventKind[];
}

export type EventActionResult = { ok: true } | { ok: false; errors: string[] };

export interface DecideEventInput {
  eventId: string;
  decision: EventImportance;
  reason: string;
}

export interface ManualEventInput {
  title: string;
  /** KST 날짜 YYYY-MM-DD */
  date: string;
  /** KST 시각 HH:mm, 모르면 빈 문자열 */
  time: string;
  kind: string;
  sourceUrl: string;
  note: string;
}

const fail = (...errors: string[]): EventActionResult => ({ ok: false, errors });

export function createEventUseCases({ feed, clock, sources, now, newId }: EventUseCaseDeps) {
  const rows = async (events: readonly StoredEvent[]): Promise<EventRow[]> => {
    const decided = new Map((await feed.decisions()).map((d) => [d.eventId, d]));
    return events.map((event) => {
      const suggested = suggestEventImportance(event);
      const human = decided.get(event.id) ?? null;
      return { event, when: eventKstDisplay(event.startsAt, event.timeKnown), suggested, human, effective: effectiveEventImportance(suggested, human) };
    });
  };

  const fmt = (utc: string | null, known: boolean) => (utc ? `${eventKstDisplay(utc, known).date.slice(5).replace("-", ".")} ${eventKstDisplay(utc, known).time}`.trim() : null);

  return {
    /** 수집 현황·전체 일정·수동 입력·변경 이력 */
    async getEventsOverview(): Promise<EventsOverview> {
      const today = clock.today();
      const [all, runs, changes] = await Promise.all([feed.list({ includeRemoved: false }), feed.lastRuns(), feed.changes(20)]);
      const byId = new Map(all.map((e) => [e.id, e]));
      const upcoming = all.filter((e) => e.startsAt >= `${addDays(today, -1)}T00:00:00Z` && e.startsAt <= `${addDays(today, 30)}T23:59:00Z`);
      const lastRun = new Map(runs.map((r) => [r.source, r]));
      return {
        today,
        sources: sources.map((s) => ({ ...s, lastRun: lastRun.get(s.id) ?? null, stored: all.filter((e) => e.source === s.id).length })),
        upcoming: await rows(upcoming),
        manual: await rows(all.filter((e) => e.source === MANUAL_EVENT_SOURCE)),
        changes: changes.map((change) => {
          const e = byId.get(change.eventId);
          const known = e?.timeKnown ?? true;
          return { change, label: e?.label ?? change.eventId, from: change.type === "time_changed" ? fmt(change.from, known) : null, to: change.type === "time_changed" ? fmt(change.to, known) : null };
        }),
        hints: MANUAL_SOURCE_HINTS,
        kinds: CALENDAR_EVENT_KINDS,
      };
    },

    /** 사람의 판정 — 확정·제외·승격. 올릴 때는 사유가 필수 */
    async decideEvent(input: DecideEventInput): Promise<EventActionResult> {
      const event = await feed.get(input.eventId);
      if (!event) return fail("일정을 찾을 수 없다");
      const issues = eventDecisionIssues({ suggested: suggestEventImportance(event), decision: input.decision, reason: input.reason });
      if (issues.length > 0) return fail(...issues);
      await feed.decide({ eventId: event.id, decision: input.decision, reason: input.reason.trim(), decidedAt: now() });
      return { ok: true };
    },

    /** 사람의 판정을 지우고 자동 제안으로 되돌린다 */
    async clearDecision(eventId: string): Promise<EventActionResult> {
      await feed.clearDecision(eventId);
      return { ok: true };
    },

    /** 수동 입력 — 기계 판독 원천이 없는 일정(선거·타 중앙은행 등). 확인 출처 URL 필수 */
    async addManualEvent(input: ManualEventInput): Promise<EventActionResult> {
      const errors: string[] = [];
      const title = input.title.trim();
      if (title === "") errors.push("제목을 입력한다");
      if (!isCalendarDateText(input.date)) errors.push("날짜는 YYYY-MM-DD 형식이어야 한다");
      const when = isCalendarDateText(input.date) ? eventKstInputToUtc(input.date, input.time.trim() === "" ? null : input.time.trim()) : null;
      if (isCalendarDateText(input.date) && !when) errors.push("시각은 HH:mm 형식이어야 한다 (모르면 비운다)");
      if (!(CALENDAR_EVENT_KINDS as readonly string[]).includes(input.kind)) errors.push("종류를 고른다");
      if (!isEventSourceUrl(input.sourceUrl.trim())) errors.push("확인 출처 URL(공식 페이지 http·https 주소)을 입력한다");
      if (errors.length > 0 || !when) return fail(...errors);

      const stamp = now();
      const event: CalendarEvent = {
        source: MANUAL_EVENT_SOURCE,
        externalId: newId(),
        kind: input.kind as CalendarEventKind,
        title,
        label: title,
        startsAt: when.startsAt,
        timeKnown: when.timeKnown,
        sourceName: "수동 입력",
        sourceUrl: input.sourceUrl.trim(),
        ...(input.note.trim() !== "" ? { note: input.note.trim() } : {}),
      };
      const invalid = eventIssues(event);
      if (invalid.length > 0) return fail(...invalid);
      const existing = await feed.list({ source: MANUAL_EVENT_SOURCE });
      if (existing.some((e) => e.title === event.title && e.startsAt === event.startsAt)) return fail("같은 제목·일시의 수동 일정이 이미 있다");
      await feed.upsert({ source: MANUAL_EVENT_SOURCE, events: [event], complete: false, window: { from: event.startsAt, to: event.startsAt }, warnings: [] }, stamp);
      return { ok: true };
    },

    /** 수동 입력 일정 삭제 (수집한 일정은 지우지 않고 「제외」로 숨긴다) */
    async removeManualEvent(id: string): Promise<EventActionResult> {
      return (await feed.removeManual(id)) ? { ok: true } : fail("지울 수 있는 수동 일정이 아니다");
    },
  };
}

export type EventUseCases = ReturnType<typeof createEventUseCases>;
