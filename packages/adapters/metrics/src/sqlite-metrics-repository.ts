// MetricsRepository 의 SQLite 구현 — 기존 저장소 파일(STUDIO_DB)에 L5 전용 테이블(l5_*)만 더한다. 다른 테이블은 만지지 않는다.
// 외부 연동 없음(수동 입력·CSV). Node 내장 `node:sqlite`.
import { DatabaseSync } from "node:sqlite";
import type { CsvImportLog, MetricsRepository } from "@yunseo/application";
import { isColumnTarget, type ColumnTarget, type MetricPlatform, type MetricSnapshot, type MetricValues, type NewMetricSnapshot } from "@yunseo/domain";

export interface SqliteMetricsOptions {
  /** 파일 경로. 생략하면 메모리 DB(프로세스가 끝나면 사라지는 시안 모드) */
  path?: string;
  /** 기록 시각 — 테스트에서 고정값을 넣는다 */
  now?: () => string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS l5_metric_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  piece_id TEXT NOT NULL, platform TEXT NOT NULL, captured_at TEXT NOT NULL, source TEXT NOT NULL,
  values_json TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL,
  UNIQUE (piece_id, platform, captured_at, source)
);
CREATE INDEX IF NOT EXISTS l5_metric_snapshots_piece ON l5_metric_snapshots (piece_id, platform, captured_at);
CREATE TABLE IF NOT EXISTS l5_csv_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL, captured_at TEXT NOT NULL, rows INTEGER NOT NULL, imported INTEGER NOT NULL, unmatched INTEGER NOT NULL, skipped INTEGER NOT NULL, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS l5_column_mappings (
  platform TEXT NOT NULL, signature TEXT NOT NULL, mapping_json TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (platform, signature)
);
`;

type Row = Record<string, unknown>;
const str = (v: unknown): string => String(v);

function toSnapshot(r: Row): MetricSnapshot {
  return {
    id: str(r.id),
    pieceId: str(r.piece_id),
    platform: str(r.platform) as MetricPlatform,
    capturedAt: str(r.captured_at),
    source: str(r.source) as MetricSnapshot["source"],
    values: JSON.parse(str(r.values_json)) as MetricValues,
    note: str(r.note),
  };
}

export class SqliteMetricsRepository implements MetricsRepository {
  readonly #db: DatabaseSync;
  readonly #now: () => string;

  constructor(options: SqliteMetricsOptions = {}) {
    this.#db = new DatabaseSync(options.path ?? ":memory:");
    this.#now = options.now ?? (() => new Date().toISOString());
    // 같은 파일을 저장소 어댑터·빌드 워커와 함께 연다 — 잠금은 기다리고, 읽기는 쓰기를 막지 않게 WAL.
    this.#db.exec("PRAGMA busy_timeout = 5000");
    if (options.path && options.path !== ":memory:") this.#db.exec("PRAGMA journal_mode = WAL");
    this.#db.exec(SCHEMA);
  }

  async upsertSnapshots(items: readonly NewMetricSnapshot[]): Promise<MetricSnapshot[]> {
    const stmt = this.#db.prepare(
      `INSERT INTO l5_metric_snapshots (piece_id, platform, captured_at, source, values_json, note, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (piece_id, platform, captured_at, source) DO UPDATE SET values_json = excluded.values_json, note = excluded.note, updated_at = excluded.updated_at
       RETURNING *`,
    );
    const at = this.#now();
    const out: MetricSnapshot[] = [];
    this.#db.exec("BEGIN");
    try {
      for (const s of items) out.push(toSnapshot(stmt.get(s.pieceId, s.platform, s.capturedAt, s.source, JSON.stringify(s.values), s.note, at) as Row));
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
    return out;
  }

  async listSnapshots(): Promise<readonly MetricSnapshot[]> {
    return (this.#db.prepare("SELECT * FROM l5_metric_snapshots ORDER BY captured_at, id").all() as Row[]).map(toSnapshot);
  }

  async deleteSnapshot(id: string): Promise<boolean> {
    return Number(this.#db.prepare("DELETE FROM l5_metric_snapshots WHERE id = ?").run(Number(id)).changes) > 0;
  }

  async saveMapping(platform: MetricPlatform, signature: string, mapping: readonly ColumnTarget[]): Promise<void> {
    this.#db
      .prepare(
        `INSERT INTO l5_column_mappings (platform, signature, mapping_json, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (platform, signature) DO UPDATE SET mapping_json = excluded.mapping_json, updated_at = excluded.updated_at`,
      )
      .run(platform, signature, JSON.stringify(mapping), this.#now());
  }

  async loadMapping(platform: MetricPlatform, signature: string): Promise<ColumnTarget[] | null> {
    const row = this.#db.prepare("SELECT mapping_json FROM l5_column_mappings WHERE platform = ? AND signature = ?").get(platform, signature) as Row | undefined;
    if (!row) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(str(row.mapping_json));
    } catch {
      return null; // 손상된 기록은 없는 것으로 본다 — 추정부터 다시
    }
    // 옛 버전의 대상 이름이 들어 있어도 쓰지 않는다
    return Array.isArray(parsed) && parsed.every((t) => typeof t === "string" && isColumnTarget(t)) ? (parsed as ColumnTarget[]) : null;
  }

  async logImport(entry: Omit<CsvImportLog, "id" | "at">): Promise<void> {
    this.#db
      .prepare("INSERT INTO l5_csv_imports (platform, captured_at, rows, imported, unmatched, skipped, at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(entry.platform, entry.capturedAt, entry.rows, entry.imported, entry.unmatched, entry.skipped, this.#now());
  }

  async listImports(limit: number): Promise<CsvImportLog[]> {
    return (this.#db.prepare("SELECT * FROM l5_csv_imports ORDER BY id DESC LIMIT ?").all(limit) as Row[]).map((r) => ({
      id: str(r.id),
      platform: str(r.platform) as MetricPlatform,
      capturedAt: str(r.captured_at),
      rows: Number(r.rows),
      imported: Number(r.imported),
      unmatched: Number(r.unmatched),
      skipped: Number(r.skipped),
      at: str(r.at),
    }));
  }
}

export function createSqliteMetricsRepository(options: SqliteMetricsOptions = {}): MetricsRepository {
  return new SqliteMetricsRepository(options);
}
