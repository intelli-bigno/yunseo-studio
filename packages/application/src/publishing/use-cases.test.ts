import { describe, expect, it } from "vitest";
import type { PublishPlan } from "@yunseo/domain";
import { FakeRepository, piece } from "../fakes";
import type { CardRenderResult, RenderedFile, ReelResult } from "../pipeline/contracts";
import type { InstagramPlanRequest, PublishSource, YoutubePlanRequest } from "./ports";
import { CONTRACT_CARD_SIZE, createPublishPlanUseCases, CONTRACT_REEL_SIZE } from "./use-cases";

const file = (name: string, bytes = 2_400_000): RenderedFile => ({ name, path: `/out/${name}`, bytes, sha256: "0".repeat(64) });
const cards = (n = 3, patch: Partial<CardRenderResult> = {}): CardRenderResult => ({
  pieceId: "P-1",
  cards: Array.from({ length: n }, (_, i) => file(`card-${i + 1}.png`)),
  caption: "본문",
  hashtags: ["#economy", "markets"],
  altTexts: Array.from({ length: n }, (_, i) => `설명 ${i + 1}`),
  warnings: [],
  ...patch,
});
const reel = (patch: Partial<ReelResult> = {}): ReelResult => ({ pieceId: "P-1", video: file("reel.mp4", 20_000_000), durationSec: 30, subtitles: null, warnings: [], ...patch });

const fakePlan = (platform: "instagram" | "youtube", kind: PublishPlan["kind"], pieceId: string): PublishPlan => ({ mode: "dry-run", platform, kind, pieceId, steps: [], quota: [], issues: [], blocked: false, summary: "fake" });

function setup(source: Partial<PublishSource> = {}) {
  const igRequests: InstagramPlanRequest[] = [];
  const ytRequests: YoutubePlanRequest[] = [];
  const repo = new FakeRepository([piece("P-1", { title: "다음 사건의 변수", slot: "2026-11-04T21:00", viewpoint: "핵심 관점 한 문장" })]);
  const uc = createPublishPlanUseCases({
    repo,
    clock: { today: () => "2026-11-08" },
    source: { cards: async () => null, reel: async () => null, ...source },
    instagram: {
      plan: (r) => {
        igRequests.push(r);
        return fakePlan("instagram", r.kind === "post" ? "ig_carousel" : "ig_reel", r.pieceId);
      },
    },
    youtube: {
      plan: (r) => {
        ytRequests.push(r);
        return fakePlan("youtube", "yt_short", r.pieceId);
      },
    },
  });
  return { uc, igRequests, ytRequests };
}

describe("getPublishPreview — 피드(카드)", () => {
  it("카드 결과를 IG 게시 입력으로 옮긴다 — 형식은 확장자, 크기는 계약 값, AI 표시는 사람이 정하도록 null", async () => {
    const { uc, igRequests } = setup({ cards: async () => cards(3, { warnings: ["폰트 대체"] }) });
    const p = await uc.getPublishPreview("P-1", "feed");
    expect(p?.plans).toHaveLength(1);
    expect(p?.notes).toEqual([`이미지 크기는 렌더 계약 값(${CONTRACT_CARD_SIZE.width}x${CONTRACT_CARD_SIZE.height})을 가정했다 — 파일을 열어 잰 값이 아니다.`, "렌더 경고: 폰트 대체"]);
    const req = igRequests[0];
    expect(req).toMatchObject({ platform: "instagram", kind: "post", pieceId: "P-1" });
    if (req?.kind !== "post") throw new Error("post 요청이어야 한다");
    expect(req.input.images).toEqual([
      { name: "card-1.png", format: "png", width: 1080, height: 1350, bytes: 2_400_000 },
      { name: "card-2.png", format: "png", width: 1080, height: 1350, bytes: 2_400_000 },
      { name: "card-3.png", format: "png", width: 1080, height: 1350, bytes: 2_400_000 },
    ]);
    expect(req.input).toMatchObject({ caption: "본문", hashtags: ["#economy", "markets"], altTexts: ["설명 1", "설명 2", "설명 3"], aiGenerated: null });
  });

  it("직접 잰 크기가 있으면 그것을 쓰고 가정 안내를 빼며, 확장자별 형식을 구분한다", async () => {
    const sizes: Record<string, { width: number; height: number }> = { "a.jpg": { width: 1080, height: 1350 }, "b.JPEG": { width: 1440, height: 1800 }, "c.webp": { width: 1080, height: 1350 }, "d.heic": { width: 1080, height: 1350 } };
    const { uc, igRequests } = setup({
      cards: async () => ({ ...cards(0), cards: Object.keys(sizes).map((n) => file(n)), altTexts: [] }),
      imageSize: async (f) => sizes[f.name] ?? null,
    });
    const p = await uc.getPublishPreview("P-1", "feed");
    expect(p?.notes).toEqual([]);
    const req = igRequests[0];
    if (req?.kind !== "post") throw new Error("post 요청이어야 한다");
    expect(req.input.images.map((i) => [i.format, i.width])).toEqual([["jpeg", 1080], ["jpeg", 1440], ["webp", 1080], ["other", 1080]]);
  });

  it("카드 산출물이 없으면 계획 없이 이유만", async () => {
    const { uc, igRequests } = setup();
    const p = await uc.getPublishPreview("P-1", "feed");
    expect(p?.plans).toEqual([]);
    expect(p?.notes).toEqual(["카드 산출물이 없다 — 카드 렌더(L1) 결과가 있어야 게시 계획을 만들 수 있다."]);
    expect(igRequests).toEqual([]);
  });
});

