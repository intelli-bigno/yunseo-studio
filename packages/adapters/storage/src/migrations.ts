// 스키마 마이그레이션 — 버전 테이블(schema_migrations)에 적힌 것만 한 번씩 적용한다.
// 규칙: 이미 나간 마이그레이션은 고치지 않고 새 버전을 덧붙인다. 각 버전은 쓰기 잠금 안에서 다시 확인하고 적용한다
// (여러 프로세스 — 빌드 워커·서버 — 가 같은 파일을 동시에 열어도 한 번만).
// 다른 레인의 전용 테이블(<레인>_ 접두사, CREATE TABLE IF NOT EXISTS)은 각 레인 모듈이 만든다 — 여기 목록에 넣지 않는다.
import type { DatabaseSync } from "node:sqlite";

export interface MigrateContext {
  /** 지금 산출물 작업 폴더(STUDIO_WORK_DIR) — 경로 데이터 마이그레이션이 쓴다 */
  workDir?: string;
}

export interface Migration {
  version: number;
  name: string;
  /** 스키마 SQL */
  sql?: string;
  /**
   * 데이터 마이그레이션 — 같은 쓰기 잠금 안에서 sql 뒤에 돈다. false 를 돌려주면 「지금은 못 한다」(필요한 맥락 없음):
   * 버전을 남기지 않고 다음에 맥락을 가진 프로세스가 열 때 다시 시도한다.
   */
  data?: (db: DatabaseSync, ctx: MigrateContext) => boolean;
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

// ── v3 — 파이프라인 기록의 산출물 경로를 지금 작업 폴더로 한 번 바로잡는다 ─────────
// 기록은 절대경로로 저장된다. 네이티브 Windows(`C:\Users\…\Temp\yunseo-studio-work\…`) → Docker(/data/work) 이관 뒤 옛 기록은
// 파일은 있어도 경로가 작업 폴더 밖이라 읽기 어댑터가 거부했다(2026-11-07 #30 — 그때는 읽을 때마다 보정했다).
// 산출물은 늘 `<작업 폴더>/<편>/<내용 해시 12자>/<단계>/<이름>` 에 쓰이므로 이름만 남기고 그 자리로 옮겨 적는다.
// 이미 작업 폴더 안인 경로는 그대로 둔다. 이 판 이후 읽기 쪽은 기록 경로를 그대로 믿는다.

const slashed = (s: string) => s.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
const trimEnd = (s: string) => s.replace(/[\\/]+$/, "");

/** 기록 하나의 경로 — 작업 폴더 밖이면 `<workDir>/<편>/<해시12>/<단계>/<이름>` */
export function rebaseArtifactPath(path: string, workDir: string, pieceId: string, contentHash: string, step: "cards" | "reel" | "bundle"): string {
  const root = trimEnd(slashed(workDir));
  if (slashed(path).startsWith(`${root}/`)) return path;
  const name = slashed(path).split("/").pop() ?? "";
  return [trimEnd(workDir), pieceId, contentHash.slice(0, 12), step, name].join("/");
}

interface FileRef { path: string }
const rebasePipelinePaths = (db: DatabaseSync, { workDir }: MigrateContext): boolean => {
  if (!workDir) return false;
  const rows = db.prepare("SELECT piece_id, content_hash, render, reel, bundle FROM pipeline_results").all() as Record<string, string | null>[];
  const update = db.prepare("UPDATE pipeline_results SET render = ?, reel = ?, bundle = ? WHERE piece_id = ?");
  for (const r of rows) {
    const pieceId = String(r.piece_id);
    const hash = String(r.content_hash);
    const fix = <T extends FileRef>(f: T, step: "cards" | "reel" | "bundle"): T => (typeof f.path === "string" ? { ...f, path: rebaseArtifactPath(f.path, workDir, pieceId, hash, step) } : f);
    const parse = (v: string | null) => (v === null ? null : (JSON.parse(v) as Record<string, unknown>));
    const render = parse(r.render ?? null) as { cards?: FileRef[] } | null;
    const reel = parse(r.reel ?? null) as { video?: FileRef; subtitles?: FileRef | null } | null;
    const bundle = parse(r.bundle ?? null) as { zip?: FileRef } | null;
    if (render?.cards) render.cards = render.cards.map((c) => fix(c, "cards"));
    if (reel) {
      if (reel.video) reel.video = fix(reel.video, "reel");
      if (reel.subtitles) reel.subtitles = fix(reel.subtitles, "reel");
    }
    if (bundle?.zip) bundle.zip = fix(bundle.zip, "bundle");
    const j = (v: unknown) => (v === null ? null : JSON.stringify(v));
    update.run(j(render), j(reel), j(bundle), pieceId);
  }
  return true;
};

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: "base", sql: V1 },
  { version: 2, name: "l2-authoring", sql: V2 },
  { version: 3, name: "rebase-pipeline-paths", data: rebasePipelinePaths },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

/** 적용 안 된 버전을 차례로 적용하고, 이번에 적용한 버전 목록을 돌려준다 */
export function migrate(db: DatabaseSync, migrations: readonly Migration[] = MIGRATIONS, now: () => string = () => new Date().toISOString(), ctx: MigrateContext = {}): number[] {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  const has = db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?");
  const mark = db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)");
  const applied: number[] = [];
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (has.get(m.version)) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      if (!has.get(m.version)) {
        if (m.sql) db.exec(m.sql);
        if (!m.data || m.data(db, ctx)) {
          mark.run(m.version, m.name, now());
          applied.push(m.version);
        }
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
