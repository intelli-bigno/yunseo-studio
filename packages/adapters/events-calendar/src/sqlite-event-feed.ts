// EventFeed 의 SQLite 구현 — 대시보드와 같은 DB 파일(STUDIO_DB)을 쓰되 테이블은 `l4_` 접두사로 분리한다
// (storage 어댑터의 스키마를 건드리지 않는다 — L2 가 그쪽을 소유). Node 내장 `node:sqlite`, 네이티브 모듈 없음.
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { MANUAL_EVENT_SOURCE, planEventMerge, storedEventId, type CalendarEvent, type EventChange, type EventDecision, type StoredEvent } from "@yunseo/domain";
import type { EventFeed, EventFetchRun, EventListQuery, EventSourceBatch, EventUpsertReport } from "@yunseo/application";

export interface SqliteEventFeedOptions {
  /** 파일 경로. 생략하면 메모리 DB(프로세스가 끝나면 사라진다) */
  path?: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS l4_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS l4_events (
  id TEXT PRIMARY KEY, source TEXT NOT NULL, external_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, label TEXT NOT NULL,
  starts_at TEXT NOT NULL, time_known INTEGER NOT NULL, source_name TEXT NOT NULL, source_url TEXT NOT NULL, note TEXT,
  first_seen_at TEXT NOT NULL, updated_at TEXT NOT NULL, removed_at TEXT,
  UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS l4_events_starts ON l4_events (starts_at);
CREATE TABLE IF NOT EXISTS l4_event_history (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, at TEXT NOT NULL, type TEXT NOT NULL, from_value TEXT, to_value TEXT
);
CREATE INDEX IF NOT EXISTS l4_event_history_event ON l4_event_history (event_id);
CREATE TABLE IF NOT EXISTS l4_decisions (event_id TEXT PRIMARY KEY, decision TEXT NOT NULL, reason TEXT NOT NULL, decided_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS l4_fetch_runs (
  source TEXT PRIMARY KEY, at TEXT NOT NULL, ok INTEGER NOT NULL, fetched INTEGER NOT NULL, report TEXT, error TEXT, warnings TEXT NOT NULL
);
`;

type Row = Record<string, unknown>;
const str = (v: unknown): string => String(v);
const orNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

function toEvent(r: Row): StoredEvent {
  const e: StoredEvent = {
    id: str(r.id),
    source: str(r.source),
    externalId: str(r.external_id),
    kind: str(r.kind) as StoredEvent["kind"],
    title: str(r.title),
    label: str(r.label),
    startsAt: str(r.starts_at),
    timeKnown: Number(r.time_known) === 1,
    sourceName: str(r.source_name),
    sourceUrl: str(r.source_url),
    firstSeenAt: str(r.first_seen_at),
    updatedAt: str(r.updated_at),
    removedAt: orNull(r.removed_at),
  };
  if (r.note !== null && r.note !== undefined) e.note = str(r.note);
  return e;
}

const toChange = (r: Row): EventChange => ({ eventId: str(r.event_id), at: str(r.at), type: str(r.type) as EventChange["type"], from: orNull(r.from_value), to: orNull(r.to_value) });

export class SqliteEventFeed implements EventFeed {
  readonly #db: DatabaseSync;
  readonly #q: Record<"count" | "get" | "changes" | "latest" | "decisions" | "runs" | "revision" | "bySource", StatementSync>;

  constructor(options: SqliteEventFeedOptions = {}) {
    this.#db = new DatabaseSync(options.path ?? ":memory:");
    // 대시보드·워커·CLI 가 같은 파일을 열 수 있다 — 잠금은 기다리고, 읽기는 쓰기를 막지 않게 WAL.
    this.#db.exec("PRAGMA busy_timeout = 5000");
    if (options.path && options.path !== ":memory:") this.#db.exec("PRAGMA journal_mode = WAL");
    this.#db.exec(SCHEMA);
    const p = (sql: string) => this.#db.prepare(sql);
    this.#q = {
      count: p("SELECT COUNT(*) AS n FROM l4_events"),
      get: p("SELECT * FROM l4_events WHERE id = ?"),
      bySource: p("SELECT * FROM l4_events WHERE source = ?"),
      changes: p("SELECT * FROM l4_event_history ORDER BY seq DESC LIMIT ?"),
      latest: p("SELECT h.* FROM l4_event_history h WHERE h.type = 'time_changed' AND h.seq = (SELECT MAX(seq) FROM l4_event_history WHERE event_id = h.event_id AND type = 'time_changed')"),
      decisions: p("SELECT * FROM l4_decisions"),
      runs: p("SELECT * FROM l4_fetch_runs ORDER BY source"),
      revision: p("SELECT value FROM l4_meta WHERE key = 'revision'"),
    };
  }

  #transaction<T>(work: () => T): T {
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const out = work();
      this.#db.exec("COMMIT");
      return out;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  #bump(): void {
    this.#db.exec("INSERT INTO l4_meta (key, value) VALUES ('revision', 1) ON CONFLICT(key) DO UPDATE SET value = value + 1");
  }

  async upsert(batch: EventSourceBatch, now: string): Promise<EventUpsertReport> {
    return this.#transaction(() => {
      const existing = (this.#q.bySource.all(batch.source) as Row[]).map(toEvent);
      const plan = planEventMerge(existing, batch.events, { source: batch.source, now, complete: batch.complete, window: batch.window });
      const history = this.#db.prepare("INSERT INTO l4_event_history (event_id, at, type, from_value, to_value) VALUES (?,?,?,?,?)");
      const insert = this.#db.prepare(
        "INSERT INTO l4_events (id, source, external_id, kind, title, label, starts_at, time_known, source_name, source_url, note, first_seen_at, updated_at, removed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)",
      );
      const update = this.#db.prepare("UPDATE l4_events SET kind=?, title=?, label=?, starts_at=?, time_known=?, source_name=?, source_url=?, note=?, updated_at=?, removed_at=NULL WHERE id=?");
      const remove = this.#db.prepare("UPDATE l4_events SET removed_at=?, updated_at=? WHERE id=?");
      const put = (c: CalendarEvent) => [c.kind, c.title, c.label, c.startsAt, c.timeKnown ? 1 : 0, c.sourceName, c.sourceUrl, c.note ?? null] as const;

      for (const e of plan.inserts) insert.run(storedEventId(e), e.source, e.externalId, e.kind, e.title, e.label, e.startsAt, e.timeKnown ? 1 : 0, e.sourceName, e.sourceUrl, e.note ?? null, now, now);
      for (const u of plan.updates) {
        const [kind, title, label, startsAt, known, name, url, note] = put(u.after);
        update.run(kind, title, label, startsAt, known, name, url, note, now, u.before.id);
        for (const c of u.changes) history.run(c.eventId, c.at, c.type, c.from, c.to);
      }
      for (const r of plan.removed) {
        remove.run(now, now, r.id);
        history.run(r.id, now, "removed", r.startsAt, null);
      }
      const report: EventUpsertReport = { inserted: plan.inserts.length, changed: plan.updates.length, unchanged: plan.unchanged, removed: plan.removed.length, duplicates: plan.duplicates, conflicts: plan.conflicts };
      if (report.inserted + report.changed + report.removed > 0) this.#bump();
      return report;
    });
  }

  async list(query: EventListQuery = {}): Promise<StoredEvent[]> {
    const where: string[] = [];
    const args: string[] = [];
    if (!query.includeRemoved) where.push("removed_at IS NULL");
    if (query.source) {
      where.push("source = ?");
      args.push(query.source);
    }
    if (query.from) {
      where.push("starts_at >= ?");
      args.push(query.from);
    }
    if (query.to) {
      where.push("starts_at <= ?");
      args.push(query.to);
    }
    const sql = `SELECT * FROM l4_events ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY starts_at, id`;
    return (this.#db.prepare(sql).all(...args) as Row[]).map(toEvent);
  }

  async count(): Promise<number> {
    return Number((this.#q.count.get() as Row).n);
  }

  async get(id: string): Promise<StoredEvent | null> {
    const r = this.#q.get.get(id) as Row | undefined;
    return r ? toEvent(r) : null;
  }

  async removeManual(id: string): Promise<boolean> {
    return this.#transaction(() => {
      const r = this.#db.prepare("DELETE FROM l4_events WHERE id = ? AND source = ?").run(id, MANUAL_EVENT_SOURCE);
      if (Number(r.changes) === 0) return false;
      this.#db.prepare("DELETE FROM l4_decisions WHERE event_id = ?").run(id);
      this.#db.prepare("DELETE FROM l4_event_history WHERE event_id = ?").run(id);
      this.#bump();
      return true;
    });
  }

  async changes(limit = 50): Promise<EventChange[]> {
    return (this.#q.changes.all(limit) as Row[]).map(toChange);
  }

  async latestTimeChanges(): Promise<EventChange[]> {
    return (this.#q.latest.all() as Row[]).map(toChange);
  }

  async decisions(): Promise<EventDecision[]> {
    return (this.#q.decisions.all() as Row[]).map((r) => ({ eventId: str(r.event_id), decision: str(r.decision) as EventDecision["decision"], reason: str(r.reason), decidedAt: str(r.decided_at) }));
  }

  async decide(d: EventDecision): Promise<void> {
    this.#transaction(() => {
      this.#db
        .prepare("INSERT INTO l4_decisions (event_id, decision, reason, decided_at) VALUES (?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET decision=excluded.decision, reason=excluded.reason, decided_at=excluded.decided_at")
        .run(d.eventId, d.decision, d.reason, d.decidedAt);
      this.#bump();
    });
  }

  async clearDecision(eventId: string): Promise<void> {
    this.#transaction(() => {
      if (Number(this.#db.prepare("DELETE FROM l4_decisions WHERE event_id = ?").run(eventId).changes) > 0) this.#bump();
    });
  }

  async recordRun(run: EventFetchRun): Promise<void> {
    this.#db
      .prepare("INSERT INTO l4_fetch_runs (source, at, ok, fetched, report, error, warnings) VALUES (?,?,?,?,?,?,?) ON CONFLICT(source) DO UPDATE SET at=excluded.at, ok=excluded.ok, fetched=excluded.fetched, report=excluded.report, error=excluded.error, warnings=excluded.warnings")
      .run(run.source, run.at, run.ok ? 1 : 0, run.fetched, run.report ? JSON.stringify(run.report) : null, run.error, JSON.stringify(run.warnings));
  }

  async lastRuns(): Promise<EventFetchRun[]> {
    return (this.#q.runs.all() as Row[]).map((r) => ({
      source: str(r.source),
      at: str(r.at),
      ok: Number(r.ok) === 1,
      fetched: Number(r.fetched),
      report: r.report ? (JSON.parse(str(r.report)) as EventUpsertReport) : null,
      error: orNull(r.error),
      warnings: JSON.parse(str(r.warnings)) as string[],
    }));
  }

  async revision(): Promise<number> {
    return Number((this.#q.revision.get() as Row | undefined)?.value ?? 0);
  }

  close(): void {
    this.#db.close();
  }
}

export function createSqliteEventFeed(options: SqliteEventFeedOptions = {}): SqliteEventFeed {
  return new SqliteEventFeed(options);
}
