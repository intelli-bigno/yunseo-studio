// StudioRepository(읽기) + AuthoringStore(쓰기, [L2])의 SQLite 구현 — 로컬 파일(또는 메모리) 하나. 외부 연동 없음(docs/08 D3: MVP = 실행기 + SQLite).
// Node 내장 `node:sqlite` 를 쓴다 — 네이티브 모듈·설치 스크립트가 없다(Node 22.13+).
// 스키마는 migrations.ts 의 버전 테이블로 올린다. 저장소를 열 때 시안 데이터를 채우지 않는다 — 「빈 DB 데모 채우기」(seedDemo)로만.
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { RevisionConflictError, PieceNotFoundError, type AuthoringStore, type NewRevision, type PipelineRecord, type RevisionEntry, type SavePieceCommand, type StudioRepository } from "@yunseo/application";
import { GATE_IDS, contentHash, type Approval, type EventCandidate, type Piece, type QueueItem, type WeekVariable } from "@yunseo/domain";
import { migrate } from "./migrations";
import { SEED_EVENT_CANDIDATES, SEED_PIECES, SEED_QUEUE, SEED_WEEK_VARIABLES } from "./seed";

export interface StudioSeed {
  pieces: readonly Piece[];
  weekVariables: readonly WeekVariable[];
  eventCandidates: readonly EventCandidate[];
  queue: readonly QueueItem[];
}

export const DEFAULT_SEED: StudioSeed = { pieces: SEED_PIECES, weekVariables: SEED_WEEK_VARIABLES, eventCandidates: SEED_EVENT_CANDIDATES, queue: SEED_QUEUE };

export interface SqliteStudioOptions {
  /** 파일 경로. 생략하면 메모리 DB(프로세스가 끝나면 사라진다) */
  path?: string;
  /** 열 때 비어 있으면 채울 데이터(시험·측정용). 기본은 채우지 않는다 */
  seed?: StudioSeed | false;
  /** 시각(이력·생성 시각). 기본은 시스템 시각 */
  now?: () => string;
}

type Row = Record<string, unknown>;
const str = (v: unknown): string => String(v);
const orNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const j = JSON.stringify;

/** pieces.structure 칸 — 종류별 구조(시나리오·확인 항목·응답·자료 확보·중요도) */
type Structure = Pick<Piece, "importance" | "scenarios" | "checks" | "scenarioOutcomes" | "checkResults" | "evidence" | "fields">;
const STRUCTURE_KEYS = ["importance", "scenarios", "checks", "scenarioOutcomes", "checkResults", "evidence", "fields"] as const;

function structureOf(p: Piece): string | null {
  const out: Record<string, unknown> = {};
  for (const k of STRUCTURE_KEYS) if (p[k] !== undefined) out[k] = p[k];
  return Object.keys(out).length ? j(out) : null;
}

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
  if (r.revision !== undefined && r.revision !== null) piece.revision = Number(r.revision);
  if (r.structure !== null && r.structure !== undefined) Object.assign(piece, JSON.parse(str(r.structure)) as Structure);
  return piece;
}

function toVariable(r: Row): WeekVariable {
  const v: WeekVariable = { date: str(r.date), time: str(r.time), tz: str(r.tz), label: str(r.label), mark: str(r.mark) as WeekVariable["mark"], source: str(r.source), importance: str(r.importance) as WeekVariable["importance"] };
  if (r.closed_by !== null) v.closedBy = str(r.closed_by);
  return v;
}

const toApproval = (r: Row): Approval => ({ gate: str(r.gate) as Approval["gate"], decision: str(r.decision) as Approval["decision"], actor: str(r.actor), at: str(r.at), contentHash: str(r.content_hash), note: orNull(r.note) });

const toRevision = (r: Row): RevisionEntry => ({
  pieceId: str(r.piece_id),
  revision: Number(r.revision),
  at: str(r.at),
  actor: str(r.actor),
  changeKind: str(r.change_kind),
  reason: orNull(r.reason),
  readerNote: orNull(r.reader_note),
  followUp: orNull(r.follow_up),
  changes: JSON.parse(str(r.changes)) as RevisionEntry["changes"],
  contentHash: str(r.content_hash),
  status: str(r.status) as RevisionEntry["status"],
});

