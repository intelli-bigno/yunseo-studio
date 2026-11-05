import { describe, expect, it } from "vitest";
import type { BannedExpressionRule } from "../compliance";
import { checkInstagramPost, checkInstagramReel, checkYoutubeUpload, composeInstagramCaption, isBlocked, youtubeTagsLength } from "./index";
import type { ImageFacts, InstagramPostInput, InstagramReelInput, SpecIssue, VideoFacts, YoutubeUploadInput } from "./index";

const card = (i: number, patch: Partial<ImageFacts> = {}): ImageFacts => ({ name: `card-${i}.png`, format: "png", width: 1080, height: 1350, bytes: 2_400_000, ...patch });
const jpg = (i: number, patch: Partial<ImageFacts> = {}): ImageFacts => card(i, { name: `card-${i}.jpg`, format: "jpeg", bytes: 600_000, ...patch });
const post = (patch: Partial<InstagramPostInput> = {}): InstagramPostInput => ({
  images: Array.from({ length: 7 }, (_, i) => card(i + 1)),
  altTexts: Array.from({ length: 7 }, (_, i) => `카드 ${i + 1} 설명`),
  caption: "다음 사건의 변수를 정리했습니다.",
  hashtags: ["economy", "#markets"],
  aiGenerated: false,
  ...patch,
});
const reelVideo = (patch: Partial<VideoFacts> = {}): VideoFacts => ({ name: "reel.mp4", container: "mp4", videoCodec: "h264", fps: 30, width: 1080, height: 1920, durationSec: 30, bytes: 20_000_000, ...patch });
const reel = (patch: Partial<InstagramReelInput> = {}): InstagramReelInput => ({ video: reelVideo(), cover: null, caption: "릴스 캡션", hashtags: [], aiGenerated: false, shareToFeed: true, ...patch });
const yt = (patch: Partial<YoutubeUploadInput> = {}): YoutubeUploadInput & { now: string } => ({
  video: reelVideo(),
  title: "다음 사건의 변수",
  description: "설명",
  tags: ["economy", "markets"],
  privacyStatus: "private",
  publishAt: null,
  selfDeclaredMadeForKids: false,
  containsSyntheticMedia: false,
  now: "2026-11-05T00:00:00Z",
  ...patch,
});

const codes = (issues: readonly SpecIssue[]) => issues.map((i) => i.code);
const sev = (issues: readonly SpecIssue[], code: string) => issues.find((i) => i.code === code)?.severity;

const synthetic: BannedExpressionRule = { id: "t-1", terms: ["bannedword"], surfaces: ["body", "brand_promo"], severity: "block", origin: "brief", reason: "테스트용 가짜 규칙" };
const syntheticWarn: BannedExpressionRule = { id: "t-2", terms: ["cautionword"], surfaces: ["body"], severity: "warn", origin: "proposed", reason: "테스트용 가짜 규칙" };

describe("캡션 합성", () => {
  it("해시태그는 # 를 하나만 붙여 두 줄 뒤에 잇는다", () => {
    expect(composeInstagramCaption("본문", ["a", "#b", "##c"])).toBe("본문\n\n#a #b #c");
    expect(composeInstagramCaption("본문", [])).toBe("본문");
  });
});

