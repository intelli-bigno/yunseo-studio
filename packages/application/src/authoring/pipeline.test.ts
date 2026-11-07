// 파이프라인 산출물 읽기 — 기록에 적힌 경로를 그대로 쓰고, 목록 썸네일과 카드 라우트가 같은 판정을 한다.
// 회귀(2026-11-07, 배포본 /content): 네이티브 → Docker 이관 뒤 옛 `C:\Users\…` 기록 때문에 카드 라우트만 404·썸네일은 깨진 이미지.
// 옛 기록 경로는 저장소 마이그레이션 v3(rebase-pipeline-paths)이 한 번 옮겨 적는다(storage 테스트) — 여기서는 읽기 보정을 하지 않음을 본다.
import { contentHash, newPiece, type Piece } from "@yunseo/domain";
import { describe, expect, it, vi } from "vitest";
import type { CardRenderResult, ReelResult, RenderedFile, UploadBundle } from "../pipeline/contracts";
import { createPipelineUseCases } from "./pipeline";
import type { AuthoringStore, BundleFiles, PipelineRecord } from "./ports";

const WORK = "/data/work";
const OLD = "C:\\Users\\yjh99\\AppData\\Local\\Temp\\yunseo-studio-work";

const piece = (): Piece => newPiece({ id: "P-1", kind: "pre", title: "사건 전", slot: "2026-11-06T21:00", viewpoint: "관점 한 문장" });
const hash12 = (p: Piece) => contentHash(p).slice(0, 12);

const file = (name: string, path: string): RenderedFile => ({ name, path, bytes: 3, sha256: "x" });
const CARD_NAMES = ["01-cover.png", "02-why.png", "03-end.png"];

/** 기록 — 경로를 `dir`(지금 작업 폴더 또는 옛 Windows 폴더) 기준으로 적는다. sep 은 그 폴더의 구분자 */
function record(p: Piece, dir: string, sep: "/" | "\\", over: Partial<PipelineRecord> = {}): PipelineRecord {
  const at = (step: string, name: string) => [dir, p.id, hash12(p), step, name].join(sep);
  const render: CardRenderResult = { pieceId: p.id, cards: CARD_NAMES.map((n) => file(n, at("cards", n))), caption: "", hashtags: [], altTexts: ["a", "b", "c"], warnings: [] };
  const reel: ReelResult = { pieceId: p.id, video: file("P-1-reel.mp4", at("reel", "P-1-reel.mp4")), durationSec: 10, subtitles: file("P-1-reel.srt", at("reel", "P-1-reel.srt")), warnings: [] };
  const bundle: UploadBundle = { pieceId: p.id, zip: file("P-1-upload.zip", at("bundle", "P-1-upload.zip")) };
  return { pieceId: p.id, contentHash: contentHash(p), render, reel, bundle, updatedAt: "2026-11-05T12:30+09:00", ...over };
}

/** 어댑터(createBundleFiles)와 같은 규칙의 가짜 — 작업 폴더 밖 경로는 읽지 않는다. disk 에 있는 파일만 존재 */
function fakeFiles(disk: Record<string, string>): BundleFiles {
  const inside = (path: string) => path.startsWith(`${WORK}/`);
  return {
    read: async (path) => (inside(path) && path in disk ? new TextEncoder().encode(disk[path]) : null),
    has: async (path) => inside(path) && path in disk,
  };
}

function setup(p: Piece, rec: PipelineRecord | null, disk: Record<string, string>, extra: Partial<Parameters<typeof createPipelineUseCases>[0]> = {}) {
  const store = { loadPiece: async (id: string) => (id === p.id ? p : null), getPipeline: async () => rec, savePipeline: vi.fn(async () => {}) } as unknown as AuthoringStore;
  return createPipelineUseCases({ store, clock: { now: () => "2026-11-07T10:00+09:00" }, files: fakeFiles(disk), workDir: WORK, ...extra });
}

/** 지금 작업 폴더에 실제로 있는 카드 3장 */
const cardsOnDisk = (p: Piece): Record<string, string> => Object.fromEntries(CARD_NAMES.map((n) => [`${WORK}/${p.id}/${hash12(p)}/cards/${n}`, `png:${n}`]));
const text = (b: Uint8Array | null) => (b ? new TextDecoder().decode(b) : null);

