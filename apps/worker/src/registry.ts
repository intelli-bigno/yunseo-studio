// 작업 등록부 — 다른 레인(렌더·게시·지표 수집 등)이 작업 본문을 넣는 입구. 스케줄러는 등록된 것만 돌린다.
// 새 작업은 jobs/ 에 파일 하나를 두고 jobs/index.ts 의 registerJobs() 에 한 줄을 더한다.
import type { Schedule } from "./schedule";

export interface JobContext {
  now(): Date;
  log(message: string): void;
  /** 시간 제한을 넘기거나 워커가 멈추면 abort 된다 — 오래 도는 작업은 이 신호를 확인한다 */
  signal: AbortSignal;
}

export interface JobDefinition {
  /** 소문자·숫자·하이픈. 실행 기록(l6_job_runs.job)의 키 */
  name: string;
  schedule: Schedule;
  /** 꺼져 있는 동안 예정 시각을 놓쳤으면 시작 직후 한 번 따라잡아 돈다(백업처럼 「하루 한 번은 꼭」인 작업) */
  catchUp?: boolean;
  /** 기본 30분 */
  timeoutMs?: number;
  /** 돌려준 문자열은 실행 기록의 한 줄 요약. throw 하면 실패로 기록된다 */
  run(ctx: JobContext): Promise<string | void>;
}

const NAME = /^[a-z][a-z0-9-]{0,39}$/;

export class JobRegistry {
  readonly #jobs = new Map<string, JobDefinition>();

  register(def: JobDefinition): this {
    if (!NAME.test(def.name)) throw new Error(`작업 이름 형식이 아니다(소문자·숫자·하이픈): ${def.name}`);
    if (this.#jobs.has(def.name)) throw new Error(`이미 등록된 작업: ${def.name}`);
    if (def.timeoutMs !== undefined && !(def.timeoutMs > 0)) throw new Error(`시간 제한은 0보다 커야 한다: ${def.name}`);
    this.#jobs.set(def.name, def);
    return this;
  }

  get(name: string): JobDefinition | undefined {
    return this.#jobs.get(name);
  }

  list(): JobDefinition[] {
    return [...this.#jobs.values()];
  }
}
