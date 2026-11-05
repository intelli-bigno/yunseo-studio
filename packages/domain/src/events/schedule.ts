// 편성 화면용 변환 — 수집한 일정 + 사람의 판정 → 사건 후보함(EventCandidate)·이번 주의 변수(WeekVariable).
import { addDays, weekDates, weekStartOf } from "../story/calendar";
import type { EventCandidate, WeekVariable } from "../story/model";
import { effectiveEventImportance, judgeEventImportance, suggestImportanceAnswers, type EventDecision, type EventImportance } from "./importance";
import { MANUAL_EVENT_SOURCE, type EventChange, type StoredEvent } from "./model";
import { eventDate, eventKstDisplay, eventKstParts } from "./time";

export interface EventScheduleInput {
  events: readonly StoredEvent[];
  decisions: ReadonlyMap<string, EventDecision>;
  /** 일정별 가장 최근 일시 변경 이력 */
  timeChanges: ReadonlyMap<string, EventChange>;
  today: string;
}

const byTime = (a: StoredEvent, b: StoredEvent) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id);

export function suggestEventImportance(e: StoredEvent): EventImportance {
  return judgeEventImportance(suggestImportanceAnswers(e.kind));
}

/** 같은 이름·같은 시각이 여러 원천에 있으면 공식 원천을 남기고 수동 입력은 접는다(표시용) */
export function dedupeEventsForDisplay(events: readonly StoredEvent[]): StoredEvent[] {
  const key = (e: StoredEvent) => `${e.label.trim().toLowerCase()}|${e.startsAt}`;
  const kept = new Map<string, StoredEvent>();
  for (const e of events) {
    const prev = kept.get(key(e));
    if (!prev || (prev.source === MANUAL_EVENT_SOURCE && e.source !== MANUAL_EVENT_SOURCE)) kept.set(key(e), e);
  }
  return [...kept.values()];
}

const alive = (e: StoredEvent) => e.removedAt === null;

/** 변경된 일정이면 meta 에 붙는 한 줄 — 「11.12 → 11.13」 */
function changeNote(change: EventChange | undefined): string {
  if (!change || change.type !== "time_changed" || !change.from || !change.to) return "";
  const fmt = (utc: string) => {
    const p = eventKstParts(utc);
    return `${p.date.slice(5).replace("-", ".")} ${p.time}`;
  };
  return ` · 일시 변경 ${fmt(change.from)} → ${fmt(change.to)}`;
}

/** 이번 주(월~일, KST 날짜)의 major·watch — 날짜순. 사람이 skip 으로 제외한 일정은 빠진다 */
export function selectEventWeekVariables(input: EventScheduleInput): WeekVariable[] {
  const dates = new Set(weekDates(weekStartOf(input.today)));
  const out: WeekVariable[] = [];
  for (const e of dedupeEventsForDisplay(input.events.filter(alive)).sort(byTime)) {
    if (!dates.has(eventDate(e.startsAt, e.timeKnown))) continue;
    const importance = effectiveEventImportance(suggestEventImportance(e), input.decisions.get(e.id) ?? null);
    if (importance === "skip") continue;
    const when = eventKstDisplay(e.startsAt, e.timeKnown);
    out.push({ date: when.date, time: when.time, tz: when.tz, label: e.label, mark: "fact", source: `${e.sourceName}${changeNote(input.timeChanges.get(e.id))}`, importance });
  }
  return out;
}

/**
 * 사건 후보함 — 오늘부터 horizonDays 안의 일정. 자동 제안이 skip 이어도 사람이 판정했거나 수동 입력이면 보인다.
 * decision 은 사람이 누른 값(없으면 null) — 화면은 null 이면 버튼을 보여 준다.
 */
export function selectEventCandidates(input: EventScheduleInput, horizonDays = 21): EventCandidate[] {
  const to = addDays(input.today, horizonDays);
  const out: EventCandidate[] = [];
  for (const e of dedupeEventsForDisplay(input.events.filter(alive)).sort(byTime)) {
    const date = eventDate(e.startsAt, e.timeKnown);
    if (date < input.today || date > to) continue;
    const human = input.decisions.get(e.id) ?? null;
    if (suggestEventImportance(e) === "skip" && !human && e.source !== MANUAL_EVENT_SOURCE) continue;
    out.push({ id: e.id, date, label: e.label, questions: suggestImportanceAnswers(e.kind), decision: human ? human.decision : null });
  }
  return out;
}