/** 대기열·편 hash 칸에 쓰는 짧은 해시 */
const shortHash = (h: string) => h.slice(0, 8);

export class SqliteStudioRepository implements StudioRepository, AuthoringStore {
  readonly #db: DatabaseSync;
  readonly #now: () => string;
  readonly #q: Record<"pieces" | "piece" | "variables" | "candidates" | "queue" | "revision" | "approvals" | "bump", StatementSync>;

  constructor(options: SqliteStudioOptions = {}) {
    this.#db = new DatabaseSync(options.path ?? ":memory:");
    this.#now = options.now ?? (() => new Date().toISOString());
    // 여러 프로세스(빌드 워커·서버)가 같은 파일을 열 수 있다 — 잠금은 기다리고, 읽기는 쓰기를 막지 않게 WAL.
    this.#db.exec("PRAGMA busy_timeout = 5000");
    if (options.path && options.path !== ":memory:") this.#db.exec("PRAGMA journal_mode = WAL");
    migrate(this.#db, undefined, this.#now);
    const p = (sql: string) => this.#db.prepare(sql);
    this.#q = {
      pieces: p("SELECT * FROM pieces ORDER BY position"),
      piece: p("SELECT * FROM pieces WHERE id = ?"),
      variables: p("SELECT * FROM week_variables ORDER BY position"),
      candidates: p("SELECT * FROM event_candidates ORDER BY position"),
      queue: p("SELECT * FROM queue ORDER BY position"),
      revision: p("SELECT value FROM meta WHERE key = 'revision'"),
      approvals: p("SELECT * FROM approvals WHERE piece_id = ? ORDER BY id"),
      bump: p("INSERT INTO meta (key, value) VALUES ('revision', 1) ON CONFLICT(key) DO UPDATE SET value = value + 1"),
    };
    if (options.seed) this.#seed(options.seed);
  }

