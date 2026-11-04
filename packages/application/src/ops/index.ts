// [L6] 상시 운영 — 상태 화면(서비스·예약 작업·백업·로그)이 쓰는 포트·읽기 모델·유스케이스.
// 파일·HTTP·DB 는 전부 포트 뒤에 있다(04 규칙 2). 구현은 @yunseo/adapters-ops, 조립은 apps(대시보드 server/studio.ts·워커 main.ts).

export type OpsRunStatus = "running" | "ok" | "failed";

/** 예약 작업 한 번의 실행 기록 */
export interface OpsJobRun {
  id: number;
  job: string;
  /** ISO 8601 (UTC) */
  startedAt: string;
  finishedAt: string | null;
  status: OpsRunStatus;
  /** 한 줄 결과(성공: 요약, 실패: 오류 메시지) */
  message: string | null;
}

/** 등록된 작업의 현재 상태(워커 /health 가 내보내는 모양) */
export interface OpsJobState {
  name: string;
  /** 사람이 읽는 일정 — 예: "매일 03:30 KST" */
  schedule: string;
  lastRun: OpsJobRun | null;
  /** 다음 실행 예정 ISO 시각. 실행 중이거나 일정이 없으면 null */
  nextRun: string | null;
  running: boolean;
}

export interface OpsServiceStatus {
  name: string;
  url: string | null;
  ok: boolean;
  /** 응답 요약 또는 실패 사유 */
  detail: string;
  revision: string | null;
  startedAt: string | null;
  jobs: OpsJobState[];
}

export interface OpsBackupFile {
  name: string;
  bytes: number;
  /** 파일 이름의 시각(KST)을 ISO(UTC)로 바꾼 값 */
  createdAt: string;
}

export interface OpsLogTail {
  name: string;
  lines: string[];
  /** 파일 전체 크기(회전 전) */
  bytes: number;
}

export interface OpsJournal {
  recentRuns(limit: number): Promise<readonly OpsJobRun[]>;
}

export interface OpsBackupCatalog {
  /** 백업 폴더 위치(표시용). 설정이 없으면 null */
  location(): string | null;
  /** 최신순 */
  list(): Promise<readonly OpsBackupFile[]>;
}

export interface OpsLogSource {
  tail(lines: number): Promise<readonly OpsLogTail[]>;
}

export interface OpsServiceProbe {
  probe(): Promise<readonly OpsServiceStatus[]>;
}

export interface OpsClock {
  now(): Date;
}

export interface OpsStatusView {
  checkedAt: string;
  services: OpsServiceStatus[];
  jobs: OpsJobState[];
  runs: OpsJobRun[];
  backups: { location: string | null; files: OpsBackupFile[]; totalBytes: number };
  logs: OpsLogTail[];
  summary: {
    servicesUp: number;
    servicesTotal: number;
    failedRuns24h: number;
    /** 마지막 백업 뒤 지난 시간(시간 단위, 내림). 백업이 없으면 null */
    backupAgeHours: number | null;
  };
}

export interface OpsDeps {
  journal: OpsJournal;
  backups: OpsBackupCatalog;
  logs: OpsLogSource;
  probe: OpsServiceProbe;
  clock: OpsClock;
}

export interface OpsUseCases {
  getOpsStatus(options?: { runs?: number; logLines?: number }): Promise<OpsStatusView>;
}

const HOUR_MS = 3_600_000;

export function createOpsUseCases(deps: OpsDeps): OpsUseCases {
  return {
    async getOpsStatus({ runs: runLimit = 30, logLines = 40 } = {}) {
      const now = deps.clock.now();
      const [services, runs, files, logs] = await Promise.all([deps.probe.probe(), deps.journal.recentRuns(runLimit), deps.backups.list(), deps.logs.tail(logLines)]);
      const since = now.getTime() - 24 * HOUR_MS;
      const latest = files[0];
      return {
        checkedAt: now.toISOString(),
        services: [...services],
        jobs: services.flatMap((s) => s.jobs),
        runs: [...runs],
        backups: { location: deps.backups.location(), files: [...files], totalBytes: files.reduce((n, f) => n + f.bytes, 0) },
        logs: [...logs],
        summary: {
          servicesUp: services.filter((s) => s.ok).length,
          servicesTotal: services.length,
          failedRuns24h: runs.filter((r) => r.status === "failed" && Date.parse(r.startedAt) >= since).length,
          backupAgeHours: latest ? Math.max(0, Math.floor((now.getTime() - Date.parse(latest.createdAt)) / HOUR_MS)) : null,
        },
      };
    },
  };
}