describe("산출물 경로 — 기록 그대로", () => {
  it("카드 라우트: 지금 작업 폴더 안 경로를 읽는다", async () => {
    const p = piece();
    const uc = setup(p, record(p, WORK, "/"), cardsOnDisk(p));
    expect(text(await uc.readRenderedCard(p.id, 0))).toBe("png:01-cover.png");
    expect(text(await uc.readRenderedCard(p.id, 2))).toBe("png:03-end.png");
  });

  it("옛 Windows 절대경로 기록은 읽을 때 보정하지 않는다(마이그레이션 v3 몫) — 작업 폴더 밖이라 null", async () => {
    const p = piece();
    const uc = setup(p, record(p, OLD, "\\"), cardsOnDisk(p));
    expect(await uc.readRenderedCard(p.id, 0)).toBeNull();
    expect((await uc.status(p.id)).render?.cards[0]?.path).toBe([OLD, p.id, hash12(p), "cards", "01-cover.png"].join("\\"));
  });

  it("없는 카드 번호·낡은 해시·기록 없음·파일 없음은 null", async () => {
    const p = piece();
    expect(await setup(p, record(p, WORK, "/"), cardsOnDisk(p)).readRenderedCard(p.id, 3)).toBeNull();
    expect(await setup(p, record(p, WORK, "/", { contentHash: "stale" }), cardsOnDisk(p)).readRenderedCard(p.id, 0)).toBeNull();
    expect(await setup(p, null, cardsOnDisk(p)).readRenderedCard(p.id, 0)).toBeNull();
    expect(await setup(p, record(p, WORK, "/"), {}).readRenderedCard(p.id, 0)).toBeNull();
  });

  it("릴스 합성은 기록의 카드 경로를 합성기에 넘긴다", async () => {
    const p = piece();
    const compose = vi.fn<(cards: CardRenderResult, outDir: string) => Promise<ReelResult>>(async () => record(p, WORK, "/").reel!);
    const uc = setup(p, record(p, WORK, "/", { reel: null, bundle: null }), cardsOnDisk(p), { reels: { compose } });
    await uc.composeReel(p.id);
    expect(compose.mock.calls[0]![0].cards.map((c) => c.path)).toEqual(CARD_NAMES.map((n) => `${WORK}/${p.id}/${hash12(p)}/cards/${n}`));
  });
});

describe("목록 썸네일과 카드 라우트는 같은 판정이다", () => {
  it("파일이 있으면 카드 수를 돌려주고, 그 번호는 모두 라우트로 읽힌다", async () => {
    const p = piece();
    const uc = setup(p, record(p, WORK, "/"), cardsOnDisk(p));
    const pv = (await uc.previews([p]))[p.id]!;
    expect(pv).toEqual({ cards: 3, alts: ["a", "b", "c"], reel: true });
    for (let i = 0; i < pv.cards; i++) expect(await uc.readRenderedCard(p.id, i)).not.toBeNull();
  });

  it("라우트가 못 읽는 카드가 하나라도 있으면 썸네일도 비어 있다(깨진 이미지 금지)", async () => {
    const p = piece();
    const disk = cardsOnDisk(p);
    delete disk[`${WORK}/${p.id}/${hash12(p)}/cards/02-why.png`];
    const uc = setup(p, record(p, WORK, "/"), disk);
    expect((await uc.previews([p]))[p.id]).toMatchObject({ cards: 0, alts: [] });
    expect(await uc.readRenderedCard(p.id, 1)).toBeNull();
  });

  it("파일 읽기 포트가 없으면 라우트가 null 이므로 썸네일도 비어 있다", async () => {
    const p = piece();
    const uc = setup(p, record(p, WORK, "/"), cardsOnDisk(p), { files: null });
    expect((await uc.previews([p]))[p.id]?.cards).toBe(0);
    expect(await uc.readRenderedCard(p.id, 0)).toBeNull();
  });

  it("낡은 해시·기록 없음은 비어 있다", async () => {
    const p = piece();
    expect((await setup(p, record(p, WORK, "/", { contentHash: "stale" }), cardsOnDisk(p)).previews([p]))[p.id]?.cards).toBe(0);
    expect((await setup(p, null, cardsOnDisk(p)).previews([p]))[p.id]?.cards).toBe(0);
  });
});
