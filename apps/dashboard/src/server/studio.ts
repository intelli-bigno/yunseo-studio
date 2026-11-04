// 조립부(composition root) — 어댑터를 만들고 유스케이스에 꽂는 곳이다. 대시보드에서 어댑터를 import 하는 유일한 파일(04 규칙 4).
// 화면(app/·components/)은 `studio()` 로 유스케이스만 받는다. ESLint 와 tests/import-graph.test.ts 가 이 경계를 지킨다.
import { resolve } from "node:path";
import { createFileCardAssets } from "@yunseo/adapters-render-html";
import { createSqliteStudioRepository, SEED_TODAY } from "@yunseo/adapters-storage";
import { createStudioUseCases, withReadCache, type Clock, type StudioUseCases } from "@yunseo/application";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 시안 데이터는 SEED_TODAY 둘레로 짜여 있어 기본은 고정 날짜다. 실제 데이터를 쓸 때 STUDIO_CLOCK=system 으로 KST 오늘을 쓴다 */
function clock(): Clock {
  return process.env.STUDIO_CLOCK === "system" ? { today: () => new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10) } : { today: () => SEED_TODAY };
}

function compose(): StudioUseCases {
  const path = process.env.STUDIO_DB; // 지정하면 로컬 SQLite 파일, 없으면 메모리(시안 모드)
  const repo = withReadCache(createSqliteStudioRepository(path ? { path } : {}));
  const here = process.cwd(); // next start 는 apps/dashboard, 저장소 루트에서 띄우면 루트
  const cards = createFileCardAssets({
    renderDirs: [resolve(here, "../../docs/design/card-reference/example/render"), resolve(here, "docs/design/card-reference/example/render")],
    v2Dir: process.env.CARD_V2_DIR,
  });
  return createStudioUseCases({ repo, clock: clock(), cards });
}

// 연결·캐시는 프로세스에 하나만 — 개발 서버가 모듈을 다시 읽어도(HMR) DB 연결이 쌓이지 않게 globalThis 에 둔다.
const slot = globalThis as typeof globalThis & { __yunseoStudio?: StudioUseCases };

export function studio(): StudioUseCases {
  return (slot.__yunseoStudio ??= compose());
}

// [L6] 상시 운영 — 상태 화면(/status)의 조립. 서비스 헬스는 HTTP, 작업 기록은 같은 DB 의 l6_job_runs, 백업·로그는 데이터 폴더.
// 환경변수(서비스 정의 ops/windows/lib/layout.ts 가 넣는다): STUDIO_DB · YUNSEO_DATA_DIR · YUNSEO_WORKER_URL · YUNSEO_DASHBOARD_URL
import { join as joinPath } from "node:path";
import { createDirBackupCatalog, createFileLogSource, createHttpServiceProbe, SqliteOpsJournal } from "@yunseo/adapters-ops";
import { createOpsUseCases, type OpsUseCases } from "@yunseo/application";

function composeOps(): OpsUseCases {
  const env = process.env;
  const dataDir = env.YUNSEO_DATA_DIR || null;
  const health = (base: string | undefined, path: string) => (base ? `${base.replace(/\/+$/, "")}${path}` : null);
  return createOpsUseCases({
    journal: new SqliteOpsJournal(env.STUDIO_DB || undefined),
    backups: createDirBackupCatalog(env.YUNSEO_BACKUP_DIR || (dataDir ? joinPath(dataDir, "backups") : null)),
    logs: createFileLogSource(dataDir ? joinPath(dataDir, "logs") : null, ["worker", "dashboard"]),
    probe: createHttpServiceProbe([
      { name: "dashboard", url: health(env.YUNSEO_DASHBOARD_URL, "/api/health") },
      { name: "worker", url: health(env.YUNSEO_WORKER_URL, "/health") },
    ]),
    clock: { now: () => new Date() },
  });
}

const opsSlot = globalThis as typeof globalThis & { __yunseoOps?: OpsUseCases };

export function ops(): OpsUseCases {
  return (opsSlot.__yunseoOps ??= composeOps());
}
// [/L6]
