// 조립부(composition root) — 어댑터를 만들고 유스케이스에 꽂는 곳이다. 대시보드에서 어댑터를 import 하는 유일한 파일(04 규칙 4).
// 화면(app/·components/)은 `studio()` 로 유스케이스만 받는다. ESLint 와 tests/import-graph.test.ts 가 이 경계를 지킨다.
import { resolve } from "node:path";
import { createSqliteEventFeed, describeOfficialSources, type SqliteEventFeed } from "@yunseo/adapters-events-calendar";
import { createFileCardAssets } from "@yunseo/adapters-render-html";
import { createSqliteStudioRepository, SEED_TODAY } from "@yunseo/adapters-storage";
import { createEventUseCases, createStudioUseCases, withEventFeed, withReadCache, type Clock, type EventUseCases, type StudioUseCases } from "@yunseo/application";
// [L2] 작성·검수·업로드 묶음 조립에 쓰는 것
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { createBundleFiles, createZipUploadPackager } from "@yunseo/adapters-publisher-manual";
import { type SqliteStudioRepository } from "@yunseo/adapters-storage";
import { createAuthoringUseCases, createPipelineUseCases, type AuthoringUseCases, type PipelineUseCases } from "@yunseo/application";
// [L7] 카드 렌더(L1)·릴스 합성(L3) 조립에 쓰는 것
import { existsSync } from "node:fs";
import { createHtmlCardRenderer } from "@yunseo/adapters-render-html/renderer";
import { PRETENDARD_FAMILY } from "@yunseo/adapters-render-html/fonts";
import { DEFAULT_BINARIES, assertFfmpegReady, createFfmpegReelComposer } from "@yunseo/adapters-video";
import type { CardRenderer, ReelComposer } from "@yunseo/application";
import { DEFAULT_REEL_PRESET } from "@yunseo/domain";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 시안 데이터는 SEED_TODAY 둘레로 짜여 있어 기본은 고정 날짜다. 실제 데이터를 쓸 때 STUDIO_CLOCK=system 으로 KST 오늘을 쓴다 */
function clock(): Clock {
  return process.env.STUDIO_CLOCK === "system" ? { today: () => new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10) } : { today: () => SEED_TODAY };
}

function compose(): StudioUseCases {
  // [L4] 후보함·이번 주의 변수를 수집한 일정에서 채운다(수집한 일정이 없으면 시안 데이터 그대로). 읽기 캐시는 바깥에 씌운다
  const repo = withReadCache(withEventFeed(sqliteRepo(), { feed: eventFeed(), clock: clock() })); // [L2] 쓰기 유스케이스와 같은 연결 — 쓰기마다 revision 이 올라 읽기 캐시가 바로 낡는다
  const here = process.cwd(); // next start 는 apps/dashboard, 저장소 루트에서 띄우면 루트
  const cards = createFileCardAssets({
    renderDirs: [resolve(here, "../../docs/design/card-reference/example/render"), resolve(here, "docs/design/card-reference/example/render")],
    v2Dir: process.env.CARD_V2_DIR,
  });
  return createStudioUseCases({ repo, clock: clock(), cards });
}

// [L4] 일정 수집 — 같은 DB 파일(STUDIO_DB)에 l4_* 테이블을 둔다. 연결은 프로세스에 하나(아래 slot 과 같은 이유)
const l4 = globalThis as typeof globalThis & { __yunseoEventFeed?: SqliteEventFeed; __yunseoEvents?: EventUseCases };

function eventFeed(): SqliteEventFeed {
  const path = process.env.STUDIO_DB;
  return (l4.__yunseoEventFeed ??= createSqliteEventFeed(path ? { path } : {}));
}

