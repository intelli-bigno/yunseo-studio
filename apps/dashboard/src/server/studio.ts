// 조립부(composition root) — 어댑터를 만들고 유스케이스에 꽂는 곳이다. 대시보드에서 어댑터를 import 하는 유일한 파일(04 규칙 4).
// 화면(app/·components/)은 `studio()` 로 유스케이스만 받는다. ESLint 와 tests/import-graph.test.ts 가 이 경계를 지킨다.
import { resolve } from "node:path";
import { createFileCardAssets } from "@yunseo/adapters-render-html";
import { createSqliteStudioRepository, SEED_TODAY } from "@yunseo/adapters-storage";
import { createStudioUseCases, withReadCache, type Clock, type StudioUseCases } from "@yunseo/application";
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
import { loadPresets } from "@yunseo/presets-schema";
import type { CardRenderer, ReelComposer } from "@yunseo/application";
import { DEFAULT_REEL_PRESET, type ContentRules } from "@yunseo/domain";
// [W3 릴스] 릴스 편집 프로젝트 저장소 조립에 쓰는 것
import { createReelsProjectStore, ReelsRevisionConflictError, type ReelsProjectStore } from "@yunseo/adapters-storage";
// [W5 릴스] 편집 명령 로그·타임라인 합성기 조립에 쓰는 것
import { DatabaseSync } from "node:sqlite";
import { createReelsOpsStore, type ReelsOpsStore } from "@yunseo/adapters-storage";
import { composeTimeline, detectSpeech, probeMedia, type ComposeTimelineOptions } from "@yunseo/adapters-video";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 시안 데이터는 SEED_TODAY 둘레로 짜여 있어 기본은 고정 날짜다. 실제 데이터를 쓸 때 STUDIO_CLOCK=system 으로 KST 오늘을 쓴다 */
function clock(): Clock {
  return process.env.STUDIO_CLOCK === "system" ? { today: () => new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10) } : { today: () => SEED_TODAY };
}