describe("getPublishPreview — 릴스", () => {
  it("IG 릴스 + YouTube Shorts 두 계획 — 영상 크기는 계약 값, 예약 공개는 편성 슬롯(KST)", async () => {
    const { uc, igRequests, ytRequests } = setup({ cards: async () => cards(), reel: async () => reel({ warnings: ["자막 짧음"] }) });
    const p = await uc.getPublishPreview("P-1", "reels");
    expect(p?.plans.map((x) => x.platform)).toEqual(["instagram", "youtube"]);
    expect(p?.notes).toEqual(["합성 경고: 자막 짧음", `영상 크기는 렌더 계약 값(${CONTRACT_REEL_SIZE.width}x${CONTRACT_REEL_SIZE.height})을 가정했고, 코덱·프레임율은 렌더 결과에 없어 검사하지 못한다.`]);

    const ig = igRequests[0];
    if (ig?.kind !== "reel") throw new Error("reel 요청이어야 한다");
    expect(ig.input).toMatchObject({ video: { name: "reel.mp4", container: "mp4", videoCodec: null, fps: null, width: 1080, height: 1920, durationSec: 30, bytes: 20_000_000 }, cover: null, caption: "본문", shareToFeed: true, aiGenerated: null });

    const yt = ytRequests[0];
    expect(yt).toMatchObject({ platform: "youtube", kind: "short", pieceId: "P-1", now: "2026-11-08T00:00:00+09:00" });
    expect(yt?.input).toMatchObject({ title: "다음 사건의 변수", description: "본문", tags: ["economy", "markets"], privacyStatus: "private", publishAt: "2026-11-04T21:00:00+09:00", selfDeclaredMadeForKids: null, containsSyntheticMedia: null });
  });

  it("카드 결과가 없으면 캡션은 편의 핵심 관점으로 대신한다", async () => {
    const { uc, igRequests } = setup({ reel: async () => reel({ video: file("reel.MOV") }) });
    await uc.getPublishPreview("P-1", "reels");
    const ig = igRequests[0];
    if (ig?.kind !== "reel") throw new Error("reel 요청이어야 한다");
    expect(ig.input.caption).toBe("핵심 관점 한 문장");
    expect(ig.input.video.container).toBe("mov");
  });

  it("알 수 없는 확장자는 other", async () => {
    const { uc, igRequests } = setup({ reel: async () => reel({ video: file("reel.avi") }) });
    await uc.getPublishPreview("P-1", "reels");
    const ig = igRequests[0];
    if (ig?.kind !== "reel") throw new Error("reel 요청이어야 한다");
    expect(ig.input.video.container).toBe("other");
  });

  it("릴스 산출물이 없으면 계획 없이 이유만", async () => {
    const { uc } = setup({ cards: async () => cards() });
    const p = await uc.getPublishPreview("P-1", "reels");
    expect(p?.plans).toEqual([]);
    expect(p?.notes).toEqual(["릴스 산출물이 없다 — 릴스 합성(L3) 결과가 있어야 게시 계획을 만들 수 있다."]);
  });
});

describe("getPublishPreview — 그 밖", () => {
  it("스토리는 수동 게시라 계획이 없다", async () => {
    const { uc } = setup();
    const p = await uc.getPublishPreview("P-1", "story");
    expect(p?.plans).toEqual([]);
    expect(p?.notes).toEqual(["스토리는 수동 게시 — 이 화면의 dry-run 대상이 아니다."]);
  });

  it("없는 편은 null", async () => {
    const { uc } = setup();
    expect(await uc.getPublishPreview("NOPE", "feed")).toBeNull();
  });
});
