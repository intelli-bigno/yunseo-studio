// 작업 목록 — 워커가 돌릴 작업을 여기서 등록부에 넣는다. 다른 레인의 작업은 jobs/<이름>.ts 를 두고 아래에 한 줄을 더한다.
import { createBackupJob, type BackupJobDeps } from "./backup";
import { createCollectEventsJobs, type CollectEventsJobDeps } from "./collect-events";
import { createHealthJob, type HealthJobDeps } from "./health";
import type { JobRegistry } from "../registry";

export interface JobDeps {
  backup: BackupJobDeps | null;
  health: HealthJobDeps;
  /** [L7] 공식 일정 수집(L4) — STUDIO_DB 가 있을 때만. 없으면 등록하지 않는다 */
  events?: CollectEventsJobDeps | null;
  log(message: string): void;
}

export function registerJobs(registry: JobRegistry, deps: JobDeps): JobRegistry {
  // [L6] 운영 작업
  if (deps.backup) registry.register(createBackupJob(deps.backup));
  else deps.log("STUDIO_DB·백업 폴더가 없어 백업 작업을 등록하지 않는다");
  registry.register(createHealthJob(deps.health));
  // (다른 레인 작업은 이 아래에)
  // [L4·L7] 공식 일정 수집 하루 2회
  if (deps.events) for (const job of createCollectEventsJobs(deps.events)) registry.register(job);
  else if (deps.events === null) deps.log("STUDIO_DB 가 없어 일정 수집 작업을 등록하지 않는다");
  return registry;
}