describe("Instagram 캐러셀 규격 위반 표", () => {
  it("우리 카드 7장(1080x1350 PNG)은 JPEG 변환 경고만 7건 — 차단은 없다", () => {
    const issues = checkInstagramPost(post());
    expect(codes(issues)).toEqual(Array(7).fill("jpeg_conversion_required"));
    expect(issues.every((i) => i.severity === "warn")).toBe(true);
    expect(isBlocked(issues)).toBe(false);
  });

  it("JPEG 로 바꾸면 위반이 없다", () => {
    expect(checkInstagramPost(post({ images: Array.from({ length: 7 }, (_, i) => jpg(i + 1)) }))).toEqual([]);
  });

  it("20장까지 통과, 21장은 차단", () => {
    const many = (n: number) => post({ images: Array.from({ length: n }, (_, i) => jpg(i + 1)), altTexts: Array.from({ length: n }, () => "설명") });
    expect(codes(checkInstagramPost(many(20)))).not.toContain("carousel_too_many");
    const over = checkInstagramPost(many(21));
    expect(sev(over, "carousel_too_many")).toBe("block");
  });

  it("이미지가 없으면 차단", () => {
    expect(sev(checkInstagramPost(post({ images: [], altTexts: [] })), "no_images")).toBe("block");
  });

  it("4:5 는 통과, 4:5 보다 세로로 길면 차단, 1.91:1 보다 가로로 길면 차단", () => {
    const one = (w: number, h: number) => checkInstagramPost(post({ images: [jpg(1, { width: w, height: h })], altTexts: ["설명"] }));
    expect(codes(one(1080, 1350))).not.toContain("image_aspect_out_of_range");
    expect(codes(one(1440, 754))).not.toContain("image_aspect_out_of_range"); // 1.91
    expect(sev(one(1080, 1351), "image_aspect_out_of_range")).toBe("block");
    expect(sev(one(1080, 2160), "image_aspect_out_of_range")).toBe("block");
    expect(sev(one(1440, 700), "image_aspect_out_of_range")).toBe("block");
  });

  it("폭이 320~1440 밖이면 경고(자동 조정)", () => {
    const one = (w: number, h: number) => checkInstagramPost(post({ images: [jpg(1, { width: w, height: h })], altTexts: ["설명"] }));
    expect(sev(one(2000, 2500), "image_width_scaled")).toBe("warn");
    expect(sev(one(200, 250), "image_width_scaled")).toBe("warn");
    expect(codes(one(1440, 1800))).not.toContain("image_width_scaled");
  });

  it("용량: JPEG 8MB 초과는 차단, PNG 는 변환 뒤 재확인 경고", () => {
    const j = checkInstagramPost(post({ images: [jpg(1, { bytes: 8_000_001 })], altTexts: ["설명"] }));
    expect(sev(j, "image_too_large")).toBe("block");
    const p = checkInstagramPost(post({ images: [card(1, { bytes: 9_000_000 })], altTexts: ["설명"] }));
    expect(sev(p, "image_too_large")).toBe("warn");
  });

  it("장마다 비율이 다르면 첫 장 비율로 잘린다는 경고", () => {
    const issues = checkInstagramPost(post({ images: [jpg(1), jpg(2, { width: 1080, height: 1080 })], altTexts: ["a", "b"] }));
    expect(sev(issues, "carousel_aspect_mixed")).toBe("warn");
  });

  it("대체 텍스트: 없으면 경고, 1,000자 초과는 차단", () => {
    expect(sev(checkInstagramPost(post({ images: [jpg(1)], altTexts: [] })), "alt_text_missing")).toBe("warn");
    expect(sev(checkInstagramPost(post({ images: [jpg(1)], altTexts: ["가".repeat(1001)] })), "alt_text_too_long")).toBe("block");
    expect(codes(checkInstagramPost(post({ images: [jpg(1)], altTexts: ["가".repeat(1000)] })))).not.toContain("alt_text_too_long");
  });

  it("캡션: 해시태그 포함 2,200자 초과는 차단", () => {
    const base = { images: [jpg(1)], altTexts: ["설명"], hashtags: [] as string[] };
    expect(codes(checkInstagramPost(post({ ...base, caption: "가".repeat(2200) })))).not.toContain("caption_too_long");
    expect(sev(checkInstagramPost(post({ ...base, caption: "가".repeat(2201) })), "caption_too_long")).toBe("block");
    // 해시태그가 글자 수에 들어간다
    expect(sev(checkInstagramPost(post({ ...base, caption: "가".repeat(2195), hashtags: ["abcdef"] })), "caption_too_long")).toBe("block");
  });

  it("해시태그 30개·@ 태그 20개 한도", () => {
    const tags = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);
    const base = { images: [jpg(1)], altTexts: ["설명"] };
    expect(codes(checkInstagramPost(post({ ...base, hashtags: tags(30) })))).not.toContain("hashtags_too_many");
    expect(sev(checkInstagramPost(post({ ...base, hashtags: tags(31) })), "hashtags_too_many")).toBe("block");
    const mentions = (n: number) => Array.from({ length: n }, (_, i) => `@user${i}`).join(" ");
    expect(codes(checkInstagramPost(post({ ...base, caption: mentions(20), hashtags: [] })))).not.toContain("mentions_too_many");
    expect(sev(checkInstagramPost(post({ ...base, caption: mentions(21), hashtags: [] })), "mentions_too_many")).toBe("block");
  });

  it("이메일 주소는 @ 태그로 세지 않는다", () => {
    const issues = checkInstagramPost(post({ images: [jpg(1)], altTexts: ["설명"], caption: "문의 a@b.com", hashtags: [] }));
    expect(codes(issues)).not.toContain("mentions_too_many");
  });

  it("자리표시자 TBD 는 차단", () => {
    expect(sev(checkInstagramPost(post({ images: [jpg(1)], altTexts: ["설명"], caption: "채널 TBD 소개" })), "placeholder_left")).toBe("block");
  });

  it("금지 표현은 규칙의 심각도를 따른다(block/warn)", () => {
    const base = { images: [jpg(1)], altTexts: ["설명"] };
    const blocked = checkInstagramPost(post({ ...base, caption: "this has bannedword inside" }), [synthetic, syntheticWarn]);
    expect(sev(blocked, "banned_expression")).toBe("block");
    const warned = checkInstagramPost(post({ ...base, caption: "this has cautionword inside" }), [synthetic, syntheticWarn]);
    expect(sev(warned, "banned_expression")).toBe("warn");
    expect(codes(checkInstagramPost(post({ ...base, caption: "clean" }), [synthetic]))).not.toContain("banned_expression");
  });

  it("AI 표시를 정하지 않았으면 경고", () => {
    expect(sev(checkInstagramPost(post({ images: [jpg(1)], altTexts: ["설명"], aiGenerated: null })), "ai_disclosure_undecided")).toBe("warn");
  });
});

