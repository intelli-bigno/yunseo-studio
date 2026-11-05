// EventFeed 의 메모리 구현 — 유스케이스 테스트와 `events fetch --dry`(저장 없이 개수만 센다)가 쓴다.
// 병합 규칙은 도메인 planEventMerge 하나라 SQLite 구현과 같다(어댑터 계약 테스트가 두 구현에 같은 시험을 돌린다).
import { MANUAL_EVENT_SOURCE, planEventMerge, storedEventId, type EventChange, type EventDecision, type StoredEvent } from "@yunseo/domain";
import type { EventFeed, EventListQuery, EventFetchRun, EventSourceBatch, EventUpsertReport } from "./ports";

export function createMemoryEventFeed(): EventFeed {
  const events = new Map<string, StoredEvent>();
  const history: EventChange[] = [];
  const decided = new Map<string, EventDecision>();
  const runs = new Map<string, EventFetchRun>();
  let rev = 0;

  const sorted = () => [...events.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));

  return {
    async upsert(batch: EventSourceBatch, now: string): Promise<EventUpsertReport> {
      const plan = planEventMerge(sorted(), batch.events, { source: batch.source, now, complete: batch.complete, window: batch.window });
      for (const e of plan.inserts) events.set(storedEventId(e), { ...e, id: storedEventId(e), firstSeenAt: now, updatedAt: now, removedAt: null });
      for (const u of plan.updates) {
        events.set(u.before.id, { ...u.after, id: u.before.id, firstSeenAt: u.before.firstSeenAt, updatedAt: now, removedAt: null });
        history.push(...u.changes);
      }
      for (const r of plan.removed) {
        events.set(r.id, { ...r, removedAt: now, updatedAt: now });
        history.push({ eventId: r.id, at: now, type: "removed", from: r.startsAt, to: null });
      }
      const report: EventUpsertReport = { inserted: plan.inserts.length, changed: plan.updates.length, unchanged: plan.unchanged, removed: plan.removed.length, duplicates: plan.duplicates, conflicts: plan.conflicts };
      if (report.inserted + report.changed + report.removed > 0) rev += 1;
      return report;
    },
    async list(query: EventListQuery = {}) {
      return structuredClone(
        sorted().filter(
          (e) => (query.includeRemoved || e.removedAt === null) && (!query.source || e.source === query.source) && (!query.from || e.startsAt >= query.from) && (!query.to || e.startsAt <= query.to),
        ),
      );
    },
    async count() {
      return events.size;
    },
    async get(id) {
      const e = events.get(id);
      return e ? structuredClone(e) : null;
    },
    async removeManual(id) {
      const e = events.get(id);
      if (!e || e.source !== MANUAL_EVENT_SOURCE) return false;
      events.delete(id);
      decided.delete(id);
      rev += 1;
      return true;
    },
    async changes(limit = 50) {
      return history.slice(-limit).reverse();
    },
    async latestTimeChanges() {
      const latest = new Map<string, EventChange>();
      for (const c of history) if (c.type === "time_changed") latest.set(c.eventId, c);
      return [...latest.values()];
    },
    async decisions() {
      return [...decided.values()];
    },
    async decide(decision) {
      decided.set(decision.eventId, { ...decision });
      rev += 1;
    },
    async clearDecision(eventId) {
      if (decided.delete(eventId)) rev += 1;
    },
    async recordRun(run) {
      runs.set(run.source, structuredClone(run));
    },
    async lastRuns() {
      return [...runs.values()].map((r) => structuredClone(r));
    },
    async revision() {
      return rev;
    },
  };
}
