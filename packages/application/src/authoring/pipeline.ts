// [L2] 렌더 → 미리보기 → 업로드 묶음 — 계약 포트(CardRenderer·ReelComposer·UploadPackager)로만 부른다.
// 포트가 주입되지 않은 단계는 가짜로 채우지 않고 비활성 + 이유를 돌려준다(L1 렌더·L3 릴스는 통합 Worker 가 배선).
// 산출물은 「어떤 내용 해시로 만들었나」와 함께 기록한다 — 내용이 바뀌면 낡은 산출물로 묶음을 만들지 않는다.
import { contentHash, toContentBody, validApproval, type Piece } from "@yunseo/domain";
import type { CardRenderer, CardRenderResult, ContentDocument, ReelComposer, ReelResult, RenderedFile, UploadBundle, UploadPackager } from "../pipeline/contracts";
import { previewOf, type PiecePreview } from "./preview";
import { PieceNotFoundError, type AuthoringClock, type AuthoringStore, type BundleFiles, type PipelineRecord } from "./ports";

export interface PipelineDeps {
  store: AuthoringStore;
  clock: AuthoringClock;
  /** 없으면 렌더 단계 비활성 */
  renderer?: CardRenderer | null;
  /** 없으면 릴스 단계 비활성(묶음은 릴스 없이 만든다) */
  reels?: ReelComposer | null;
  /** [L7] 릴스 합성기를 지금 쓸 수 있나(ffmpeg 점검 등). 이유 문자열이면 릴스 단계만 비활성 — 카드·묶음은 그대로. 프로세스에서 한 번만 부른다 */
  reelsReady?: (() => Promise<string | null>) | null;
  /** 없으면 묶음 단계 비활성 */
  packager?: UploadPackager | null;
  /** 없으면 내려받기 비활성 */
  files?: BundleFiles | null;
  /** 산출물 폴더(편·해시별 하위 폴더를 만든다) */
  workDir: string;
  /** 발행 언어(프리셋) */
  language?: string;
}

export type PipelineStepKey = "render" | "reel" | "bundle";

export interface PipelineStep {
  key: PipelineStepKey;
  enabled: boolean;
  /** 비활성 이유(활성이면 null) */
  reason: string | null;
  /** 지금 내용으로 만든 산출물이 있다 */
  done: boolean;
}

export interface PipelineView {
  pieceId: string;
  contentHash: string;
  steps: PipelineStep[];
  render: CardRenderResult | null;
  reel: ReelResult | null;
  bundle: UploadBundle | null;
  /** 기록된 산출물이 지금 내용과 다른 해시로 만들어졌다 */
  stale: boolean;
  /** 렌더 입력(콘텐츠 정본 본문) 검증 오류 */
  documentErrors: string[];
}

/** 파이프라인 단계를 실행할 수 없음 */
export class PipelineStepError extends Error {
  constructor(
    readonly step: PipelineStepKey,
    readonly reason: string,
  ) {
    super(reason);
    this.name = "PipelineStepError";
  }
}

const join = (...parts: string[]) => parts.map((p, i) => (i === 0 ? p.replace(/[\\/]+$/, "") : p.replace(/^[\\/]+|[\\/]+$/g, ""))).join("/");
/** 구분자를 / 로 통일 — Windows 에서 적힌 기록(`C:\…`)도 같은 방식으로 다룬다 */
const slashed = (s: string) => s.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
const lastSegment = (s: string) => slashed(s).split("/").pop() ?? "";

