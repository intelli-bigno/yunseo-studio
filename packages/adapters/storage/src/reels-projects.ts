// [W3 릴스] 릴스 편집 프로젝트 저장 — 레인 전용 테이블 reels_projects(CREATE TABLE IF NOT EXISTS, migrations.ts 목록에 넣지 않는다).
// 프로젝트 내용(트랙·클립)은 JSON 한 칸으로 둔다 — 모양 검사는 유스케이스 계층 모델(@yunseo/application/reels-timeline)이 저장 전에 한다.
// 같은 파일(STUDIO_DB)을 쓰되 연결은 따로 연다(WAL + busy_timeout 이라 원고 저장소 연결과 함께 써도 된다).
import { DatabaseSync } from "node:sqlite";
import { AppError } from "@yunseo/domain";

export interface ReelsProjectSummary {
  id: string;
  title: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface ReelsProjectRecord extends ReelsProjectSummary {
  /** 프로젝트 JSON 문자열 */
  data: string;
}

/** 저장 중에 다른 곳이 먼저 고쳤을 때 */
export class ReelsRevisionConflictError extends AppError<"REVISION_CONFLICT"> {
  override name = "ReelsRevisionConflictError";
  constructor(readonly current: number) {
    super("REVISION_CONFLICT", `다른 곳에서 먼저 저장했다(현재 ${current}판)`, { details: { current } });
  }
}

export interface ReelsProjectStore {
  list(): ReelsProjectSummary[];
  get(id: string): ReelsProjectRecord | null;
  /** 새로 만들거나 덮어쓴다. expectedRevision 을 주면 그 판일 때만 쓴다 */
  save(input: { id: string; title: string; data: string; expectedRevision?: number }): ReelsProjectRecord;
  remove(id: string): boolean;
  close(): void;
}

export const REELS_PROJECTS_DDL = `CREATE TABLE IF NOT EXISTS reels_projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  data TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

type Row = Record<string, unknown>;
const summary = (r: Row): ReelsProjectSummary => ({ id: String(r.id), title: String(r.title), revision: Number(r.revision), createdAt: String(r.created_at), updatedAt: String(r.updated_at) });

export function createReelsProjectStore(options: { path?: string; now?: () => string; /** 이미 연 연결을 함께 쓴다(메모리 DB 를 편집 명령 로그와 나눌 때) */ db?: DatabaseSync } = {}): ReelsProjectStore {
  const db = options.db ?? new DatabaseSync(options.path ?? ":memory:");
  db.exec("PRAGMA busy_timeout = 5000");
  if (options.path && options.path !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  db.exec(REELS_PROJECTS_DDL);
  const now = options.now ?? (() => new Date().toISOString());
  const q = {
    list: db.prepare("SELECT id, title, revision, created_at, updated_at FROM reels_projects ORDER BY updated_at DESC, id"),
    get: db.prepare("SELECT * FROM reels_projects WHERE id = ?"),
    insert: db.prepare("INSERT INTO reels_projects (id, title, data, revision, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)"),
    update: db.prepare("UPDATE reels_projects SET title = ?, data = ?, revision = revision + 1, updated_at = ? WHERE id = ?"),
    remove: db.prepare("DELETE FROM reels_projects WHERE id = ?"),
  };
  const get = (id: string): ReelsProjectRecord | null => {
    const r = q.get.get(id) as Row | undefined;
    return r ? { ...summary(r), data: String(r.data) } : null;
  };

  return {
    list: () => (q.list.all() as Row[]).map(summary),
    get,
    save({ id, title, data, expectedRevision }) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const cur = get(id);
        if (expectedRevision !== undefined && (cur?.revision ?? 0) !== expectedRevision) throw new ReelsRevisionConflictError(cur?.revision ?? 0);
        const at = now();
        if (cur) q.update.run(title, data, at, id);
        else q.insert.run(id, title, data, at, at);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return get(id)!;
    },
    remove: (id) => Number(q.remove.run(id).changes) > 0,
    close: () => db.close(),
  };
}