  /** 쓰기 잠금 안에서 실행한다 — 실패하면 전부 되돌린다 */
  #tx<T>(fn: () => T): T {
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.#db.exec("COMMIT");
      return out;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  #insertPiece(p: Piece, revision: number): void {
    const position = Number((this.#db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS n FROM pieces").get() as Row).n);
    const at = this.#now();
    this.#db
      .prepare("INSERT INTO pieces (position, id, kind, title, slot, status, gates, blocker, viewpoint, stages, claims, pre_issue_id, cards, hash, revision, structure, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(position, p.id, p.kind, p.title, p.slot, p.status, j(p.gates), p.blocker, p.viewpoint, j(p.stages), j(p.claims), p.preIssueId ?? null, p.cards ? j(p.cards) : null, p.hash ?? null, revision, structureOf(p), at, at);
  }

  #insertRevision(pieceId: string, revision: number, e: NewRevision): void {
    this.#db
      .prepare("INSERT INTO piece_revisions (piece_id, revision, at, actor, change_kind, reason, reader_note, follow_up, changes, content_hash, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run(pieceId, revision, e.at, e.actor, e.changeKind, e.reason, e.readerNote, e.followUp, j(e.changes), e.contentHash, e.status);
  }

  #insertApproval(pieceId: string, a: Approval): void {
    this.#db.prepare("INSERT INTO approvals (piece_id, gate, decision, actor, at, content_hash, note) VALUES (?,?,?,?,?,?,?)").run(pieceId, a.gate, a.decision, a.actor, a.at, a.contentHash, a.note);
  }

  /** 빈 저장소에만 채운다. 채웠으면 true */
  #seed(seed: StudioSeed): boolean {
    return this.#tx(() => {
      if (Number((this.#db.prepare("SELECT COUNT(*) AS n FROM pieces").get() as Row).n) > 0) return false;
      const at = this.#now();
      for (const p of seed.pieces) {
        this.#insertPiece(p, 1);
        const hash = contentHash(p);
        this.#insertRevision(p.id, 1, { at, actor: "시안 데이터", changeKind: "create", reason: "빈 DB 데모 채우기", readerNote: null, followUp: null, changes: [], contentHash: hash, status: p.status });
        // 시안에서 이미 통과한 게이트는 그 내용으로 통과한 기록을 남긴다(승인 무효 규칙이 시안에도 그대로 돈다)
        for (const g of GATE_IDS) if (p.gates[g] === "passed") this.#insertApproval(p.id, { gate: g, decision: "approved", actor: "시안 데이터", at, contentHash: hash, note: "시안" });
      }
      const variable = this.#db.prepare("INSERT OR IGNORE INTO week_variables (position, date, time, tz, label, mark, source, importance, closed_by) VALUES (?,?,?,?,?,?,?,?,?)");
      seed.weekVariables.forEach((v, i) => variable.run(i, v.date, v.time, v.tz, v.label, v.mark, v.source, v.importance, v.closedBy ?? null));
      const candidate = this.#db.prepare("INSERT OR IGNORE INTO event_candidates (position, id, date, label, questions, decision) VALUES (?,?,?,?,?,?)");
      seed.eventCandidates.forEach((c, i) => candidate.run(i, c.id, c.date, c.label, j(c.questions), c.decision));
      const queue = this.#db.prepare("INSERT OR IGNORE INTO queue (position, piece_id, channel, approved_hash, current_hash, posted_url) VALUES (?,?,?,?,?,?)");
      seed.queue.forEach((q, i) => queue.run(i, q.pieceId, q.channel, q.approvedHash, q.currentHash, q.postedUrl));
      this.#db.exec("INSERT OR IGNORE INTO meta (key, value) VALUES ('seeded', 1)");
      this.#q.bump.run();
      return true;
    });
  }

  // ───────────── StudioRepository (읽기) ─────────────

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

  // ───────────── AuthoringStore (쓰기, [L2]) ─────────────

  async loadPiece(id: string): Promise<Piece | null> {
    const p = await this.getPiece(id);
    if (!p) return null;
    p.approvals = (this.#q.approvals.all(id) as Row[]).map(toApproval);
    return p;
  }

  async findLinkedPosts(preIssueId: string): Promise<Piece[]> {
    return (this.#db.prepare("SELECT * FROM pieces WHERE pre_issue_id = ? AND kind = 'post' ORDER BY slot, position").all(preIssueId) as Row[]).map(toPiece);
  }

  async listPreIssues(): Promise<Piece[]> {
    return (this.#db.prepare("SELECT * FROM pieces WHERE kind = 'pre' ORDER BY slot DESC, position").all() as Row[]).map(toPiece);
  }

  async createPiece(piece: Piece, entry: NewRevision): Promise<number> {
    return this.#tx(() => {
      if (this.#q.piece.get(piece.id)) throw new Error(`이미 있는 편 id: ${piece.id}`);
      this.#insertPiece({ ...piece, revision: 1 }, 1);
      this.#insertRevision(piece.id, 1, entry);
      this.#q.bump.run();
      return 1;
    });
  }

  async savePiece({ piece: p, expectedRevision, entry, approval }: SavePieceCommand): Promise<number> {
    return this.#tx(() => {
      const row = this.#db.prepare("SELECT revision FROM pieces WHERE id = ?").get(p.id) as Row | undefined;
      if (!row) throw new PieceNotFoundError(p.id);
      const actual = Number(row.revision);
      if (actual !== expectedRevision) throw new RevisionConflictError(p.id, expectedRevision, actual);
      const next = actual + 1;
      const res = this.#db
        .prepare("UPDATE pieces SET kind = ?, title = ?, slot = ?, status = ?, gates = ?, blocker = ?, viewpoint = ?, stages = ?, claims = ?, pre_issue_id = ?, cards = ?, hash = ?, structure = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?")
        .run(p.kind, p.title, p.slot, p.status, j(p.gates), p.blocker, p.viewpoint, j(p.stages), j(p.claims), p.preIssueId ?? null, p.cards ? j(p.cards) : null, p.hash ?? null, structureOf(p), next, entry.at, p.id, actual);
      if (Number(res.changes) !== 1) throw new RevisionConflictError(p.id, expectedRevision, actual);
      this.#insertRevision(p.id, next, entry);
      if (approval) this.#insertApproval(p.id, approval);
      // 발행 대기열 — 지금 내용 해시를 따라간다(승인 뒤 바뀌면 「불일치」로 막힌다). G3 승인이면 피드 행을 승인본으로 맞춘다
      const h = shortHash(entry.contentHash);
      this.#db.prepare("UPDATE queue SET current_hash = ? WHERE piece_id = ? AND posted_url IS NULL").run(h, p.id);
      if (approval?.gate === "G3" && approval.decision === "approved") {
        const ah = shortHash(approval.contentHash);
        const updated = this.#db.prepare("UPDATE queue SET approved_hash = ?, current_hash = ? WHERE piece_id = ? AND channel = 'feed' AND posted_url IS NULL").run(ah, h, p.id);
        if (Number(updated.changes) === 0 && !this.#db.prepare("SELECT 1 FROM queue WHERE piece_id = ? AND channel = 'feed'").get(p.id)) {
          const position = Number((this.#db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS n FROM queue").get() as Row).n);
          this.#db.prepare("INSERT INTO queue (position, piece_id, channel, approved_hash, current_hash, posted_url) VALUES (?,?,?,?,?,NULL)").run(position, p.id, "feed", ah, h);
        }
      }
      // [L9] G3 반려·수정 요청 — 승인이 무효가 됐으니 대기열 행은 다시 「G3 필요」(승인 해시를 비운다)
      if (approval?.gate === "G3" && approval.decision === "rejected") this.#db.prepare("UPDATE queue SET approved_hash = NULL WHERE piece_id = ? AND posted_url IS NULL").run(p.id);
      this.#q.bump.run();
      return next;
    });
  }

  async listRevisions(pieceId: string): Promise<RevisionEntry[]> {
    return (this.#db.prepare("SELECT * FROM piece_revisions WHERE piece_id = ? ORDER BY revision").all(pieceId) as Row[]).map(toRevision);
  }

  async getPipeline(pieceId: string): Promise<PipelineRecord | null> {
    const r = this.#db.prepare("SELECT * FROM pipeline_results WHERE piece_id = ?").get(pieceId) as Row | undefined;
    if (!r) return null;
    const parse = <T>(v: unknown): T | null => (v === null || v === undefined ? null : (JSON.parse(str(v)) as T));
    return { pieceId: str(r.piece_id), contentHash: str(r.content_hash), render: parse(r.render), reel: parse(r.reel), bundle: parse(r.bundle), updatedAt: str(r.updated_at) };
  }

  async savePipeline(rec: PipelineRecord): Promise<void> {
    this.#db
      .prepare("INSERT INTO pipeline_results (piece_id, content_hash, render, reel, bundle, updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(piece_id) DO UPDATE SET content_hash = excluded.content_hash, render = excluded.render, reel = excluded.reel, bundle = excluded.bundle, updated_at = excluded.updated_at")
      .run(rec.pieceId, rec.contentHash, rec.render ? j(rec.render) : null, rec.reel ? j(rec.reel) : null, rec.bundle ? j(rec.bundle) : null, rec.updatedAt);
  }

  async countPieces(): Promise<number> {
    return Number((this.#db.prepare("SELECT COUNT(*) AS n FROM pieces").get() as Row).n);
  }

  async seedDemo(): Promise<boolean> {
    return this.#seed(DEFAULT_SEED);
  }

  /** 적용된 스키마 버전(진단용) */
  schemaVersions(): number[] {
    return (this.#db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Row[]).map((r) => Number(r.version));
  }

  close(): void {
    this.#db.close();
  }
}

export function createSqliteStudioRepository(options: SqliteStudioOptions = {}): SqliteStudioRepository {
  return new SqliteStudioRepository(options);
}
