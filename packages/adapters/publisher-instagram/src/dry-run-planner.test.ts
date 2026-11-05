import { describe, expect, it } from "vitest";
import type { BannedExpressionRule, ImageFacts, InstagramPostInput, InstagramReelInput, VideoFacts } from "@yunseo/domain";
import { createInstagramDryRunPlanner } from "./dry-run-planner";

const png = (i: number, patch: Partial<ImageFacts> = {}): ImageFacts => ({ name: `card-${i}.png`, format: "png", width: 1080, height: 1350, bytes: 2_400_000, ...patch });
const jpg = (i: number): ImageFacts => ({ name: `card-${i}.jpg`, format: "jpeg", width: 1080, height: 1350, bytes: 600_000 });
const post = (patch: Partial<InstagramPostInput> = {}): InstagramPostInput => ({
  images: [png(1), png(2), png(3)],
  altTexts: ["설명 1", "설명 2", "설명 3"],
  caption: "본문",
  hashtags: ["economy"],
  aiGenerated: false,
  ...patch,
});
const video = (patch: Partial<VideoFacts> = {}): VideoFacts => ({ name: "reel.mp4", container: "mp4", videoCodec: "h264", fps: 30, width: 1080, height: 1920, durationSec: 30, bytes: 20_000_000, ...patch });
const reel = (patch: Partial<InstagramReelInput> = {}): InstagramReelInput => ({ video: video(), cover: null, caption: "릴스 본문", hashtags: [], aiGenerated: false, shareToFeed: true, ...patch });

const planner = createInstagramDryRunPlanner();
const idList = (steps: { id: string; kind: string; method: string | null }[]) => steps.map((s) => `${s.id}:${s.kind}:${s.method ?? "-"}`);