/** 수집 현황·판정·수동 입력 유스케이스 (편성 화면의 서버 액션과 /schedule/events 가 쓴다) */
export function events(): EventUseCases {
  return (l4.__yunseoEvents ??= createEventUseCases({
    feed: eventFeed(),
    clock: clock(),
    sources: describeOfficialSources(),
    now: () => new Date().toISOString().replace(/:\d{2}\.\d{3}Z$/, ":00Z"),
    newId: () => globalThis.crypto.randomUUID(),
  }));
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

// ---- [L5] 게시 계획(dry-run)·성과 — 레인 전용 조립. 화면은 `l5()` 로 유스케이스만 받는다.
// 위쪽 조립(compose)·studio() 는 건드리지 않고, 같은 DB 파일(STUDIO_DB)에 l5_* 테이블만 더한다. import 도 이 블록에 묶어 둔다.
import { createSqliteMetricsRepository } from "@yunseo/adapters-metrics";
import { createInstagramDryRunPlanner } from "@yunseo/adapters-publisher-instagram";
import { createYoutubeDryRunPlanner } from "@yunseo/adapters-publisher-youtube";
import { createMetricsUseCases, createPipelinePublishSource, createPublishPlanUseCases, type MetricsUseCases, type PublishPlanUseCases } from "@yunseo/application";
import type { BannedExpressionRule } from "@yunseo/domain";
import { loadPresets } from "@yunseo/presets-schema";

export interface L5 {
  publish: PublishPlanUseCases;
  metrics: MetricsUseCases;
  /** 금지 표현 규칙(프리셋)을 읽었는가 — 못 읽으면 dry-run 이 금지 표현을 검사하지 못한다는 것을 화면이 알린다 */
  rules: { loaded: boolean; count: number; error: string | null };
  /** 성과가 파일(STUDIO_DB)에 남는가. false 면 메모리에만 있어 서버를 끄면 사라진다 */
  persisted: boolean;
}

function composeL5(): L5 {
  const path = process.env.STUDIO_DB;
  const here = process.cwd();
  const repo = sqliteRepo(); // [L2] 작성·검수와 같은 저장소 연결 — 메모리 모드에서도 L5 가 L2 가 만든 콘텐츠를 본다(열 때 시안을 채우지 않으므로 따로 열면 서로 비어 보인다)

  let bannedExpressions: readonly BannedExpressionRule[] = [];
  const rules: L5["rules"] = { loaded: false, count: 0, error: null };
  for (const dir of [resolve(here, "../../presets"), resolve(here, "presets")]) {
    try {
      bannedExpressions = loadPresets(dir).bannedExpressions;
      Object.assign(rules, { loaded: true, count: bannedExpressions.length, error: null });
      break;
    } catch (error) {
      rules.error = error instanceof Error ? error.message.split("\n")[0] ?? "프리셋 오류" : "프리셋 오류";
    }
  }

  return {
    publish: createPublishPlanUseCases({
      repo,
      clock: clock(),
      // [L7] 실제 렌더 결과 — L2 파이프라인이 지금 내용으로 만든 카드(L1)·릴스(L3). 렌더 전인 편은 「산출물 없음」
      source: createPipelinePublishSource({ pipeline: pipeline(), files: createBundleFiles(workDir()) }),
      instagram: createInstagramDryRunPlanner({ bannedExpressions }),
      youtube: createYoutubeDryRunPlanner({ bannedExpressions }),
    }),
    metrics: createMetricsUseCases({ repo, metrics: createSqliteMetricsRepository(path ? { path } : {}), clock: clock() }),
    rules,
    persisted: Boolean(path),
  };
}

const l5Slot = globalThis as typeof globalThis & { __yunseoL5?: L5 };

export function l5(): L5 {
  return (l5Slot.__yunseoL5 ??= composeL5());
}

// [L2] 작성·검수·업로드 묶음 ─────────────────────────────────────────────
// STUDIO_DB(SQLite 파일 경로)를 지정하면 저장이 남고, 없으면 메모리 DB(프로세스가 끝나면 사라짐). 열 때 시안을 채우지 않는다 —
// 「빈 DB 데모 채우기」(콘텐츠 화면 빈 상태 버튼 · pnpm run demo:seed)로만.
// STUDIO_OPERATOR = 이력·게이트 기록의 기본 이름(로그인이 생기기 전), STUDIO_WORK_DIR = 렌더·묶음 산출물 폴더.
// 렌더러(L1)·릴스 합성기(L3)는 아래 [L7] 블록이 꽂는다.
const l2 = globalThis as typeof globalThis & { __yunseoSqlite?: SqliteStudioRepository; __yunseoAuthoring?: AuthoringUseCases; __yunseoPipeline?: PipelineUseCases };

function sqliteRepo(): SqliteStudioRepository {
  const path = process.env.STUDIO_DB;
  return (l2.__yunseoSqlite ??= createSqliteStudioRepository(path ? { path } : {}));
}

/** KST 지금(분 단위 + 시간대) */
const kstNow = () => `${new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 16)}+09:00`;
/** 접두사-YYMMDD-무작위 4자 (예: P-261105-k3x9) */
const nextId = (prefix: string) => `${prefix}-${kstNow().slice(2, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex").slice(0, 4)}`;
const workDir = () => process.env.STUDIO_WORK_DIR ?? resolve(tmpdir(), "yunseo-studio-work");

export function authoring(): AuthoringUseCases {
  return (l2.__yunseoAuthoring ??= createAuthoringUseCases({ store: sqliteRepo(), clock: { now: kstNow }, ids: { next: nextId } }));
}

export function pipeline(): PipelineUseCases {
  const dir = workDir();
  const l7 = composeL7();
  return (l2.__yunseoPipeline ??= createPipelineUseCases({
    store: sqliteRepo(),
    clock: { now: kstNow },
    renderer: l7.renderer,
    reels: l7.reels,
    reelsReady: l7.reelsReady,
    packager: createZipUploadPackager(),
    files: createBundleFiles(dir),
    workDir: dir,
    ...(l7.language ? { language: l7.language } : {}),
  }));
}

// [L7] 통합 — 카드 렌더(L1)·릴스 합성(L3)을 L2 파이프라인에 꽂는다. 프리셋(금지 표현·포맷·브랜드·발행 언어)은 저장소 presets/ 에서 읽는다.
// 서체는 저장소의 Pretendard(packages/adapters/render-html/fonts) — 카드와 릴스 자막이 같은 파일을 쓴다. 시스템 서체를 설치하지 않는다.
// ffmpeg 는 FFMPEG_PATH·FFPROBE_PATH(없으면 PATH 의 ffmpeg) — 없거나 기능이 빠졌으면 릴스 단계만 이유와 함께 비활성(카드·묶음은 계속).
interface L7 {
  renderer: CardRenderer | null;
  reels: ReelComposer | null;
  reelsReady: () => Promise<string | null>;
  language: string | undefined;
  /** 프리셋을 못 읽어 렌더러를 못 만든 이유 */
  error: string | null;
}

const l7Slot = globalThis as typeof globalThis & { __yunseoL7?: L7 };

/** 저장소 루트 — next start 는 apps/dashboard, 저장소 루트에서 띄우면 루트 */
function repoPath(...rel: string[]): string | null {
  const here = process.cwd();
  for (const base of [resolve(here, "../.."), here]) {
    const p = resolve(base, ...rel);
    if (existsSync(p)) return p;
  }
  return null;
}

function composeL7(): L7 {
  if (l7Slot.__yunseoL7) return l7Slot.__yunseoL7;
  const fontsDir = repoPath("packages", "adapters", "render-html", "fonts") ?? undefined;
  const bins = { ffmpegPath: process.env.FFMPEG_PATH || DEFAULT_BINARIES.ffmpegPath, ffprobePath: process.env.FFPROBE_PATH || DEFAULT_BINARIES.ffprobePath };
  const reels = createFfmpegReelComposer({
    ...bins,
    preset: { ...DEFAULT_REEL_PRESET, subtitle: { ...DEFAULT_REEL_PRESET.subtitle, fontName: PRETENDARD_FAMILY, coversHangul: true } },
    ...(fontsDir ? { fontsDir } : {}),
  });
  const reelsReady = () => assertFfmpegReady(bins, { burnIn: true }).then(() => null);
  const presetsDir = repoPath("presets");
  let out: L7;
  try {
    if (!presetsDir) throw new Error("presets 폴더를 찾지 못함");
    const presets = loadPresets(presetsDir);
    out = {
      renderer: createHtmlCardRenderer({
        rules: { banned: presets.bannedExpressions, formats: presets.formats },
        brand: { name: presets.brand.name, operator: presets.character.name },
        ...(fontsDir ? { fontsDir } : {}),
      }),
      reels,
      reelsReady,
      language: presets.language.publish,
      error: null,
    };
  } catch (error) {
    // 프리셋이 깨졌으면 렌더러를 꽂지 않는다 — 파이프라인이 「렌더러 미주입」 으로 비활성 처리한다(금지 표현 검사 없는 렌더 금지)
    out = { renderer: null, reels, reelsReady, language: undefined, error: error instanceof Error ? (error.message.split("\n")[0] ?? "프리셋 오류") : "프리셋 오류" };
  }
  return (l7Slot.__yunseoL7 = out);
}

/** 통합 상태(렌더러를 못 만든 이유) — 화면 안내용 */
export const pipelineSetupError = (): string | null => composeL7().error;

/** 이력·게이트 기록의 기본 이름 */
export const operatorName = (): string => process.env.STUDIO_OPERATOR?.trim() || "운영자";
