// [L2] 렌더 → 미리보기 → 업로드 묶음 — 계약 포트(CardRenderer·ReelComposer·UploadPackager)로만 부른다.
// 포트가 주입되지 않은 단계는 가짜로 채우지 않고 비활성 + 이유를 돌려준다(L1 렌더·L3 릴스는 통합 Worker 가 배선).
// 산출물은 「어떤 내용 해시로 만들었나」와 함께 기록한다 — 내용이 바뀌면 낡은 산출물로 묶음을 만들지 않는다.
import { contentHash, toContentBody, validApproval, type Piece } from "@yunseo/domain";
import type { CardRenderer, CardRenderResult, ContentDocument, ReelComposer, ReelResult, UploadBundle, UploadPackager } from "../pipeline/contracts";
import { PieceNotFoundError, type AuthoringClock, type AuthoringStore, type BundleFiles, type PipelineRecord } from "./ports";

export interface PipelineDeps {
  store: AuthoringStore;
  clock: AuthoringClock;
  /** 없으면 렌더 단계 비활성 */
  renderer?: CardRenderer | null;
  /** 없으면 릴스 단계 비활성(묶음은 릴스 없이 만든다) */
  reels?: ReelComposer | null;
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

export function createPipelineUseCases({ store, clock, renderer = null, reels = null, packager = null, files = null, workDir, language }: PipelineDeps) {
  const load = async (id: string): Promise<Piece> => {
    const p = await store.loadPiece(id);
    if (!p) throw new PieceNotFoundError(id);
    return p;
  };

  const docOf = (p: Piece): { doc: ContentDocument | null; errors: string[] } => {
    const r = toContentBody(p, language ? { language } : {});
    return r.ok ? { doc: { id: p.id, kind: r.kind, schema: r.schema, body: r.body }, errors: [] } : { doc: null, errors: r.errors };
  };

  /** 지금 내용 해시로 만든 산출물만 쓴다 */
  const current = (rec: PipelineRecord | null, hash: string) => (rec && rec.contentHash === hash ? rec : null);

  function plan(p: Piece, rec: PipelineRecord | null): PipelineView {
    const hash = contentHash(p);
    const cur = current(rec, hash);
    const { errors } = docOf(p);
    const renderReason = !renderer ? "카드 렌더러 미주입 — L1 렌더 통합 전" : errors.length ? `렌더 입력 오류 ${errors.length}건: ${errors[0]}` : null;
    const reelReason = !reels ? "릴스 합성기 미주입 — L3 릴스 통합 전" : !cur?.render ? "카드 렌더 먼저" : null;
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

  return {
    async status(id: string): Promise<PipelineView> {
      const p = await load(id);
      return plan(p, await store.getPipeline(id));
    },

    /** 카드 렌더 — 미리보기용이라 승인 전에도 돈다 */
    async render(id: string): Promise<PipelineView> {
      const p = await load(id);
      const prev = await store.getPipeline(id);
      ensure(plan(p, prev), "render");
      const { doc } = docOf(p);
      const result = await renderer!.render(doc!, outDir(p, "cards"));
      if (result.pieceId !== p.id) throw new PipelineStepError("render", `렌더 결과 편 id 불일치: ${result.pieceId}`);
      if (result.altTexts.length !== result.cards.length) throw new PipelineStepError("render", "대체 텍스트 수가 카드 수와 다름");
      // 새 렌더는 낡은 릴스·묶음을 지운다
      await store.savePipeline(record(p, prev, { render: result, reel: null, bundle: null }));
      return plan(p, await store.getPipeline(id));
    },

    async composeReel(id: string): Promise<PipelineView> {
      const p = await load(id);
      const prev = await store.getPipeline(id);
      ensure(plan(p, prev), "reel");
      const reel = await reels!.compose(prev!.render!, outDir(p, "reel"));
      await store.savePipeline(record(p, prev, { reel, bundle: null }));
      return plan(p, await store.getPipeline(id));
    },

    /** 업로드 묶음 — 유효한 G3 승인본 + 지금 내용으로 만든 카드(+ 있으면 릴스) */
    async bundle(id: string): Promise<PipelineView> {
      const p = await load(id);
      const prev = await store.getPipeline(id);
      ensure(plan(p, prev), "bundle");
      const bundle = await packager!.bundle(prev!.render!, prev!.reel ?? null, outDir(p, "bundle"));
      await store.savePipeline(record(p, prev, { bundle }));
      return plan(p, await store.getPipeline(id));
    },

    /** 미리보기 — 지금 내용으로 렌더한 카드 n 번째(0부터) */
    async readRenderedCard(id: string, index: number): Promise<Uint8Array | null> {
      if (!files) return null;
      const p = await load(id);
      const card = current(await store.getPipeline(id), contentHash(p))?.render?.cards[index];
      return card ? files.read(card.path) : null;
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
  };
}

export type PipelineUseCases = ReturnType<typeof createPipelineUseCases>;
