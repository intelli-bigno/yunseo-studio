import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SqliteOpsJournal } from "@yunseo/adapters-ops";
import { AppError } from "@yunseo/domain";
import { describe, expect, it } from "vitest";
import { registerJobs } from "./jobs";
import { JobRegistry, type JobDefinition } from "./registry";
import { createScheduler, type Timers } from "./scheduler";
import { daily, every } from "./schedule";

/** 손으로 돌리는 시계·타이머 — 실제 시간을 기다리지 않는다 */
function harness(startIso: string) {
  let t = Date.parse(startIso);
  const armed: { fn: () => void; ms: number; id: number }[] = [];
  let seq = 0;
  const timers: Timers = {
    setTimeout: (fn, ms) => {
      const id = ++seq;
      armed.push({ fn, ms, id });
      return id;
    },
    clearTimeout: (h) => {
      const i = armed.findIndex((a) => a.id === h);
      if (i >= 0) armed.splice(i, 1);
    },
  };
  return {
    now: () => new Date(t),
    set: (iso: string) => (t = Date.parse(iso)),
    timers,
    armed,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function job(name: string, over: Partial<JobDefinition> = {}): JobDefinition & { calls: number } {
  const def = { name, schedule: every(10), calls: 0, async run() { def.calls++; return `${name} 완료`; }, ...over };
  return def;
}

describe("스케줄러", () => {
  it("예정 시각 전에는 안 돌고, 지나면 돌아 기록을 남긴 뒤 다음 시각을 잡는다", async () => {
    const h = harness("2026-11-05T00:03:00Z");
    const journal = new SqliteOpsJournal();
    const j = job("health");
    const s = createScheduler({ registry: new JobRegistry().register(j), journal, now: h.now, timers: h.timers, log: () => {} });
    s.start();
    expect(s.state()[0]).toMatchObject({ nextRun: "2026-11-05T00:10:00.000Z", running: false, lastRun: null });
    expect(h.armed.at(-1)?.ms).toBe(60_000); // 최대 60초씩만 기다리고 다시 본다

    s.tick();
    expect(j.calls).toBe(0);
    h.set("2026-11-05T00:10:05Z");
    s.tick();
    await flush();
    expect(j.calls).toBe(1);
    expect(s.state()[0]).toMatchObject({ nextRun: "2026-11-05T00:20:00.000Z", lastRun: { status: "ok", message: "health 완료" } });
    await s.stop();
  });

  it("실패는 기록되고 다음 실행은 계속 잡힌다", async () => {
    const h = harness("2026-11-05T00:10:00Z");
    const journal = new SqliteOpsJournal();
    const j = job("health", { run: async () => { throw new Error("대시보드 HTTP 502"); } });
    const s = createScheduler({ registry: new JobRegistry().register(j), journal, now: h.now, timers: h.timers, log: () => {} });
    const r = await s.runNow("health");
    expect(r).toMatchObject({ status: "failed", message: "대시보드 HTTP 502" });
    expect(journal.lastRun("health")?.status).toBe("failed");
  });

  it("시간 제한을 넘기면 실패로 닫는다", async () => {
    const h = harness("2026-11-05T00:00:00Z");
    const j = job("slow", { timeoutMs: 1000, run: () => new Promise(() => {}) });
    const s = createScheduler({ registry: new JobRegistry().register(j), journal: new SqliteOpsJournal(), now: h.now, timers: h.timers, log: () => {} });
    const p = s.runNow("slow");
    expect(s.state()[0]?.running).toBe(true);
    h.armed.find((a) => a.ms === 1000)?.fn(); // 제한 타이머 발화
    expect(await p).toMatchObject({ status: "failed", message: "[JOB_TIMEOUT] 시간 제한 1초 초과" });
  });

  it("같은 작업은 겹쳐 돌지 않는다", async () => {
    const h = harness("2026-11-05T00:00:00Z");
    let release!: () => void;
    const j = job("health", { run: () => new Promise<string>((r) => (release = () => r("ok"))) });
    const s = createScheduler({ registry: new JobRegistry().register(j), journal: new SqliteOpsJournal(), now: h.now, timers: h.timers, log: () => {} });
    const a = s.runNow("health");
    const b = s.runNow("health");
    release();
    expect((await a).id).toBe((await b).id);
  });

  it("꺼져 있어 03:30 백업을 놓쳤으면 기동 1분 뒤 따라잡는다", () => {
    const h = harness("2026-11-05T01:00:00Z"); // 10:00 KST — 오늘 03:30 을 지남
    const journal = new SqliteOpsJournal();
    const id = journal.start("backup", new Date("2026-11-03T18:30:00Z")); // 어제치 성공만 있음
    journal.finish(id, "ok", new Date("2026-11-03T18:30:01Z"), null);
    const s = createScheduler({ registry: new JobRegistry().register(job("backup", { schedule: daily("03:30"), catchUp: true })), journal, now: h.now, timers: h.timers, log: () => {} });
    s.start();
    expect(s.state()[0]?.nextRun).toBe("2026-11-05T01:01:00.000Z");
  });

  it("오늘치 백업이 이미 성공했으면 따라잡지 않고 내일 03:30", () => {
    const h = harness("2026-11-05T01:00:00Z");
    const journal = new SqliteOpsJournal();
    journal.finish(journal.start("backup", new Date("2026-11-04T18:30:00Z")), "ok", new Date("2026-11-04T18:30:02Z"), null);
    const s = createScheduler({ registry: new JobRegistry().register(job("backup", { schedule: daily("03:30"), catchUp: true })), journal, now: h.now, timers: h.timers, log: () => {} });
    s.start();
    expect(s.state()[0]?.nextRun).toBe("2026-11-05T18:30:00.000Z");
  });

  it("멈추면 진행 중 작업에 중단 신호를 보낸다", async () => {
    const h = harness("2026-11-05T00:00:00Z");
    let seen: AbortSignal | null = null;
    const j = job("long", { run: ({ signal }) => { seen = signal; return new Promise(() => {}); } });
    const s = createScheduler({ registry: new JobRegistry().register(j), journal: new SqliteOpsJournal(), now: h.now, timers: h.timers, log: () => {} });
    s.start();
    const p = s.runNow("long");
    await s.stop();
    expect((seen as AbortSignal | null)?.aborted).toBe(true);
    expect(await p).toMatchObject({ status: "failed", message: "[JOB_ABORTED] 워커 종료" });
  });

  it("없는 작업을 지금 돌리라고 하면 JOB_NOT_FOUND", async () => {
    const h = harness("2026-11-05T00:00:00Z");
    const s = createScheduler({ registry: new JobRegistry(), journal: new SqliteOpsJournal(), now: h.now, timers: h.timers, log: () => {} });
    await expect(s.runNow("nope")).rejects.toMatchObject({ code: "JOB_NOT_FOUND", status: 404, message: "등록되지 않은 작업: nope" });
  });

  it("AppError 로 실패한 작업은 실행 기록과 로그에 [코드] 가 붙고, 평범한 오류는 메시지만 남는다", async () => {
    const h = harness("2026-11-05T00:00:00Z");
    const logs: string[] = [];
    const bad = job("coded", { run: async () => { throw new AppError("FFMPEG_TIMEOUT", "ffmpeg 가 시간 안에 끝나지 않았다"); } });
    const plain = job("plain", { run: async () => { throw new Error("그냥 실패"); } });
    const journal = new SqliteOpsJournal();
    const s = createScheduler({ registry: new JobRegistry().register(bad).register(plain), journal, now: h.now, timers: h.timers, log: (m) => logs.push(m) });
    expect(await s.runNow("coded")).toMatchObject({ status: "failed", message: "[FFMPEG_TIMEOUT] ffmpeg 가 시간 안에 끝나지 않았다" });
    expect(await s.runNow("plain")).toMatchObject({ status: "failed", message: "그냥 실패" });
    expect(journal.lastRun("coded")?.message).toBe("[FFMPEG_TIMEOUT] ffmpeg 가 시간 안에 끝나지 않았다");
    expect(logs).toContain("[coded] 실패: [FFMPEG_TIMEOUT] ffmpeg 가 시간 안에 끝나지 않았다");
  });
});

describe("작업 등록부", () => {
  it("이름 형식·중복을 거부한다", () => {
    const r = new JobRegistry().register(job("backup"));
    expect(() => r.register(job("backup"))).toThrow(/이미 등록/);
    expect(() => r.register(job("Bad Name"))).toThrow(/형식/);
  });

  it("기본 작업: DB 가 있으면 backup·health, 없으면 health 만", () => {
    const logs: string[] = [];
    const withDb = registerJobs(new JobRegistry(), { backup: { dbPath: "x.db", dir: "b", keep: 14 }, health: { dashboardHealthUrl: null, prune: () => 0 }, log: (m) => logs.push(m) });
    expect(withDb.list().map((d) => d.name)).toEqual(["backup", "health"]);
    const noDb = registerJobs(new JobRegistry(), { backup: null, health: { dashboardHealthUrl: null, prune: () => 0 }, log: (m) => logs.push(m) });
    expect(noDb.list().map((d) => d.name)).toEqual(["health"]);
    expect(logs).toHaveLength(1);
  });

  it("백업 작업을 스케줄러로 돌리면 백업 파일과 성공 기록이 남는다", async () => {
    const d = mkdtempSync(join(tmpdir(), "yunseo-worker-"));
    const dbPath = join(d, "studio.db");
    const db = new DatabaseSync(dbPath);
    db.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('x')");
    db.close();
    const journal = new SqliteOpsJournal(dbPath);
    const h = harness("2026-11-04T18:30:00Z");
    const reg = registerJobs(new JobRegistry(), { backup: { dbPath, dir: join(d, "backups"), keep: 14 }, health: { dashboardHealthUrl: null, prune: (n) => journal.prune(n) }, log: () => {} });
    const s = createScheduler({ registry: reg, journal, now: h.now, timers: h.timers, log: () => {} });
    const r = await s.runNow("backup");
    journal.close();
    expect(r.status).toBe("ok");
    expect(r.message).toMatch(/^studio-20261105-033000\.db · /);
    expect(readdirSync(join(d, "backups"))).toEqual(["studio-20261105-033000.db"]);
  });

  it("헬스 작업 — 대시보드가 200 이 아니면 실패", async () => {
    const h = harness("2026-11-05T00:00:00Z");
    const reg = registerJobs(new JobRegistry(), { backup: null, health: { dashboardHealthUrl: "http://d/api/health", prune: () => 2, fetch: async () => ({ status: 503 }) }, log: () => {} });
    const s = createScheduler({ registry: reg, journal: new SqliteOpsJournal(), now: h.now, timers: h.timers, log: () => {} });
    expect(await s.runNow("health")).toMatchObject({ status: "failed", message: "[UPSTREAM_FAILED] 대시보드 HTTP 503" });
  });
});
