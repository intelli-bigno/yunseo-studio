// 수집 결과 병합 계획 — 순수 함수. 저장소(SQLite·메모리)가 같은 규칙을 쓰도록 계획만 세운다.
//  · 중복 제거: (원천, 외부 id, 일시) 가 같은 행은 한 건. 같은 (원천, 외부 id) 에 일시가 다르면 나중 행이 이긴다(충돌로 센다).
//  · 변경 감지: 같은 (원천, 외부 id) 의 일시·제목이 바뀌면 이력을 남긴다.
//  · 사라짐: 원천이 창 전체를 담았을 때(complete) 창 안의 기존 일정이 빠지면 removed 이력.
import { calendarEventId, type CalendarEvent, type EventChange, type StoredEvent } from "./model";

export interface EventMergeUpdate {
  before: StoredEvent;
  after: CalendarEvent;
  changes: EventChange[];
}

export interface EventMergePlan {
  inserts: CalendarEvent[];
  updates: EventMergeUpdate[];
  /** 바뀐 것 없이 그대로인 일정 수 */
  unchanged: number;
  removed: StoredEvent[];
  /** 같은 (원천, 외부 id, 일시) 로 겹친 행 수 */
  duplicates: number;
  /** 같은 (원천, 외부 id) 에 일시가 다른 행이 섞인 수 — 나중 행을 썼다 */
  conflicts: number;
}

export interface EventMergeOptions {
  source: string;
  now: string;
  /** 원천이 이 창 전체를 담았는가 (UTC ISO). 참이면 창 안에서 빠진 기존 일정을 사라짐으로 본다 */
  complete: boolean;
  window: { from: string; to: string };
}

export function planEventMerge(existing: readonly StoredEvent[], incoming: readonly CalendarEvent[], options: EventMergeOptions): EventMergePlan {
  const plan: EventMergePlan = { inserts: [], updates: [], unchanged: 0, removed: [], duplicates: 0, conflicts: 0 };

  const latest = new Map<string, CalendarEvent>();
  for (const e of incoming) {
    const prev = latest.get(e.externalId);
    if (prev) {
      if (prev.startsAt === e.startsAt) plan.duplicates += 1;
      else plan.conflicts += 1;
    }
    latest.set(e.externalId, e);
  }

  const stored = new Map(existing.filter((s) => s.source === options.source).map((s) => [s.externalId, s]));
  for (const e of latest.values()) {
    const before = stored.get(e.externalId);
    if (!before) {
      plan.inserts.push(e);
      continue;
    }
    const id = before.id;
    const changes: EventChange[] = [];
    if (before.removedAt) changes.push({ eventId: id, at: options.now, type: "restored", from: null, to: e.startsAt });
    if (before.startsAt !== e.startsAt || before.timeKnown !== e.timeKnown) changes.push({ eventId: id, at: options.now, type: "time_changed", from: before.startsAt, to: e.startsAt });
    if (before.title !== e.title) changes.push({ eventId: id, at: options.now, type: "title_changed", from: before.title, to: e.title });
    const same = changes.length === 0 && before.kind === e.kind && before.label === e.label && before.sourceName === e.sourceName && before.sourceUrl === e.sourceUrl && (before.note ?? "") === (e.note ?? "");
    if (same) plan.unchanged += 1;
    else plan.updates.push({ before, after: e, changes });
  }

  if (options.complete) {
    for (const s of stored.values()) {
      if (s.removedAt || latest.has(s.externalId)) continue;
      if (s.startsAt < options.window.from || s.startsAt > options.window.to) continue;
      plan.removed.push(s);
    }
  }
  return plan;
}

/** 저장할 행에 붙는 id — 일시가 바뀌어도 같다 */
export const storedEventId = (e: Pick<CalendarEvent, "source" | "externalId">): string => calendarEventId(e.source, e.externalId);
