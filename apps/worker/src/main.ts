// 워커 진입점(조립부) — 설정을 읽고 어댑터를 만들어 스케줄러·헬스 서버에 꽂는다. 운영 배치는 docs/10-operations.md.
import { SqliteOpsJournal } from "@yunseo/adapters-ops";
import { describeFailure } from "@yunseo/domain";
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
  log(`서버 오류: ${describeFailure(e)}`);
  process.exit(1);
});

let closing = false;
function shutdown(exitCode: number) {
  if (closing) return;
  closing = true;
  void scheduler.stop().finally(() => {
    journal.close();
    server.close(() => process.exit(exitCode));
    setTimeout(() => process.exit(exitCode), 10_000).unref(); // 연결이 안 닫혀도 종료는 보장한다
  });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log(`${signal} — 진행 중 작업을 멈추고 종료`);
    shutdown(0);
  });
}

// 작업 밖에서 터진 오류 — 스케줄러가 잡지 못한 것. 조용히 죽지 않고 이유를 남긴 뒤 정리하고 비정상 종료한다(감독기가 다시 띄운다)
for (const event of ["uncaughtException", "unhandledRejection"] as const) {
  process.on(event, (e: unknown) => {
    log(`처리되지 않은 오류(${event}): ${describeFailure(e)}${e instanceof Error && e.stack ? `\n${e.stack}` : ""}`);
    shutdown(1);
  });
}
