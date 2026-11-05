// 예약 작업 실행 기록 — 같은 DB 파일(STUDIO_DB)의 레인 전용 표 l6_job_runs. storage 어댑터의 표는 건드리지 않는다.
// 워커가 쓰고 대시보드 상태 화면이 읽는다. 두 프로세스가 같은 파일을 열므로 busy_timeout 으로 잠금 대기를 둔다
// (WAL 전환은 storage 어댑터가 파일 DB 를 열 때 이미 한다 — 여기서 저널 모드를 바꾸지 않는다).
import { DatabaseSync } from "node:sqlite";
import type { OpsJobRun, OpsJournal, OpsRunStatus } from "@yunseo/application";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS l6_job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'ok', 'failed')),
  message TEXT
);
CREATE INDEX IF NOT EXISTS l6_job_runs_job ON l6_job_runs (job, id);
`;

type Row = Record<string, unknown>;
const toRun = (r: Row): OpsJobRun => ({
  id: Number(r.id),
  job: String(r.job),
  startedAt: String(r.started_at),
  finishedAt: r.finished_at == null ? null : String(r.finished_at),
  status: String(r.status) as OpsRunStatus,
  message: r.message == null ? null : String(r.message),
});

/** 메시지는 한 줄 요약이다 — 긴 스택은 로그 파일로 보내고 기록에는 앞부분만 남긴다 */
const clip = (s: string | null) => (s == null ? null : s.length > 500 ? `${s.slice(0, 497)}...` : s);

export class SqliteOpsJournal implements OpsJournal {
  readonly #db: DatabaseSync;

  constructor(path?: string) {
    this.#db = new DatabaseSync(path ?? ":memory:");
    this.#db.exec("PRAGMA busy_timeout = 5000");
    this.#db.exec(SCHEMA);
  }

  start(job: string, at: Date): number {
    const r = this.#db.prepare("INSERT INTO l6_job_runs (job, started_at, status) VALUES (?, ?, 'running')").run(job, at.toISOString());
    return Number(r.lastInsertRowid);
  }

  finish(id: number, status: "ok" | "failed", at: Date, message: string | null): void {
    this.#db.prepare("UPDATE l6_job_runs SET status = ?, finished_at = ?, message = ? WHERE id = ?").run(status, at.toISOString(), clip(message), id);
  }

  /** 프로세스가 죽어 「실행 중」으로 남은 기록을 실패로 닫는다(워커 시작 때 한 번) */
  closeStale(at: Date, message = "워커가 다시 시작돼 중단됨"): number {
    const r = this.#db.prepare("UPDATE l6_job_runs SET status = 'failed', finished_at = ?, message = ? WHERE status = 'running'").run(at.toISOString(), message);
    return Number(r.changes);
  }

  lastRun(job: string): OpsJobRun | null {
    const r = this.#db.prepare("SELECT * FROM l6_job_runs WHERE job = ? ORDER BY id DESC LIMIT 1").get(job) as Row | undefined;
    return r ? toRun(r) : null;
  }

  lastOk(job: string): OpsJobRun | null {
    const r = this.#db.prepare("SELECT * FROM l6_job_runs WHERE job = ? AND status = 'ok' ORDER BY id DESC LIMIT 1").get(job) as Row | undefined;
    return r ? toRun(r) : null;
  }

  async recentRuns(limit: number): Promise<readonly OpsJobRun[]> {
    return (this.#db.prepare("SELECT * FROM l6_job_runs ORDER BY id DESC LIMIT ?").all(limit) as Row[]).map(toRun);
  }

  /** 작업마다 최근 keep 개만 남긴다(10분마다 도는 헬스 작업이 표를 키우지 않게) */
  prune(keepPerJob: number): number {
    const r = this.#db
      .prepare("DELETE FROM l6_job_runs WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY job ORDER BY id DESC) AS n FROM l6_job_runs) WHERE n > ?)")
      .run(keepPerJob);
    return Number(r.changes);
  }

  close(): void {
    this.#db.close();
  }
}