describe("Instagram 릴스 규격 위반 표", () => {
  it("1080x1920 MP4 30초는 코덱·프레임율을 모를 때 검사 불가 경고만", () => {
    const issues = checkInstagramReel(reel({ video: reelVideo({ videoCodec: null, fps: null }) }));
    expect(codes(issues)).toEqual(["video_probe_missing"]);
  });

  it("실측값이 다 있고 규격 안이면 위반이 없다", () => {
    expect(checkInstagramReel(reel())).toEqual([]);
  });

  it("길이 3초~15분 밖은 차단", () => {
    expect(sev(checkInstagramReel(reel({ video: reelVideo({ durationSec: 2 }) })), "reel_duration")).toBe("block");
    expect(sev(checkInstagramReel(reel({ video: reelVideo({ durationSec: 901 }) })), "reel_duration")).toBe("block");
    expect(codes(checkInstagramReel(reel({ video: reelVideo({ durationSec: 3 }) })))).not.toContain("reel_duration");
  });

  it("용량·폭·프레임율·코덱·컨테이너", () => {
    const c = (patch: Partial<VideoFacts>) => checkInstagramReel(reel({ video: reelVideo(patch) }));
    expect(sev(c({ bytes: 300_000_001 }), "video_too_large")).toBe("block");
    expect(sev(c({ width: 2160, height: 3840 }), "video_width")).toBe("block");
    expect(sev(c({ fps: 20 }), "video_fps")).toBe("block");
    expect(sev(c({ fps: 61 }), "video_fps")).toBe("block");
    expect(sev(c({ videoCodec: "other" }), "video_codec")).toBe("block");
    expect(sev(c({ container: "other" }), "video_container")).toBe("block");
  });

  it("9:16 이 아니면 경고", () => {
    expect(sev(checkInstagramReel(reel({ video: reelVideo({ width: 1080, height: 1080 }) })), "video_aspect_not_9_16")).toBe("warn");
  });

  it("커버가 PNG 면 JPEG 변환 경고", () => {
    expect(sev(checkInstagramReel(reel({ cover: card(1) })), "jpeg_conversion_required")).toBe("warn");
  });
});

