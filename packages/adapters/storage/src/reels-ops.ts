// [W5 릴스] 편집 명령 로그 — 레인 전용 테이블 reels_ops(CREATE TABLE IF NOT EXISTS, migrations.ts 목록에 넣지 않는다 — reels_projects 와 같은 규칙).
// op 로그가 실행취소·이력·「누가 고쳤나」의 정본이다(docs/12 §5). 프로젝트 갱신과 로그 한 줄은 같은 트랜잭션에서 쓴다.
import { DatabaseSync } from "node:sqlite";
import type { ReelsOpsRepo, ReelsOpRow, ReelsOpCommit } from "@yunseo/application";
import { REELS_PROJECTS_DDL } from "./reels-projects";

export const REELS_OPS_DDL = `CREATE TABLE IF NOT EXISTS reels_ops (
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  op_id TEXT NOT NULL,
  client_id TEXT,
  request_id TEXT,
  kind TEXT NOT NULL,
  steps INTEGER NOT NULL DEFAULT 1,
  op_json TEXT NOT NULL,
  forward_json TEXT NOT NULL,
  inverse_json TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, revision)
);
CREATE INDEX IF NOT EXISTS reels_ops_request ON reels_ops (project_id, request_id)`;

type Row = Record<string, unknown>;

export interface ReelsOpsStore extends ReelsOpsRepo {
  close(): void;
}

export function createReelsOpsStore(options: { path?: string; now?: () => string; db?: DatabaseSync } = {}): ReelsOpsStore {
  const db = options.db ?? new DatabaseSync(options.path ?? ":memory:");
  db.exec("PRAGMA busy_timeout = 5000");
  if (options.path && options.path !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  db.exec(REELS_PROJECTS_DDL);
  db.exec(REELS_OPS_DDL);
  const now = options.now ?? (() => new Date().toISOString());
  const q = {
    get: db.prepare("SELECT id, title, data, revision FROM reels_projects WHERE id = ?"),
    log: db.prepare("SELECT * FROM reels_ops WHERE project_id = ? AND revision > ? ORDER BY revision"),
    request: db.prepare("SELECT response_json FROM reels_ops WHERE project_id = ? AND request_id = ? AND created_at >= ? ORDER BY revision DESC LIMIT 1"),
    update: db.prepare("UPDATE reels_projects SET title = ?, data = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?"),
    insert: db.prepare(
      "INSERT INTO reels_ops (project_id, revision, op_id, client_id, request_id, kind, steps, op_json, forward_json, inverse_json, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ),
  };
  const toRow = (r: Row): ReelsOpRow => ({
    revision: Number(r.revision),
    opId: String(r.op_id),
    clientId: r.client_id === null ? null : String(r.client_id),
    kind: String(r.kind) as ReelsOpRow["kind"],
    steps: Number(r.steps),
    op: String(r.op_json),
    forward: String(r.forward_json),
    inverse: String(r.inverse_json),
    createdAt: String(r.created_at),
  });

  return {
    get(id) {
      const r = q.get.get(id) as Row | undefined;
      return r ? { id: String(r.id), title: String(r.title), data: String(r.data), revision: Number(r.revision) } : null;
    },
    log: (id, sinceRevision = 0) => (q.log.all(id, sinceRevision) as Row[]).map(toRow),
    findResponse(id, requestId, sinceIso) {
      const r = q.request.get(id, requestId, sinceIso) as Row | undefined;
      return r ? String(r.response_json) : null;
    },
    commit(c: ReelsOpCommit) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const at = now();
        const changed = Number(q.update.run(c.title, c.data, at, c.projectId, c.expectedRevision).changes);
        if (changed !== 1) {
          db.exec("ROLLBACK");
          const cur = q.get.get(c.projectId) as Row | undefined;
          return { ok: false, current: cur ? Number(cur.revision) : 0 };
        }
        const revision = c.expectedRevision + 1;
        q.insert.run(c.projectId, revision, c.opId, c.clientId, c.requestId, c.kind, c.steps, c.op, c.forward, c.inverse, c.response, at);
        db.exec("COMMIT");
        return { ok: true, revision };
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    close: () => db.close(),
  };
}
