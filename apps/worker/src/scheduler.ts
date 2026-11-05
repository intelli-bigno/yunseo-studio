// 스케줄러 — 등록부의 작업을 예정 시각에 돌리고 실행 기록(시작·끝·결과)을 남긴다.
// 타이머는 최대 pollMaxMs(기본 60초)만 기다리고 매번 벽시계를 다시 본다: PC 가 잠들었다 깨거나 시계가 바뀌어도
// 예정 시각을 지나친 작업을 다음 확인 때 바로 돈다(긴 setTimeout 하나에 기대지 않는다).
import type { OpsJobRun, OpsJobState } from "@yunseo/application";
import type { JobDefinition, JobRegistry } from "./registry";
import { describeSchedule, nextRun, previousRun } from "./schedule";

export interface SchedulerJournal {
  start(job: string, at: Date): number;
  finish(id: number, status: "ok" | "failed", at: Date, message: string | null): void;
  lastRun(job: string): OpsJobRun | null;
  lastOk(job: string): OpsJobRun | null;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface SchedulerOptions {
  registry: JobRegistry;
  journal: SchedulerJournal;
  now?: () => Date;
  log?: (message: string) => void;
  /** 놓친 실행을 따라잡기 전 대기(기동 직후 부하·DB 잠금을 피한다). 기본 60초 */
  catchUpDelayMs?: number;
  pollMaxMs?: number;
  timers?: Timers;
}

export interface Scheduler {
  start(): void;
  /** 타이머 콜백 — 예정 시각이 지난 작업을 띄운다. 테스트는 시계를 옮기고 직접 부른다 */
  tick(): void;
  runNow(name: string): Promise<OpsJobRun>;
  state(): OpsJobState[];
  /** 진행 중 작업에 abort 를 보내고 끝나기를 기다린다 */
  stop(): Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 30 * 60_000;

export function createScheduler({
  registry,
  journal,
  now = () => new Date(),
  log = (m) => console.log(m),
  catchUpDelayMs = 60_000,
  pollMaxMs = 60_000,
  timers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) },
}: SchedulerOptions): Scheduler {
  const due = new Map<string, number>();
  const running = new Map<string, { ctrl: AbortController; done: Promise<OpsJobRun> }>();
  let timer: unknown = null;
  let stopped = true;

  function arm() {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
    if (stopped || due.size === 0) return;
    const wait = Math.min(Math.max(Math.min(...due.values()) - now().getTime(), 0), pollMaxMs);
    timer = timers.setTimeout(() => {
      timer = null;
      tick();
    }, wait);
  }

  function execute(def: JobDefinition): Promise<OpsJobRun> {
    const startedAt = now();
    const id = journal.start(def.name, startedAt);
    const ctrl = new AbortController();
    const limit = def.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const done = (async (): Promise<OpsJobRun> => {
      const aborted = new Promise<never>((_, reject) => {
        ctrl.signal.addEventListener("abort", () => reject(new Error(String(ctrl.signal.reason ?? "중단됨"))), { once: true });
      });
      const handle = timers.setTimeout(() => ctrl.abort(`시간 제한 ${Math.round(limit / 1000)}초 초과`), limit);
      let status: "ok" | "failed" = "ok";
      let message: string | null;
      try {
        message = (await Promise.race([def.run({ now, log: (m) => log(`[${def.name}] ${m}`), signal: ctrl.signal }), aborted])) ?? null;
      } catch (e) {
        status = "failed";
        message = e instanceof Error ? e.message : String(e);
        log(`[${def.name}] 실패: ${message}`);
      } finally {
        timers.clearTimeout(handle);
      }
      const finishedAt = now();
      journal.finish(id, status, finishedAt, message);
      running.delete(def.name);
      if (!stopped) {
        due.set(def.name, nextRun(def.schedule, finishedAt).getTime());
        arm();
      }
      return { id, job: def.name, startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), status, message };
    })();
    running.set(def.name, { ctrl, done });
    return done;
  }

  function tick() {
    const t = now().getTime();
    for (const def of registry.list()) {
      const at = due.get(def.name);
      if (at === undefined || at > t) continue;
      if (running.has(def.name)) {
        due.set(def.name, nextRun(def.schedule, new Date(t)).getTime()); // 겹쳐 돌지 않는다 — 다음 격자로 미룬다
        continue;
      }
      due.delete(def.name);
      void execute(def);
    }
    arm();
  }

  return {
    start() {
      stopped = false;
      const t = now();
      for (const def of registry.list()) {
        let next = nextRun(def.schedule, t).getTime();
        if (def.catchUp) {
          const missed = previousRun(def.schedule, t).getTime();
          const ok = journal.lastOk(def.name);
          if (!ok || Date.parse(ok.startedAt) < missed) {
            next = Math.min(next, t.getTime() + catchUpDelayMs);
            log(`[${def.name}] 놓친 실행 따라잡기 예정(마지막 성공: ${ok?.startedAt ?? "없음"})`);
          }
        }
        due.set(def.name, next);
      }
      arm();
    },
    tick,
    runNow(name) {
      const def = registry.get(name);
      if (!def) return Promise.reject(new Error(`등록되지 않은 작업: ${name}`));
      const active = running.get(name);
      return active ? active.done : execute(def);
    },
    state() {
      return registry.list().map((def) => {
        const at = due.get(def.name);
        return {
          name: def.name,
          schedule: describeSchedule(def.schedule),
          lastRun: journal.lastRun(def.name),
          nextRun: running.has(def.name) || at === undefined ? null : new Date(at).toISOString(),
          running: running.has(def.name),
        };
      });
    },
    async stop() {
      stopped = true;
      if (timer !== null) timers.clearTimeout(timer);
      timer = null;
      const active = [...running.values()];
      for (const r of active) r.ctrl.abort("워커 종료");
      await Promise.allSettled(active.map((r) => r.done));
    },
  };
}
