// 워커 설정 — 환경변수를 읽는 유일한 곳(순수 함수로 두어 테스트한다). 비밀값은 없다.
import { isIP } from "node:net";
import { join } from "node:path";
import { AppError } from "@yunseo/domain";

export interface WorkerConfig {
  host: string;
  port: number;
  /** SQLite 파일(STUDIO_DB). 없으면 백업 작업을 등록하지 않고 실행 기록은 메모리에만 */
  dbPath: string | null;
  backupDir: string | null;
  backupKeep: number;
  /** 대시보드 헬스 주소(헬스 작업이 확인). 없으면 확인을 건너뛴다 */
  dashboardHealthUrl: string | null;
  /** 배포된 커밋(감시 프로세스가 넣는다) — /health 에 그대로 보인다 */
  revision: string | null;
}

type Env = Record<string, string | undefined>;
const nonEmpty = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

/**
 * 바인드 주소 검사 — 루프백 또는 Tailscale 주소대(100.64.0.0/10)만 허용한다.
 * 0.0.0.0·:: 처럼 모든 인터페이스에 여는 주소, 공인·사설 LAN 주소는 거부한다(docs/10 §보안 경계).
 */
export function assertSafeHost(host: string): void {
  if (host === "localhost" || host === "::1") return;
  if (isIP(host) !== 4) throw new AppError("CONFIG_INVALID", `바인드 주소는 루프백 또는 Tailnet IPv4 여야 한다: ${host}`);
  const [a, b] = host.split(".").map(Number) as [number, number];
  if (a === 127) return;
  if (a === 100 && b >= 64 && b <= 127) return;
  throw new AppError("CONFIG_INVALID", `바인드 주소가 루프백·Tailnet(100.64.0.0/10) 밖이다: ${host}`);
}

export function loadWorkerConfig(env: Env): WorkerConfig {
  const host = nonEmpty(env.HOST) ?? "127.0.0.1";
  assertSafeHost(host);
  const port = Number(env.PORT ?? 4010);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new AppError("CONFIG_INVALID", `PORT 가 올바르지 않다: ${env.PORT}`);
  const dataDir = nonEmpty(env.YUNSEO_DATA_DIR);
  const keep = Number(env.YUNSEO_BACKUP_KEEP ?? 14);
  if (!Number.isInteger(keep) || keep < 1) throw new AppError("CONFIG_INVALID", `YUNSEO_BACKUP_KEEP 는 1 이상 정수: ${env.YUNSEO_BACKUP_KEEP}`);
  const dashboard = nonEmpty(env.YUNSEO_DASHBOARD_URL);
  return {
    host,
    port,
    dbPath: nonEmpty(env.STUDIO_DB),
    backupDir: nonEmpty(env.YUNSEO_BACKUP_DIR) ?? (dataDir ? join(dataDir, "backups") : null),
    backupKeep: keep,
    dashboardHealthUrl: dashboard ? `${dashboard.replace(/\/+$/, "")}/api/health` : null,
    revision: nonEmpty(env.YUNSEO_REVISION),
  };
}