describe("IG 캐러셀 게시 계획 (스냅샷)", () => {
  const plan = planner.plan({ platform: "instagram", pieceId: "P-1", kind: "post", input: post() });

  it("순서: 한도 확인 → JPEG 변환 → 공개 주소 → 항목 컨테이너 N → 묶음 → 상태 확인 → 게시", () => {
    expect(plan.mode).toBe("dry-run");
    expect(plan.kind).toBe("ig_carousel");
    expect(idList(plan.steps)).toEqual([
      "limit:request:GET",
      "convert:local:-",
      "host:local:-",
      "item-1:request:POST",
      "item-2:request:POST",
      "item-3:request:POST",
      "carousel:request:POST",
      "status:request:GET",
      "publish:request:POST",
    ]);
    expect(plan.steps.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("엔드포인트·파라미터: 항목은 is_carousel_item, 캡션은 묶음에만", () => {
    const step = (id: string) => plan.steps.find((s) => s.id === id)!;
    expect(step("limit")).toMatchObject({ url: "https://graph.facebook.com/v27.0/<IG_USER_ID>/content_publishing_limit", params: { fields: "quota_usage,config" }, needsAuth: true });
    expect(step("convert").params).toEqual({ files: ["card-1.png", "card-2.png", "card-3.png"], format: "JPEG (sRGB)" });
    expect(step("host").params).toEqual({ files: ["card-1.jpg", "card-2.jpg", "card-3.jpg"] });
    expect(step("item-2")).toMatchObject({
      url: "https://graph.facebook.com/v27.0/<IG_USER_ID>/media",
      params: { image_url: "<PUBLIC_URL:card-2.jpg>", is_carousel_item: true, alt_text: "설명 2" },
      dependsOn: ["host"],
      needsAuth: true,
    });
    expect(step("item-2").params).not.toHaveProperty("caption");
    expect(step("carousel").params).toEqual({ media_type: "CAROUSEL", children: ["<ID:item-1>", "<ID:item-2>", "<ID:item-3>"], caption: "본문\n\n#economy", is_ai_generated: false });
    expect(step("carousel").dependsOn).toEqual(["item-1", "item-2", "item-3"]);
    expect(step("status")).toMatchObject({ url: "https://graph.facebook.com/v27.0/<CONTAINER_ID:carousel>", params: { fields: "status_code", poll_every_sec: 60, poll_max_sec: 300 }, dependsOn: ["carousel"] });
    expect(step("publish")).toMatchObject({ url: "https://graph.facebook.com/v27.0/<IG_USER_ID>/media_publish", params: { creation_id: "<ID:carousel>" }, dependsOn: ["status"] });
  });

  it("예상 할당량: 컨테이너 4개(항목 3 + 묶음 1) / 400, 게시 1건 / 50(보수)", () => {
    expect(plan.quota.map((q) => [q.label, q.used, q.limit, q.unit])).toEqual([
      ["컨테이너 생성", 4, 400, "개"],
      ["API 게시", 1, 50, "건"],
    ]);
    expect(plan.summary).toBe("카드 3장 · 캡션 12자(해시태그 포함) · 컨테이너 4개 · 게시 1건");
  });

  it("규격 위반: PNG 3장 → JPEG 변환 경고, 차단 없음", () => {
    expect(plan.issues.map((i) => `${i.severity}:${i.code}`)).toEqual(Array(3).fill("warn:jpeg_conversion_required"));
    expect(plan.blocked).toBe(false);
  });

  it("모든 단계 의존이 앞 단계를 가리킨다", () => {
    const seen = new Set<string>();
    for (const s of plan.steps) {
      for (const d of s.dependsOn) expect(seen.has(d), `${s.id} → ${d}`).toBe(true);
      seen.add(s.id);
    }
  });
});

describe("IG 계획의 변형", () => {
  it("이미 JPEG 면 변환 단계가 없다", () => {
    const plan = planner.plan({ platform: "instagram", pieceId: "P-1", kind: "post", input: post({ images: [jpg(1), jpg(2)], altTexts: ["a", "b"] }) });
    expect(idList(plan.steps)).toEqual(["limit:request:GET", "host:local:-", "item-1:request:POST", "item-2:request:POST", "carousel:request:POST", "status:request:GET", "publish:request:POST"]);
    expect(plan.issues).toEqual([]);
    expect(plan.steps.find((s) => s.id === "host")?.dependsOn).toEqual([]);
  });

  it("카드가 1장이면 캐러셀이 아니라 단일 이미지 — 캡션이 이미지 컨테이너에 붙고 묶음 단계가 없다", () => {
    const plan = planner.plan({ platform: "instagram", pieceId: "P-1", kind: "post", input: post({ images: [jpg(1)], altTexts: ["a"] }) });
    expect(plan.kind).toBe("ig_image");
    expect(idList(plan.steps)).toEqual(["limit:request:GET", "host:local:-", "item-1:request:POST", "status:request:GET", "publish:request:POST"]);
    expect(plan.steps.find((s) => s.id === "item-1")?.params).toEqual({ image_url: "<PUBLIC_URL:card-1.jpg>", caption: "본문\n\n#economy", alt_text: "a", is_ai_generated: false });
    expect(plan.steps.find((s) => s.id === "publish")?.params).toEqual({ creation_id: "<ID:item-1>" });
    expect(plan.quota[0]?.used).toBe(1);
  });

  it("AI 표시를 정하지 않았으면 is_ai_generated 를 넣지 않고 경고한다", () => {
    const plan = planner.plan({ platform: "instagram", pieceId: "P-1", kind: "post", input: post({ images: [jpg(1), jpg(2)], altTexts: ["a", "b"], aiGenerated: null }) });
    expect(plan.steps.find((s) => s.id === "carousel")?.params).not.toHaveProperty("is_ai_generated");
    expect(plan.issues.map((i) => i.code)).toEqual(["ai_disclosure_undecided"]);
  });

  it("21장은 차단 — 계획은 만들되 blocked", () => {
    const images = Array.from({ length: 21 }, (_, i) => jpg(i + 1));
    const plan = planner.plan({ platform: "instagram", pieceId: "P-1", kind: "post", input: post({ images, altTexts: images.map(() => "a") }) });
    expect(plan.blocked).toBe(true);
    expect(plan.issues.map((i) => i.code)).toContain("carousel_too_many");
    expect(plan.quota[0]?.used).toBe(22);
  });

  it("카드가 없으면 단계 없이 차단", () => {
    const plan = planner.plan({ platform: "instagram", pieceId: "P-1", kind: "post", input: post({ images: [], altTexts: [] }) });
    expect(plan.steps).toEqual([]);
    expect(plan.blocked).toBe(true);
    expect(plan.summary).toBe("카드 없음");
  });

  it("프리셋 금지 표현 규칙을 조립부가 넘기면 캡션에 적용한다", () => {
    const rule: BannedExpressionRule = { id: "t-1", terms: ["bannedword"], surfaces: ["body"], severity: "block", origin: "brief", reason: "테스트용 가짜 규칙" };
    const withRules = createInstagramDryRunPlanner({ bannedExpressions: [rule] });
    const plan = withRules.plan({ platform: "instagram", pieceId: "P-1", kind: "post", input: post({ images: [jpg(1), jpg(2)], altTexts: ["a", "b"], caption: "has bannedword" }) });
    expect(plan.blocked).toBe(true);
    expect(planner.plan({ platform: "instagram", pieceId: "P-1", kind: "post", input: post({ images: [jpg(1), jpg(2)], altTexts: ["a", "b"], caption: "has bannedword" }) }).blocked).toBe(false);
  });

  it("Instagram 로그인 방식이면 호스트만 바뀐다", () => {
    const plan = createInstagramDryRunPlanner({ apiHost: "graph.instagram.com" }).plan({ platform: "instagram", pieceId: "P-1", kind: "post", input: post({ images: [jpg(1)], altTexts: ["a"] }) });
    expect(plan.steps.filter((s) => s.url).every((s) => s.url?.startsWith("https://graph.instagram.com/v27.0/"))).toBe(true);
  });

  it("계획 어디에도 실제 주소나 토큰이 없다 — 자리표시자만", () => {
    const plan = planner.plan({ platform: "instagram", pieceId: "P-1", kind: "post", input: post() });
    const text = JSON.stringify(plan);
    expect(text).not.toMatch(/access_token|Bearer|EAA[A-Za-z0-9]/);
    expect(text).toContain("<PUBLIC_URL:card-1.jpg>");
    expect(text).toContain("<IG_USER_ID>");
    expect(plan.steps.filter((s) => s.kind === "local").every((s) => s.url === null && s.method === null && !s.needsAuth)).toBe(true);
  });
});

describe("IG 릴스 게시 계획", () => {
  const plan = planner.plan({ platform: "instagram", pieceId: "P-1", kind: "reel", input: reel() });

  it("순서와 파라미터", () => {
    expect(plan.kind).toBe("ig_reel");
    expect(idList(plan.steps)).toEqual(["limit:request:GET", "host:local:-", "reel:request:POST", "status:request:GET", "publish:request:POST"]);
    expect(plan.steps.find((s) => s.id === "reel")?.params).toEqual({ media_type: "REELS", video_url: "<PUBLIC_URL:reel.mp4>", caption: "릴스 본문", share_to_feed: true, is_ai_generated: false });
    expect(plan.steps.find((s) => s.id === "publish")?.params).toEqual({ creation_id: "<ID:reel>" });
    expect(plan.quota.map((q) => q.used)).toEqual([1, 1]);
    expect(plan.summary).toBe("릴스 30초 · 캡션 5자(해시태그 포함) · 컨테이너 1개 · 게시 1건");
    expect(plan.issues).toEqual([]);
  });

  it("커버가 있으면 cover_url, 길이가 규격 밖이면 차단", () => {
    const withCover = planner.plan({ platform: "instagram", pieceId: "P-1", kind: "reel", input: reel({ cover: { name: "cover.png", format: "png", width: 1080, height: 1920, bytes: 1_000_000 } }) });
    expect(withCover.steps.find((s) => s.id === "reel")?.params).toMatchObject({ cover_url: "<PUBLIC_URL:cover.jpg>" });
    expect(withCover.issues.map((i) => i.code)).toEqual(["jpeg_conversion_required"]);
    const tooLong = planner.plan({ platform: "instagram", pieceId: "P-1", kind: "reel", input: reel({ video: video({ durationSec: 1000 }) }) });
    expect(tooLong.blocked).toBe(true);
  });
});