describe("YouTube 업로드 규격 위반 표", () => {
  it("규격 안이면 위반이 없다", () => {
    expect(checkYoutubeUpload(yt())).toEqual([]);
  });

  it("제목 100자·금지 문자", () => {
    expect(codes(checkYoutubeUpload(yt({ title: "가".repeat(100) })))).not.toContain("yt_title_too_long");
    expect(sev(checkYoutubeUpload(yt({ title: "가".repeat(101) })), "yt_title_too_long")).toBe("block");
    expect(sev(checkYoutubeUpload(yt({ title: "a<b" })), "yt_forbidden_char")).toBe("block");
    expect(sev(checkYoutubeUpload(yt({ title: " " })), "yt_title_empty")).toBe("block");
  });

  it("설명은 글자 수가 아니라 바이트(한글 3바이트) — 5,000바이트", () => {
    expect(codes(checkYoutubeUpload(yt({ description: "가".repeat(1666) })))).not.toContain("yt_description_too_long"); // 4,998
    expect(sev(checkYoutubeUpload(yt({ description: "가".repeat(1667) })), "yt_description_too_long")).toBe("block"); // 5,001
  });

  it("태그 합계 500자 — 쉼표와 공백 태그의 따옴표를 센다", () => {
    expect(youtubeTagsLength(["Foo-Baz"])).toBe(7);
    expect(youtubeTagsLength(["Foo Baz"])).toBe(9);
    expect(youtubeTagsLength(["ab", "cd"])).toBe(5);
    const fits = Array.from({ length: 50 }, () => "abcdefghi"); // 9*50 + 49 = 499
    expect(codes(checkYoutubeUpload(yt({ tags: fits })))).not.toContain("yt_tags_too_long");
    expect(sev(checkYoutubeUpload(yt({ tags: [...fits, "x"] })), "yt_tags_too_long")).toBe("block");
  });

  it("Shorts: 180초 이하·세로 또는 정사각형", () => {
    expect(codes(checkYoutubeUpload(yt({ video: reelVideo({ durationSec: 180 }) })))).not.toContain("yt_not_short_duration");
    expect(sev(checkYoutubeUpload(yt({ video: reelVideo({ durationSec: 181 }) })), "yt_not_short_duration")).toBe("block");
    expect(sev(checkYoutubeUpload(yt({ video: reelVideo({ width: 1920, height: 1080 }) })), "yt_not_short_aspect")).toBe("block");
    expect(codes(checkYoutubeUpload(yt({ video: reelVideo({ width: 1080, height: 1080 }) })))).not.toContain("yt_not_short_aspect");
  });

  it("예약 공개: private 에서만, 과거 시각이면 즉시 공개 경고", () => {
    const future = "2026-11-06T12:00:00Z";
    expect(codes(checkYoutubeUpload(yt({ publishAt: future })))).toEqual([]);
    expect(sev(checkYoutubeUpload(yt({ publishAt: future, privacyStatus: "public" })), "yt_publish_at_needs_private")).toBe("block");
    expect(sev(checkYoutubeUpload(yt({ publishAt: "2026-11-04T00:00:00Z" })), "yt_publish_at_past")).toBe("warn");
    expect(sev(checkYoutubeUpload(yt({ publishAt: "내일" })), "yt_publish_at_invalid")).toBe("block");
  });

  it("공개로 올리면 사람 확인이 빠진다는 경고", () => {
    expect(sev(checkYoutubeUpload(yt({ privacyStatus: "public" })), "yt_public_without_gate")).toBe("warn");
  });

  it("아동용 여부·합성 콘텐츠 공개를 정하지 않았으면 경고", () => {
    const issues = checkYoutubeUpload(yt({ selfDeclaredMadeForKids: null, containsSyntheticMedia: null }));
    expect(codes(issues)).toEqual(["yt_kids_undecided", "yt_synthetic_undecided"]);
  });

  it("금지 표현·TBD", () => {
    expect(sev(checkYoutubeUpload(yt({ title: "bannedword title" }), [synthetic]), "banned_expression")).toBe("block");
    expect(sev(checkYoutubeUpload(yt({ description: "TBD" })), "placeholder_left")).toBe("block");
  });
});
