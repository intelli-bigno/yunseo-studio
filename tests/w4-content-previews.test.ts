// [W4] 콘텐츠 목록 썸네일 — 실제 SQLite 에 저장한 파이프라인 기록을 pipeline().previews 가 편마다 읽어 오는지.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPipelineUseCases, NO_PREVIEW, type PipelineRecord } from "../packages/application/src/index";
import { createSqliteStudioRepository } from "../packages/adapters/storage/src/index";
import { contentHash, type Piece } from "../packages/domain/src/index";

const sqlite = createSqliteStudioRepository();
const pipe = createPipelineUseCases({ store: sqlite, clock: { now: () => "2026-11-07T10:00" }, workDir: "work" });
const file = (name: string) => ({ name, path: name, bytes: 1, sha256: "x" });
const record = (p: Piece, over: Partial<PipelineRecord> = {}): PipelineRecord => ({
  pieceId: p.id,
  contentHash: contentHash(p),
  render: { pieceId: p.id, cards: [file("1.png"), file("2.png")], caption: "", hashtags: [], altTexts: ["표지", "본문"], warnings: [] },
  reel: null,
  bundle: null,
  updatedAt: "2026-11-07T10:00",
  ...over,
});

let pieces: Piece[] = [];
beforeAll(async () => {
  await sqlite.seedDemo();
  pieces = await sqlite.listPieces();
});
afterAll(() => sqlite.close());

describe("pipeline.previews", () => {
  it("시안 데이터에 편이 4개 이상 있다(시험 전제)", () => {
    expect(pieces.length).toBeGreaterThanOrEqual(4);
  });

  it("편마다 지금 내용으로 렌더한 카드 수·릴스 유무를 돌려주고, 기록 없음·낡음은 비어 있다", async () => {
    const [fresh, withReel, stale, none] = pieces as [Piece, Piece, Piece, Piece];
    await sqlite.savePipeline(record(fresh));
    await sqlite.savePipeline(record(withReel, { reel: { pieceId: withReel.id, video: file("r.mp4"), durationSec: 10, subtitles: null, warnings: [] } }));
    await sqlite.savePipeline(record(stale, { contentHash: "낡은-해시" }));
    const out = await pipe.previews([fresh, withReel, stale, none]);
    expect(out[fresh.id]).toEqual({ cards: 2, alts: ["표지", "본문"], reel: false });
    expect(out[withReel.id]).toMatchObject({ cards: 2, reel: true });
    expect(out[stale.id]).toEqual(NO_PREVIEW);
    expect(out[none.id]).toEqual(NO_PREVIEW);
  });

  it("편이 없으면 빈 객체", async () => {
    expect(await pipe.previews([])).toEqual({});
  });
});
