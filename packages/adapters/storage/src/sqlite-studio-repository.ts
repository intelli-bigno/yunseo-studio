// StudioRepository 의 SQLite 구현 — 로컬 파일(또는 메모리) 하나. 외부 연동 없음(docs/08 D3: MVP = 실행기 + SQLite).
// Node 내장 `node:sqlite` 를 쓴다 — 네이티브 모듈·설치 스크립트가 없다(Node 22.13+).
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { StudioRepository } from "@yunseo/application";
import type { EventCandidate, Piece, QueueItem, WeekVariable } from "@yunseo/domain";
import { SEED_EVENT_CANDIDATES, SEED_PIECES, SEED_QUEUE, SEED_WEEK_VARIABLES } from "./seed";

export interface StudioSeed {
  pieces: readonly Piece[];
  weekVariables: readonly WeekVariable[];
  eventCandidates: readonly EventCandidate[];
  queue: readonly QueueItem[];
}

export const DEFAULT_SEED: StudioSeed = { pieces: SEED_PIECES, weekVariables: SEED_WEEK_VARIABLES, eventCandidates: SEED_EVENT_CANDIDATES, queue: SEED_QUEUE };

export interface SqliteStudioOptions {
  /** 파일 경로. 생략하면 메모리 DB(프로세스가 끝나면 사라지는 시안 모드) */
  path?: string;
  /** 빈 저장소를 처음 열 때 채울 데이터. false 면 비워 둔다 */
  seed?: StudioSeed | false;
}

const SCHEMA = `
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

type Row = Record<string, unknown>;
const str = (v: unknown): string => String(v);
const orNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

function toPiece(r: Row): Piece {
  const piece: Piece = {
    id: str(r.id),
    kind: str(r.kind) as Piece["kind"],
    title: str(r.title),
    slot: str(r.slot),
    status: str(r.status) as Piece["status"],
    gates: JSON.parse(str(r.gates)) as Piece["gates"],
    blocker: orNull(r.blocker),
    viewpoint: str(r.viewpoint),
    stages: JSON.parse(str(r.stages)) as Piece["stages"],
    claims: JSON.parse(str(r.claims)) as Piece["claims"],
  };
  if (r.pre_issue_id !== null) piece.preIssueId = str(r.pre_issue_id);
  if (r.cards !== null) piece.cards = JSON.parse(str(r.cards)) as string[];
  if (r.hash !== null) piece.hash = str(r.hash);
  return piece;
}

function toVariable(r: Row): WeekVariable {
  const v: WeekVariable = { date: str(r.date), time: str(r.time), tz: str(r.tz), label: str(r.label), mark: str(r.mark) as WeekVariable["mark"], source: str(r.source), importance: str(r.importance) as WeekVariable["importance"] };
  if (r.closed_by !== null) v.closedBy = str(r.closed_by);
  return v;
}

export class SqliteStudioRepository implements StudioRepository {
  readonly #db: DatabaseSync;
  readonly #q: Record<"pieces" | "piece" | "variables" | "candidates" | "queue" | "revision", StatementSync>;

  constructor(options: SqliteStudioOptions = {}) {
    this.#db = new DatabaseSync(options.path ?? ":memory:");
    // 여러 프로세스(빌드 워커·서버)가 같은 파일을 열 수 있다 — 잠금은 기다리고, 읽기는 쓰기를 막지 않게 WAL.
    this.#db.exec("PRAGMA busy_timeout = 5000");
    if (options.path && options.path !== ":memory:") this.#db.exec("PRAGMA journal_mode = WAL");
    this.#db.exec(SCHEMA);
    if (options.seed !== false) this.#seedIfEmpty(options.seed ?? DEFAULT_SEED);
    const p = (sql: string) => this.#db.prepare(sql);
    this.#q = {
      pieces: p("SELECT * FROM pieces ORDER BY position"),
      piece: p("SELECT * FROM pieces WHERE id = ?"),
      variables: p("SELECT * FROM week_variables ORDER BY position"),
      candidates: p("SELECT * FROM event_candidates ORDER BY position"),
      queue: p("SELECT * FROM queue ORDER BY position"),
      revision: p("SELECT value FROM meta WHERE key = 'revision'"),
    };
  }

  /** 첫 열기에만 채운다. 동시에 여럿이 열어도 한 번만 들어가게 쓰기 잠금 안에서 확인한다 */
  #seedIfEmpty(seed: StudioSeed): void {
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      if (this.#db.prepare("SELECT 1 FROM meta WHERE key = 'seeded'").get()) {
        this.#db.exec("COMMIT");
        return;
      }
      const j = JSON.stringify;
      const piece = this.#db.prepare("INSERT INTO pieces (position, id, kind, title, slot, status, gates, blocker, viewpoint, stages, claims, pre_issue_id, cards, hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
      seed.pieces.forEach((p, i) => piece.run(i, p.id, p.kind, p.title, p.slot, p.status, j(p.gates), p.blocker, p.viewpoint, j(p.stages), j(p.claims), p.preIssueId ?? null, p.cards ? j(p.cards) : null, p.hash ?? null));
      const variable = this.#db.prepare("INSERT INTO week_variables (position, date, time, tz, label, mark, source, importance, closed_by) VALUES (?,?,?,?,?,?,?,?,?)");
      seed.weekVariables.forEach((v, i) => variable.run(i, v.date, v.time, v.tz, v.label, v.mark, v.source, v.importance, v.closedBy ?? null));
      const candidate = this.#db.prepare("INSERT INTO event_candidates (position, id, date, label, questions, decision) VALUES (?,?,?,?,?,?)");
      seed.eventCandidates.forEach((c, i) => candidate.run(i, c.id, c.date, c.label, j(c.questions), c.decision));
      const queue = this.#db.prepare("INSERT INTO queue (position, piece_id, channel, approved_hash, current_hash, posted_url) VALUES (?,?,?,?,?,?)");
      seed.queue.forEach((q, i) => queue.run(i, q.pieceId, q.channel, q.approvedHash, q.currentHash, q.postedUrl));
      this.#db.exec("INSERT INTO meta (key, value) VALUES ('seeded', 1), ('revision', 1)");
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  async listPieces(): Promise<Piece[]> {
    return (this.#q.pieces.all() as Row[]).map(toPiece);
  }

  async getPiece(id: string): Promise<Piece | null> {
    const r = this.#q.piece.get(id) as Row | undefined;
    return r ? toPiece(r) : null;
  }

  async listWeekVariables(): Promise<WeekVariable[]> {
    return (this.#q.variables.all() as Row[]).map(toVariable);
  }

  async listEventCandidates(): Promise<EventCandidate[]> {
    return (this.#q.candidates.all() as Row[]).map((r) => ({ id: str(r.id), date: str(r.date), label: str(r.label), questions: JSON.parse(str(r.questions)) as EventCandidate["questions"], decision: orNull(r.decision) as EventCandidate["decision"] }));
  }

  async listQueue(): Promise<QueueItem[]> {
    return (this.#q.queue.all() as Row[]).map((r) => ({ pieceId: str(r.piece_id), channel: str(r.channel) as QueueItem["channel"], approvedHash: orNull(r.approved_hash), currentHash: str(r.current_hash), postedUrl: orNull(r.posted_url) }));
  }

  async revision(): Promise<number> {
    return Number((this.#q.revision.get() as Row | undefined)?.value ?? 0);
  }

  close(): void {
    this.#db.close();
  }
}

export function createSqliteStudioRepository(options: SqliteStudioOptions = {}): SqliteStudioRepository {
  return new SqliteStudioRepository(options);
}
