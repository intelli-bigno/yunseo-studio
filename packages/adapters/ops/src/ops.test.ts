import { appendFileSync, existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  backupName,
  backupSqlite,
  backupTime,
  createDirBackupCatalog,
  createFileLogSource,
  createHttpServiceProbe,
  expiredBackups,
  integrityProblems,
  parseJobs,
  restoreSqlite,
  SqliteOpsJournal,
  tailFile,
} from "./index";

const dirs: string[] = [];
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), "yunseo-ops-"));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0)); // 임시 폴더는 OS 가 치운다 — 테스트에서 지우지 않는다(Windows 잠금 회피)

/** storage 어댑터처럼 WAL 로 연 DB 에 행을 넣는다 */
function seedDb(path: string, values: string[]): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS t (v TEXT)");
  for (const v of values) db.prepare("INSERT INTO t (v) VALUES (?)").run(v);
  return db;
}
const readValues = (path: string) => {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return (db.prepare("SELECT v FROM t ORDER BY rowid").all() as { v: string }[]).map((r) => r.v);
  } finally {
    db.close();
  }
};

describe("백업 이름·보존", () => {
  it("이름은 KST 벽시계 시각, 되읽으면 같은 UTC 시각", () => {
    const at = new Date("2026-11-04T18:30:00.000Z"); // = 11-05 03:30 KST
    expect(backupName(at)).toBe("studio-20261105-033000.db");
    expect(backupTime("studio-20261105-033000.db")).toBe(at.toISOString());
    expect(backupTime("notes.txt")).toBeNull();
  });

  it("최신 14개를 남기고 나머지만 지운다 — 형식이 다른 파일은 건드리지 않는다", () => {
    const names = Array.from({ length: 20 }, (_, i) => `studio-202611${String(i + 1).padStart(2, "0")}-033000.db`);
    const expired = expiredBackups([...names, "manual-copy.db", "studio-20261101-033000.db.partial"], 14);
    expect(expired).toHaveLength(6);
    expect(expired).toEqual(names.slice(0, 6).reverse());
  });

  it("보존 개수가 1 미만이면 거부(전부 지우는 사고 방지)", () => {
    expect(() => expiredBackups([], 0)).toThrow();
  });
});

describe("backupSqlite (VACUUM INTO)", () => {
  it("열린 WAL DB 를 일관되게 복사하고 무결성을 확인한다", () => {
    const d = temp();
    const dbPath = join(d, "studio.db");
    const live = seedDb(dbPath, ["a", "b"]); // 다른 프로세스가 연 채로
    const r = backupSqlite({ dbPath, dir: join(d, "backups"), now: new Date("2026-11-04T18:30:00Z") });
    live.close();
    expect(r.name).toBe("studio-20261105-033000.db");
    expect(r.bytes).toBeGreaterThan(0);
    expect(integrityProblems(r.path)).toEqual([]);
    expect(readValues(r.path)).toEqual(["a", "b"]);
    expect(readdirSync(join(d, "backups"))).toEqual([r.name]); // .partial 이 남지 않는다
  });

  it("15번째 백업에서 가장 오래된 것 하나를 지운다", () => {
    const d = temp();
    const dbPath = join(d, "studio.db");
    seedDb(dbPath, ["x"]).close();
    const dir = join(d, "backups");
    let last = { removed: [] as string[] };
    for (let day = 1; day <= 15; day++) last = backupSqlite({ dbPath, dir, now: new Date(Date.UTC(2026, 10, day, 18, 30)), keep: 14 });
    expect(last.removed).toEqual(["studio-20261102-033000.db"]);
    expect(readdirSync(dir)).toHaveLength(14);
  });

  it("DB 파일이 없으면 빈 DB 를 만들지 않고 실패한다", () => {
    const d = temp();
    expect(() => backupSqlite({ dbPath: join(d, "none.db"), dir: d, now: new Date() })).toThrow(/DB 파일이 없다/);
    expect(existsSync(join(d, "none.db"))).toBe(false);
  });
});

describe("restoreSqlite — 복원 검증", () => {
  it("백업 시점의 내용으로 되돌리고, 지금 DB 는 옆으로 옮겨 둔다", () => {
    const d = temp();
    const dbPath = join(d, "studio.db");
    seedDb(dbPath, ["v1"]).close();
    const b = backupSqlite({ dbPath, dir: join(d, "backups"), now: new Date("2026-11-04T18:30:00Z") });
    const live = seedDb(dbPath, ["v2-after-backup"]);
    live.close();
    expect(readValues(dbPath)).toEqual(["v1", "v2-after-backup"]);

    const r = restoreSqlite({ backupPath: b.path, dbPath, now: new Date("2026-11-05T01:00:00Z") });
    expect(readValues(dbPath)).toEqual(["v1"]);
    expect(integrityProblems(dbPath)).toEqual([]);
    expect(r.setAside[0]).toBe(`${dbPath}.pre-restore-20261105-100000`);
    expect(readValues(r.setAside[0]!)).toEqual(["v1", "v2-after-backup"]);
  });

  it("손상된 백업이면 지금 DB 를 건드리지 않고 실패한다", () => {
    const d = temp();
    const dbPath = join(d, "studio.db");
    seedDb(dbPath, ["keep"]).close();
    const bad = join(d, "studio-20261105-033000.db");
    writeFileSync(bad, "SQLite format 3\0 이건 DB 가 아니다".padEnd(4096, "x"));
    expect(() => restoreSqlite({ backupPath: bad, dbPath, now: new Date() })).toThrow();
    expect(readValues(dbPath)).toEqual(["keep"]);
  });
});