export function createPipelineUseCases({ store, clock, renderer = null, reels = null, reelsReady = null, packager = null, files = null, workDir, language }: PipelineDeps) {
  let reelCheck: Promise<string | null> | null = null;
  /** 릴스를 못 쓰는 이유(쓸 수 있으면 null) — 점검은 처음 한 번만 */
  const reelGate = (): Promise<string | null> =>
    reels && reelsReady ? (reelCheck ??= reelsReady().catch((e: unknown) => (e instanceof Error ? e.message : String(e)).split("\n")[0] ?? "점검 실패")) : Promise.resolve(null);

  const load = async (id: string): Promise<Piece> => {
    const p = await store.loadPiece(id);
    if (!p) throw new PieceNotFoundError(id);
    return p;
  };

  const docOf = (p: Piece): { doc: ContentDocument | null; errors: string[] } => {
    const r = toContentBody(p, language ? { language } : {});
    return r.ok ? { doc: { id: p.id, kind: r.kind, schema: r.schema, body: r.body }, errors: [] } : { doc: null, errors: r.errors };
  };

  /**
   * 기록에 적힌 산출물 경로를 지금 작업 폴더 기준으로 바로잡는다. 기록은 절대경로로 저장되므로 작업 폴더가 옮겨지면(네이티브 Windows 임시 폴더 →
   * Docker /data/work) 파일은 있어도 기록의 경로는 폴더 밖이라 읽기 어댑터가 거부한다. 산출물은 늘 `<작업 폴더>/<편>/<해시 12자>/<단계>/<이름>` 에
   * 쓰이므로(outDir) 이름만 남기고 같은 자리로 되돌린다. 이미 작업 폴더 안인 경로는 건드리지 않는다.
   */
  const workRoot = slashed(workDir).replace(/\/$/, "");
  const moved = (rec: PipelineRecord, step: "cards" | "reel" | "bundle", f: RenderedFile): RenderedFile =>
    slashed(f.path).startsWith(`${workRoot}/`) ? f : { ...f, path: join(workDir, rec.pieceId, rec.contentHash.slice(0, 12), step, lastSegment(f.path)) };
  const rebase = (rec: PipelineRecord): PipelineRecord => ({
    ...rec,
    render: rec.render && { ...rec.render, cards: rec.render.cards.map((c) => moved(rec, "cards", c)) },
    reel: rec.reel && { ...rec.reel, video: moved(rec, "reel", rec.reel.video), subtitles: rec.reel.subtitles && moved(rec, "reel", rec.reel.subtitles) },
    bundle: rec.bundle && { ...rec.bundle, zip: moved(rec, "bundle", rec.bundle.zip) },
  });

  /** 지금 내용 해시로 만든 산출물만 쓴다(경로는 지금 작업 폴더 기준) — 상태·미리보기·내려받기·묶음이 모두 이 한 곳을 거친다 */
  const current = (rec: PipelineRecord | null, hash: string) => (rec && rec.contentHash === hash ? rebase(rec) : null);

  function plan(p: Piece, rec: PipelineRecord | null, reelBlocked: string | null): PipelineView {
    const hash = contentHash(p);
    const cur = current(rec, hash);
    const { errors } = docOf(p);
    const renderReason = !renderer ? "카드 렌더러 미주입 — L1 렌더 통합 전" : errors.length ? `렌더 입력 오류 ${errors.length}건: ${errors[0]}` : null;
    const reelReason = !reels ? "릴스 합성기 미주입 — L3 릴스 통합 전" : reelBlocked ? `릴스 합성 불가 — ${reelBlocked}` : !cur?.render ? "카드 렌더 먼저" : null;
    const bundleReason = !packager
      ? "업로드 묶음기 미주입"
      : !validApproval(p, "G3")
        ? "G3 승인 전(또는 승인 뒤 내용 변경) — 승인본만 묶는다"
        : !cur?.render
          ? renderer
            ? "카드 렌더 먼저"
            : "카드 렌더러 미주입 — L1 렌더 통합 전이라 묶을 카드가 없음"
          : null;
    return {
      pieceId: p.id,
      contentHash: hash,
      steps: [
        { key: "render", enabled: !renderReason, reason: renderReason, done: !!cur?.render },
        { key: "reel", enabled: !reelReason, reason: reelReason, done: !!cur?.reel },
        { key: "bundle", enabled: !bundleReason, reason: bundleReason, done: !!cur?.bundle },
      ],
      render: cur?.render ?? null,
      reel: cur?.reel ?? null,
      bundle: cur?.bundle ?? null,
      stale: !!rec && rec.contentHash !== hash,
      documentErrors: errors,
    };
  }

  const ensure = (view: PipelineView, key: PipelineStepKey) => {
    const step = view.steps.find((s) => s.key === key)!;
    if (!step.enabled) throw new PipelineStepError(key, step.reason ?? "비활성");
  };

  const record = (p: Piece, prev: PipelineRecord | null, patch: Partial<PipelineRecord>): PipelineRecord => {
    const hash = contentHash(p);
    const base = current(prev, hash) ?? { pieceId: p.id, contentHash: hash, render: null, reel: null, bundle: null, updatedAt: clock.now() };
    return { ...base, ...patch, updatedAt: clock.now() };
  };

  const outDir = (p: Piece, step: string) => join(workDir, p.id, contentHash(p).slice(0, 12), step);

  const api = {
    async status(id: string): Promise<PipelineView> {
      const p = await load(id);
      return plan(p, await store.getPipeline(id), await reelGate());
    },

    /** 카드 렌더 — 미리보기용이라 승인 전에도 돈다 */
    async render(id: string): Promise<PipelineView> {
      const p = await load(id);
      const prev = await store.getPipeline(id);
      ensure(plan(p, prev, null), "render");
      const { doc } = docOf(p);
      const result = await renderer!.render(doc!, outDir(p, "cards"));
      if (result.pieceId !== p.id) throw new PipelineStepError("render", `렌더 결과 편 id 불일치: ${result.pieceId}`);
      if (result.altTexts.length !== result.cards.length) throw new PipelineStepError("render", "대체 텍스트 수가 카드 수와 다름");
      // 새 렌더는 낡은 릴스·묶음을 지운다
      await store.savePipeline(record(p, prev, { render: result, reel: null, bundle: null }));
      return plan(p, await store.getPipeline(id), await reelGate());
    },

    async composeReel(id: string): Promise<PipelineView> {
      const p = await load(id);
      const prev = await store.getPipeline(id);
      ensure(plan(p, prev, await reelGate()), "reel");
      const reel = await reels!.compose(current(prev, contentHash(p))!.render!, outDir(p, "reel"));
      await store.savePipeline(record(p, prev, { reel, bundle: null }));
      return plan(p, await store.getPipeline(id), await reelGate());
    },

    /** 업로드 묶음 — 유효한 G3 승인본 + 지금 내용으로 만든 카드(+ 있으면 릴스) */
    async bundle(id: string): Promise<PipelineView> {
      const p = await load(id);
      const prev = await store.getPipeline(id);
      ensure(plan(p, prev, null), "bundle");
      const cur = current(prev, contentHash(p))!;
      const bundle = await packager!.bundle(cur.render!, cur.reel ?? null, outDir(p, "bundle"));
      await store.savePipeline(record(p, prev, { bundle }));
      return plan(p, await store.getPipeline(id), await reelGate());
    },

    /** 미리보기 — 지금 내용으로 렌더한 카드 n 번째(0부터) */
    async readRenderedCard(id: string, index: number): Promise<Uint8Array | null> {
      if (!files) return null;
      const p = await load(id);
      const card = current(await store.getPipeline(id), contentHash(p))?.render?.cards[index];
      return card ? files.read(card.path) : null;
    },

    /**
     * [W4] 목록 썸네일 — 편마다 지금 내용으로 렌더한 카드 수·릴스 유무. 산출물이 없거나 낡았으면 비어 있다.
     * 카드는 readRenderedCard 와 같은 판정(같은 기록·같은 경로·같은 읽기 포트)으로 읽을 수 있을 때만 센다 —
     * 기록만 믿고 N장이라 해 놓고 이미지는 전부 404 가 되는 일이 없게. 하나라도 못 읽으면 카드는 0(번호가 밀려 엇갈리지 않게 전부 아니면 전무).
     */
    async previews(pieces: readonly Piece[]): Promise<Record<string, PiecePreview>> {
      const out: Record<string, PiecePreview> = {};
      for (const p of pieces) {
        const hash = contentHash(p);
        const rec = current(await store.getPipeline(p.id), hash);
        const pv = previewOf(rec, hash);
        const cards = rec?.render?.cards ?? [];
        const readable = pv.cards === 0 || (!!files && (await Promise.all(cards.map((c) => files.has(c.path)))).every(Boolean));
        out[p.id] = readable ? pv : { cards: 0, alts: [], reel: pv.reel };
      }
      return out;
    },

    /** 내려받기 — 지금 내용·지금 승인으로 만든 묶음만 */
    async readBundle(id: string): Promise<{ name: string; bytes: Uint8Array } | null> {
      if (!files) return null;
      const p = await load(id);
      const cur = current(await store.getPipeline(id), contentHash(p));
      if (!cur?.bundle || !validApproval(p, "G3")) return null;
      const bytes = await files.read(cur.bundle.zip.path);
      return bytes ? { name: cur.bundle.zip.name, bytes } : null;
    },

    /**
     * [L9] 카드 → 릴스 → 묶음(릴스 포함)을 한 번에 — 이미 지금 내용으로 만든 단계는 건너뛰고, 비활성 단계는 이유를 남기고 넘어간다.
     * 카드 렌더가 막히면(입력 오류 등) 그 자리에서 멈춘다. 릴스가 묶음보다 먼저라 묶음에 릴스가 들어간다.
     */
    async runAll(id: string): Promise<PipelineView & { ran: PipelineStepKey[]; skipped: { key: PipelineStepKey; reason: string }[] }> {
      const ran: PipelineStepKey[] = [];
      const skipped: { key: PipelineStepKey; reason: string }[] = [];
      let view = await api.status(id);
      for (const key of PIPELINE_ORDER) {
        const step = view.steps.find((s) => s.key === key)!;
        if (step.done) continue;
        if (!step.enabled) {
          if (key === "render") throw new PipelineStepError(key, step.reason ?? "비활성");
          skipped.push({ key, reason: step.reason ?? "비활성" });
          continue;
        }
        view = key === "render" ? await api.render(id) : key === "reel" ? await api.composeReel(id) : await api.bundle(id);
        ran.push(key);
      }
      return { ...view, ran, skipped };
    },
  };
  return api;
}

/** 단계 순서 — 카드 렌더 → 릴스 → 업로드 묶음(릴스가 있으면 함께 묶는다) */
export const PIPELINE_ORDER: readonly PipelineStepKey[] = ["render", "reel", "bundle"];

export type PipelineUseCases = ReturnType<typeof createPipelineUseCases>;
