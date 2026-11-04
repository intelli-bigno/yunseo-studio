// Windows 배치 — 경로·포트·작업 이름·서비스 실행 명령을 한곳에서 정한다(순수 함수, 경로는 항상 Windows 형식).
// 근거와 절차는 docs/10-operations.md.
import { win32 } from "node:path";

export const TAILNET_HOST = "100.84.73.107";
export const PORTS = { dashboard: 8930, worker: 8931 } as const;
export const DEFAULT_ROOT = "D:\\Services\\yunseo-studio";
export const TASK_FOLDER = "\\YunseoStudio\\";
export const FIREWALL_RULE = "YunseoStudio Tailnet 8930-8931";
export const BACKUP_KEEP = 14;

export type ServiceName = keyof typeof PORTS;
export const SERVICES: readonly ServiceName[] = ["dashboard", "worker"];

export interface Layout {
  root: string;
  /** git 체크아웃(배포 대상). deploy.sh 가 repo.git 에서 받아 온다 */
  app: string;
  /** Mac 이 push 하는 bare 저장소 */
  repo: string;
  data: string;
  db: string;
  backups: string;
  logs: string;
  /** 잠금·중지 표식·작업 XML */
  run: string;
}

export function layout(root: string = DEFAULT_ROOT): Layout {
  const j = win32.join;
  const data = j(root, "data");
  return { root, app: j(root, "app"), repo: j(root, "repo.git"), data, db: j(data, "studio.db"), backups: j(data, "backups"), logs: j(data, "logs"), run: j(root, "run") };
}

export interface ServiceDef {
  name: ServiceName;
  /** 작업 스케줄러 경로 — 예: \YunseoStudio\Dashboard */
  taskName: string;
  cwd: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  host: string;
  port: number;
  healthUrl: string;
  logFile: string;
  lockFile: string;
  stopFlag: string;
}

export interface ServiceOptions {
  nodeExe: string;
  host?: string;
  revision?: string | null;
}

const title = (s: string) => s[0]!.toUpperCase() + s.slice(1);

export function serviceDef(name: ServiceName, l: Layout, { nodeExe, host = TAILNET_HOST, revision = null }: ServiceOptions): ServiceDef {
  const j = win32.join;
  const url = (svc: ServiceName) => `http://${host}:${PORTS[svc]}`;
  const common: Record<string, string> = { STUDIO_DB: l.db, YUNSEO_DATA_DIR: l.data, ...(revision ? { YUNSEO_REVISION: revision } : {}) };
  const base = {
    name,
    taskName: `${TASK_FOLDER}${title(name)}`,
    command: nodeExe,
    host,
    port: PORTS[name],
    logFile: j(l.logs, `${name}.log`),
    lockFile: j(l.run, `${name}.lock`),
    stopFlag: j(l.run, `${name}.stop`),
  };
  if (name === "dashboard") {
    const cwd = j(l.app, "apps", "dashboard");
    return {
      ...base,
      cwd,
      args: [j(cwd, "node_modules", "next", "dist", "bin", "next"), "start", "-H", host, "-p", String(PORTS.dashboard)],
      env: { ...common, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", YUNSEO_WORKER_URL: url("worker"), YUNSEO_DASHBOARD_URL: url("dashboard") },
      healthUrl: `${url("dashboard")}/api/health`,
    };
  }
  return {
    ...base,
    cwd: j(l.app, "apps", "worker"),
    // tsx 는 저장소 루트 node_modules 에 있다 — cwd(apps/worker)에서 위로 올라가며 찾는다
    args: ["--import", "tsx", "src/main.ts"],
    env: { ...common, NODE_ENV: "production", HOST: host, PORT: String(PORTS.worker), YUNSEO_DASHBOARD_URL: url("dashboard"), YUNSEO_BACKUP_KEEP: String(BACKUP_KEEP) },
    healthUrl: `${url("worker")}/health`,
  };
}