describe("SqliteOpsJournal (l6_job_runs)", () => {
  it("시작·끝 기록, 마지막 성공, 최근 목록", async () => {
    const j = new SqliteOpsJournal();
    const a = j.start("backup", new Date("2026-11-05T00:00:00Z"));
    j.finish(a, "ok", new Date("2026-11-05T00:00:02Z"), "studio-x.db");
    const b = j.start("backup", new Date("2026-11-06T00:00:00Z"));
    j.finish(b, "failed", new Date("2026-11-06T00:00:01Z"), "디스크 가득");
    expect(j.lastRun("backup")?.status).toBe("failed");
    expect(j.lastOk("backup")?.id).toBe(a);
    expect((await j.recentRuns(10)).map((r) => r.id)).toEqual([b, a]);
  });

  it("죽은 프로세스의 「실행 중」 기록을 실패로 닫는다", () => {
    const j = new SqliteOpsJournal();
    const id = j.start("backup", new Date());
    expect(j.closeStale(new Date())).toBe(1);
    expect(j.lastRun("backup")).toMatchObject({ id, status: "failed" });
  });

  it("작업마다 최근 N 개만 남긴다", async () => {
    const j = new SqliteOpsJournal();
    for (let i = 0; i < 5; i++) j.finish(j.start("health", new Date()), "ok", new Date(), null);
    j.finish(j.start("backup", new Date()), "ok", new Date(), null);
    expect(j.prune(2)).toBe(3);
    expect((await j.recentRuns(10)).map((r) => r.job).sort()).toEqual(["backup", "health", "health"]);
  });

  it("같은 DB 파일을 storage 와 함께 써도 자기 표만 만든다", () => {
    const d = temp();
    const path = join(d, "studio.db");
    seedDb(path, ["x"]).close();
    new SqliteOpsJournal(path).close();
    const db = new DatabaseSync(path, { readOnly: true });
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
    db.close();
    expect(tables).toEqual(["l6_job_runs", "t"]);
  });
});

describe("백업 목록·로그 꼬리", () => {
  it("백업 폴더에서 형식에 맞는 파일만 최신순으로", async () => {
    const d = temp();
    for (const n of ["studio-20261104-033000.db", "studio-20261105-033000.db", "readme.txt"]) writeFileSync(join(d, n), "1234");
    const files = await createDirBackupCatalog(d).list();
    expect(files.map((f) => f.name)).toEqual(["studio-20261105-033000.db", "studio-20261104-033000.db"]);
    expect(files[0]?.bytes).toBe(4);
    expect(await createDirBackupCatalog(join(d, "없음")).list()).toEqual([]);
  });

  it("큰 로그도 끝부분만 읽고 마지막 N 줄을 준다", () => {
    const d = temp();
    const f = join(d, "worker.log");
    for (let i = 1; i <= 5000; i++) appendFileSync(f, `줄 ${i}\r\n`);
    const t = tailFile(f, 3, 1024);
    expect(t.lines).toEqual(["줄 4998", "줄 4999", "줄 5000"]);
    expect(t.bytes).toBeGreaterThan(1024);
  });

  it("로그는 정해진 이름만, 없는 파일은 빈 꼬리", async () => {
    const d = temp();
    writeFileSync(join(d, "worker.log"), "하나\n둘\n");
    const tails = await createFileLogSource(d, ["worker", "dashboard"]).tail(10);
    expect(tails).toEqual([
      { name: "worker", lines: ["하나", "둘"], bytes: Buffer.byteLength("하나\n둘\n") },
      { name: "dashboard", lines: [], bytes: 0 },
    ]);
  });
});

describe("서비스 헬스 확인", () => {
  const job = { name: "backup", schedule: "매일 03:30 KST", lastRun: { id: 1, job: "backup", startedAt: "2026-11-05T00:00:00Z", finishedAt: null, status: "ok", message: null }, nextRun: "2026-11-05T18:30:00Z", running: false };

  it("워커 /health 를 읽어 작업 상태까지 가져온다", async () => {
    const probe = createHttpServiceProbe([{ name: "worker", url: "http://w/health" }, { name: "dashboard", url: null }], {
      fetch: async () => ({ ok: true, status: 200, json: async () => ({ status: "ok", revision: "abc123", startedAt: "2026-11-05T00:00:00Z", jobs: [job, { bad: 1 }] }) }),
    });
    const [w, dash] = await probe.probe();
    expect(w).toMatchObject({ ok: true, revision: "abc123", jobs: [{ name: "backup", nextRun: "2026-11-05T18:30:00Z" }] });
    expect(w?.jobs).toHaveLength(1);
    expect(dash).toMatchObject({ ok: false, detail: "주소 미설정" });
  });

  it("연결 실패·시간 초과는 ok=false 와 사유", async () => {
    const probe = createHttpServiceProbe([{ name: "worker", url: "http://w/health" }], {
      timeoutMs: 20,
      fetch: (_url, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
    });
    expect((await probe.probe())[0]).toMatchObject({ ok: false, detail: "응답 없음(20ms 초과)" });
  });

  it("jobs 가 배열이 아니면 빈 목록", () => {
    expect(parseJobs(null)).toEqual([]);
    expect(parseJobs([{ name: "x", lastRun: { id: "bad" } }])).toEqual([{ name: "x", schedule: "", lastRun: null, nextRun: null, running: false }]);
  });
});
