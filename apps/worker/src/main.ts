// 워커 진입점(조립부) — 설정을 읽고 어댑터를 만들어 스케줄러·헬스 서버에 꽂는다. 운영 배치는 docs/10-operations.md.
import { SqliteOpsJournal } from "@yunseo/adapters-ops";
import { loadWorkerConfig } from "./config";
import { registerJobs } from "./jobs";
import { JobRegistry } from "./registry";
import { createScheduler } from "./scheduler";
import { createWorkerServer } from "./server";

const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);
const config = loadWorkerConfig(process.env);
const journal = new SqliteOpsJournal(config.dbPath ?? undefined);
const stale = journal.closeStale(new Date());
if (stale) log(`이전 실행에서 끝나지 않은 기록 ${stale}건을 실패로 닫음`);

const registry = registerJobs(new JobRegistry(), {
  backup: config.dbPath && config.backupDir ? { dbPath: config.dbPath, dir: config.backupDir, keep: config.backupKeep } : null,
  events: config.dbPath ? { dbPath: config.dbPath } : null,
  health: { dashboardHealthUrl: config.dashboardHealthUrl, prune: (n) => journal.prune(n) },
  log,
});
const scheduler = createScheduler({ registry, journal, log });
const startedAt = new Date().toISOString();
const server = createWorkerServer(() => ({ status: "ok", app: "worker", startedAt, revision: config.revision, jobs: scheduler.state() }));

server.listen(config.port, config.host, () => {
  log(`worker 대기 중 — http://${config.host}:${config.port}/health (revision ${config.revision ?? "-"}, DB ${config.dbPath ?? "메모리"})`);
  scheduler.start();
  for (const j of scheduler.state()) log(`작업 ${j.name}: ${j.schedule}, 다음 ${j.nextRun ?? "-"}`);
});
server.on("error", (e) => {
  log(`서버 오류: ${e.message}`);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log(`${signal} — 진행 중 작업을 멈추고 종료`);
    void scheduler.stop().finally(() => {
      journal.close();
      server.close(() => process.exit(0));
    });
  });
}
