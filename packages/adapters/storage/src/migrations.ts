// 스키마 마이그레이션 — 버전 테이블(schema_migrations)에 적힌 것만 한 번씩 적용한다.
// 규칙: 이미 나간 마이그레이션은 고치지 않고 새 버전을 덧붙인다. 각 버전은 쓰기 잠금 안에서 다시 확인하고 적용한다
// (여러 프로세스 — 빌드 워커·서버 — 가 같은 파일을 동시에 열어도 한 번만).
// 다른 레인의 전용 테이블(<레인>_ 접두사, CREATE TABLE IF NOT EXISTS)은 각 레인 모듈이 만든다 — 여기 목록에 넣지 않는다.
import type { DatabaseSync } from "node:sqlite";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** v1 — 버전 테이블 도입 전 스키마 그대로(IF NOT EXISTS 라 이미 있는 파일에서는 아무 일도 안 한다) */
const V1 = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS pieces (
  position INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, title TEXT NOT NULL, slot TEXT NOT NULL, status TEXT NOT NULL,
  gates TEXT NOT NULL, blocker TEXT, viewpoint TEXT NOT NULL, stages TEXT NOT NULL, claims TEXT NOT NULL,
  pre_issue_id TEXT, cards TEXT, hash TEXT
);
CREATE INDEX IF NOT EXISTS pieces_slot ON pieces (slot);
CREATE TABLE IF NOT EXISTS week_variables (
  position INTEGER PRIMARY KEY, date TEXT NOT NULL, time TEXT NOT NULL, tz TEXT NOT NULL, label TEXT NOT NULL,
  mark TEXT NOT NULL, source TEXT NOT NULL, importance TEXT NOT NULL, closed_by TEXT
);
CREATE TABLE IF NOT EXISTS event_candidates (
  position INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, date TEXT NOT NULL, label TEXT NOT NULL, questions TEXT NOT NULL, decision TEXT
);
CREATE TABLE IF NOT EXISTS queue (
  position INTEGER PRIMARY KEY, piece_id TEXT NOT NULL, channel TEXT NOT NULL, approved_hash TEXT, current_hash TEXT NOT NULL, posted_url TEXT
);
`;

/** v2 [L2] — 저장 버전(낙관적 동시성)·구조 칸·수정 이력·게이트 기록·파이프라인 산출물 */
const V2 = `
ALTER TABLE pieces ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE pieces ADD COLUMN structure TEXT;
ALTER TABLE pieces ADD COLUMN created_at TEXT;
ALTER TABLE pieces ADD COLUMN updated_at TEXT;
CREATE INDEX pieces_pre_issue ON pieces (pre_issue_id);
CREATE TABLE piece_revisions (
  piece_id TEXT NOT NULL, revision INTEGER NOT NULL, at TEXT NOT NULL, actor TEXT NOT NULL, change_kind TEXT NOT NULL,
  reason TEXT, reader_note TEXT, follow_up TEXT, changes TEXT NOT NULL, content_hash TEXT NOT NULL, status TEXT NOT NULL,
  PRIMARY KEY (piece_id, revision)
);
CREATE TABLE approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, piece_id TEXT NOT NULL,
  gate TEXT NOT NULL CHECK (gate IN ('G1', 'G2', 'G3')), decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  actor TEXT NOT NULL CHECK (length(trim(actor)) > 0), at TEXT NOT NULL, content_hash TEXT NOT NULL, note TEXT
);
CREATE INDEX approvals_piece ON approvals (piece_id, gate, id);
CREATE TABLE pipeline_results (
  piece_id TEXT PRIMARY KEY, content_hash TEXT NOT NULL, render TEXT, reel TEXT, bundle TEXT, updated_at TEXT NOT NULL
);
`;

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: "base", sql: V1 },
  { version: 2, name: "l2-authoring", sql: V2 },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

/** 적용 안 된 버전을 차례로 적용하고, 이번에 적용한 버전 목록을 돌려준다 */
export function migrate(db: DatabaseSync, migrations: readonly Migration[] = MIGRATIONS, now: () => string = () => new Date().toISOString()): number[] {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  const has = db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?");
  const mark = db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)");
  const applied: number[] = [];
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (has.get(m.version)) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      if (!has.get(m.version)) {
        db.exec(m.sql);
        mark.run(m.version, m.name, now());
        applied.push(m.version);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return applied;
}

export function appliedVersions(db: DatabaseSync): number[] {
  return (db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as { version: number }[]).map((r) => Number(r.version));
}