function compose(): StudioUseCases {
  const repo = withReadCache(sqliteRepo()); // [L2] 쓰기 유스케이스와 같은 연결 — 쓰기마다 revision 이 올라 읽기 캐시가 바로 낡는다
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

// [L2] 작성·검수·업로드 묶음 ─────────────────────────────────────────────
// STUDIO_DB(SQLite 파일 경로)를 지정하면 저장이 남고, 없으면 메모리 DB(프로세스가 끝나면 사라짐). 열 때 시안을 채우지 않는다 —
// 「빈 DB 데모 채우기」(콘텐츠 화면 빈 상태 버튼 · pnpm run demo:seed)로만.
// STUDIO_OPERATOR = 이력·게이트 기록의 기본 이름(로그인이 생기기 전), STUDIO_WORK_DIR = 렌더·묶음 산출물 폴더.
// 렌더러(L1)·릴스 합성기(L3)는 아래 [L7] 블록이 꽂는다.
const l2 = globalThis as typeof globalThis & { __yunseoSqlite?: SqliteStudioRepository; __yunseoAuthoring?: AuthoringUseCases; __yunseoPipeline?: PipelineUseCases };

function sqliteRepo(): SqliteStudioRepository {
  const path = process.env.STUDIO_DB;
  // workDir — 옛 기록의 산출물 경로를 지금 작업 폴더로 옮겨 적는 1회 마이그레이션(v3)
  return (l2.__yunseoSqlite ??= createSqliteStudioRepository({ ...(path ? { path } : {}), workDir: workDir() }));
}

/** KST 지금(분 단위 + 시간대) */
const kstNow = () => `${new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 16)}+09:00`;
/** 접두사-YYMMDD-무작위 4자 (예: P-261105-k3x9) */
const nextId = (prefix: string) => `${prefix}-${kstNow().slice(2, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex").slice(0, 4)}`;
const workDir = () => process.env.STUDIO_WORK_DIR ?? resolve(tmpdir(), "yunseo-studio-work");
/** 렌더·묶음 산출물 폴더 — 쇼츠 보관함(server/library.ts)이 읽는다 */
export const studioWorkDir = workDir;

export function authoring(): AuthoringUseCases {
  // [L9] 게이트(G2·G3)가 렌더 전 검사와 같은 규칙(금지 표현·포맷·발행 언어)으로 판단한다 — 프리셋을 못 읽으면 확인 조건만 본다
  const l7 = composeL7();
  return (l2.__yunseoAuthoring ??= createAuthoringUseCases({
    store: sqliteRepo(),
    clock: { now: kstNow },
    ids: { next: nextId },
    document: { rules: l7.rules, ...(l7.language ? { language: l7.language } : {}) },
  }));
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
  /** 렌더 전 검사 규칙(프리셋) — 게이트도 같은 규칙을 쓴다. 프리셋을 못 읽었으면 null */
  rules: ContentRules | null;
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
    const rules: ContentRules = { banned: presets.bannedExpressions, formats: presets.formats };
    out = {
      rules,
      renderer: createHtmlCardRenderer({
        rules,
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
    out = { renderer: null, rules: null, reels, reelsReady, language: undefined, error: error instanceof Error ? (error.message.split("\n")[0] ?? "프리셋 오류") : "프리셋 오류" };
  }
  return (l7Slot.__yunseoL7 = out);
}

/** 통합 상태(렌더러를 못 만든 이유) — 화면 안내용 */
export const pipelineSetupError = (): string | null => composeL7().error;

/** 이력·게이트 기록의 기본 이름 */
export const operatorName = (): string => process.env.STUDIO_OPERATOR?.trim() || "운영자";

// [W3 릴스] 릴스 편집 프로젝트 저장소(레인 전용 테이블 reels_projects) — 원고와 같은 STUDIO_DB 파일, 연결은 따로. 쓰는 곳은 server/reels.ts
export { ReelsRevisionConflictError };
const w3 = globalThis as typeof globalThis & { __yunseoReels?: ReelsProjectStore; __yunseoReelsDb?: DatabaseSync; __yunseoReelsOps?: ReelsOpsStore };
/** STUDIO_DB 가 없을 때 프로젝트 저장소와 op 로그가 같은 메모리 DB 를 쓰게 연결 하나를 나눈다 */
const reelsDbOption = () => {
  const path = process.env.STUDIO_DB;
  return path ? { path } : { db: (w3.__yunseoReelsDb ??= new DatabaseSync(":memory:")) };
};
export function reelsStore(): ReelsProjectStore {
  return (w3.__yunseoReels ??= createReelsProjectStore(reelsDbOption()));
}

// [W5 릴스] 편집 명령 로그(reels_ops)·타임라인 합성기(ffmpeg) — 쓰는 곳은 server/reels-ops.ts
export function reelsOpsStore(): ReelsOpsStore {
  return (w3.__yunseoReelsOps ??= createReelsOpsStore(reelsDbOption()));
}
export function reelsTimelineTools() {
  const bins = { ffmpegPath: process.env.FFMPEG_PATH || DEFAULT_BINARIES.ffmpegPath, ffprobePath: process.env.FFPROBE_PATH || DEFAULT_BINARIES.ffprobePath };
  const fontsDir = repoPath("packages", "adapters", "render-html", "fonts") ?? undefined;
  const preset = { ...DEFAULT_REEL_PRESET, subtitle: { ...DEFAULT_REEL_PRESET.subtitle, fontName: PRETENDARD_FAMILY, coversHangul: true } };
  return {
    assetsDir: repoPath("assets"),
    probe: (file: string) => probeMedia(bins, file),
    detectSpeech: (file: string, opt: { noiseDb: number; minMs: number }, durationMs: number) => detectSpeech(bins, file, opt, durationMs),
    compose: (o: Omit<ComposeTimelineOptions, "bins" | "preset" | "fontsDir">) => composeTimeline({ ...o, bins, preset, ...(fontsDir ? { fontsDir } : {}) }),
  };
}

// [cards] 카드뉴스 편집기 덱 저장 ─────────────────────────────────────────
// 같은 STUDIO_DB 파일의 레인 전용 테이블(cards_decks)을 쓴다 — 연결은 따로(WAL 이라 같은 파일을 함께 열어도 된다). 없으면 메모리.
import { createSqliteCardDeckStore } from "@yunseo/adapters-storage";
import { createCardDeckUseCases, createCardOpsUseCases, type CardDeckStore, type CardDeckUseCases, type CardOpsUseCases } from "@yunseo/application";

const cardsSlot = globalThis as typeof globalThis & { __yunseoCardDecks?: CardDeckUseCases; __yunseoCardOps?: CardOpsUseCases; __yunseoCardStore?: CardDeckStore };

function cardStore(): CardDeckStore {
  const path = process.env.STUDIO_DB;
  return (cardsSlot.__yunseoCardStore ??= createSqliteCardDeckStore(path ? { path } : {}));
}

export function cardDecks(): CardDeckUseCases {
  return (cardsSlot.__yunseoCardDecks ??= createCardDeckUseCases({
    store: cardStore(),
    now: () => new Date().toISOString(),
    newId: () => randomBytes(8).toString("hex"),
  }));
}

/** 덱 편집 명령(docs/13) — 덱 저장소를 같이 쓴다 */
export function cardOps(): CardOpsUseCases {
  return (cardsSlot.__yunseoCardOps ??= createCardOpsUseCases({
    store: cardStore(),
    now: () => new Date().toISOString(),
    newId: () => `l${randomBytes(6).toString("hex")}`,
  }));
}
