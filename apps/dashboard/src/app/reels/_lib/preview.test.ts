import { describe, expect, it } from "vitest";
import { clip, project, track } from "./fixtures";
import { buildPreview, clipVolume, colorFilter, dbToGain, fadeGain, transformAt, transitionFx, valueAt, watermarkBox } from "./preview";
import type { Keyframe, SourceRef } from "./types";

const kf = (prop: Keyframe["prop"], at: number, value: number, ease: Keyframe["ease"] = "linear"): Keyframe => ({ id: `${prop}-${at}`, prop, at, value, ease });

describe("키프레임 보간", () => {
  const keys = [kf("scale", 0, 1.25), kf("scale", 1000, 1.05)];
  it("없으면 기본값, 앞·뒤는 끝 값, 사이는 직선", () => {
    expect(valueAt(undefined, "scale", 500, 1)).toBe(1);
    expect(valueAt(keys, "scale", -10, 1)).toBe(1.25);
    expect(valueAt(keys, "scale", 5000, 1)).toBe(1.05);
    expect(valueAt(keys, "scale", 500, 1)).toBeCloseTo(1.15, 6);
  });
  it("hold 는 다음 키프레임까지 값을 지킨다, ease-in-out 은 가운데가 같다", () => {
    expect(valueAt([kf("cx", 0, 0.2, "hold"), kf("cx", 1000, 0.8)], "cx", 999, 0.5)).toBe(0.2);
    expect(valueAt([kf("cx", 0, 0, "ease-in-out"), kf("cx", 1000, 1)], "cx", 500, 0)).toBeCloseTo(0.5, 6);
    expect(valueAt([kf("cx", 0, 0, "ease-in-out"), kf("cx", 1000, 1)], "cx", 250, 0)).toBeLessThan(0.25);
  });
  it("클립 transform = 기본값 + 키프레임", () => {
    const c = clip("c", "v", 1000, 2000, { transform: { cx: 0.5, cy: 0.3, scale: 1, rotation: 0, opacity: 1 }, keyframes: keys });
    expect(transformAt(c, 1500)).toMatchObject({ cx: 0.5, cy: 0.3, scale: expect.closeTo(1.15, 6) as number });
  });
});

describe("색감 → CSS filter", () => {
  it("기본값이면 filter 없음", () => {
    expect(colorFilter(undefined)).toBeUndefined();
    expect(colorFilter({ brightness: 0, contrast: 0, saturation: 0, temperature: 0 })).toBeUndefined();
  });
  it("밝기·대비·채도는 1 + 값, 채도 −1 은 흑백(0)", () => {
    expect(colorFilter({ brightness: 0.05, contrast: 0.1, saturation: -1, temperature: 0 })).toBe("brightness(1.05) contrast(1.1) saturate(0)");
  });
  it("따뜻하면 sepia, 차가우면 hue-rotate", () => {
    expect(colorFilter({ brightness: 0, contrast: 0, saturation: 0, temperature: 1 })).toContain("sepia(0.35)");
    expect(colorFilter({ brightness: 0, contrast: 0, saturation: 0, temperature: -1 })).toBe("hue-rotate(18deg)");
  });
});

describe("소리", () => {
  it("dB → 게인", () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-60)).toBe(0);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 2);
  });
  it("페이드 인·아웃", () => {
    const c = clip("a", "a", 0, 4000, { audio: { volumeDb: 0, fadeInMs: 1000, fadeOutMs: 2000, fadeCurve: "linear" } });
    expect(fadeGain(c, 0)).toBe(0);
    expect(fadeGain(c, 500)).toBeCloseTo(0.5, 6);
    expect(fadeGain(c, 1500)).toBe(1);
    expect(fadeGain(c, 3000)).toBeCloseTo(0.5, 6);
    expect(fadeGain(c, 4000)).toBe(0);
  });
  it("트랙 볼륨 + 클립 볼륨, 0 dB 초과는 1 로 자른다", () => {
    const t = track("a", "audio", { volumeDb: -6 });
    expect(clipVolume(t, clip("a", "a", 0, 1000, { audio: { volumeDb: -6, fadeInMs: 0, fadeOutMs: 0, fadeCurve: "linear" } }), 500)).toBeCloseTo(0.251, 2);
    expect(clipVolume(track("a", "audio"), clip("a", "a", 0, 1000, { audio: { volumeDb: 12, fadeInMs: 0, fadeOutMs: 0, fadeCurve: "linear" } }), 500)).toBe(1);
  });
});

describe("전환", () => {
  const p = project([track("v", "video")], [clip("a", "v", 0, 3000), clip("b", "v", 2500, 2000, { transition: { kind: "crossfade", durationMs: 500 } })]);
  it("들어오는 클립 불투명도가 0 → 1", () => {
    expect(transitionFx(p, p.clips[1]!, 2500).opacity).toBe(0);
    expect(transitionFx(p, p.clips[1]!, 2750).opacity).toBeCloseTo(0.5, 6);
    expect(transitionFx(p, p.clips[1]!, 3000).opacity).toBe(1);
  });
  it("딥은 나가는 쪽이 먼저 꺼진다", () => {
    const q = project([track("v", "video")], [clip("a", "v", 0, 3000), clip("b", "v", 2500, 2000, { transition: { kind: "dip", durationMs: 500 } })]);
    expect(transitionFx(q, q.clips[0]!, 2625).opacity).toBeCloseTo(0.5, 6);
    expect(transitionFx(q, q.clips[0]!, 2800).opacity).toBe(0);
    expect(transitionFx(q, q.clips[1]!, 2600).opacity).toBe(0);
    expect(transitionFx(q, q.clips[1]!, 2900).opacity).toBeCloseTo(0.6, 6);
  });
  it("슬라이드는 이동 값을 준다", () => {
    const q = project([track("v", "video")], [clip("a", "v", 0, 3000), clip("b", "v", 2500, 2000, { transition: { kind: "slide", durationMs: 500, direction: "left" } })]);
    expect(transitionFx(q, q.clips[1]!, 2500).shift).toMatchObject({ x: 100 });
  });
});

describe("미리보기 구성", () => {
  const sources = new Map<string, SourceRef>([
    ["S/v", { id: "S/v", kind: "video", label: "쇼츠", src: "/v.mp4" }],
    ["S/c", { id: "S/c", kind: "image", label: "카드", src: "/c.png" }],
    ["S/a", { id: "S/a", kind: "audio", label: "음성", src: "/a.mp3" }],
  ]);
  const p = project(
    [track("v", "video"), track("a", "audio"), track("t", "text"), track("s", "subtitle", { hidden: true }), track("o", "overlay")],
    [
      clip("c1", "v", 0, 4000, { sourceId: "S/v", sourceKind: "video", in: 1000, out: 5000, color: { brightness: 0.1, contrast: 0, saturation: 0, temperature: 0 } }),
      clip("c2", "a", 0, 4000, { sourceId: "S/a", sourceKind: "audio" }),
      clip("c3", "t", 0, 4000, { text: { value: "안녕", style: "viral-white", box: { cx: 0.5, cy: 0.3, w: 0.8 } } }),
      clip("c4", "s", 0, 4000, { text: { value: "숨김", style: "subtitle-default" } }),
      clip("c5", "o", 0, 4000, { component: { type: "card", sourceId: "S/c" }, transform: { cx: 0.5, cy: 0.42, scale: 0.8, rotation: 0, opacity: 1 } }),
      clip("c6", "o", 4000, 1000, { component: { type: "watermark", assetId: "logo", corner: "br" } }),
    ],
  );
  const items = buildPreview(p, 2000, { playing: false, sources });
  it("아래→위 순서로, 숨긴 트랙은 뺀다", () => {
    expect(items.map((i) => i.key)).toEqual(["c1", "c2", "c3", "c5"]);
  });
  it("영상: 원본 시각·색감 filter·덮개 맞춤", () => {
    expect(items[0]).toMatchObject({ type: "media", kind: "video", src: "/v.mp4", time: 3, fit: "cover", filter: "brightness(1.1)", muted: true });
  });
  it("음성은 소리 요소, 글자는 자리·스타일, 카드는 contain + 자리", () => {
    expect(items[1]).toMatchObject({ type: "media", kind: "audio", volume: 1 });
    expect(items[2]).toMatchObject({ type: "text", text: "안녕", preset: "viral-white", box: { cx: 0.5, cy: 0.3, w: 0.8 } });
    expect(items[3]).toMatchObject({ type: "media", kind: "image", fit: "contain", box: { cy: 0.42, scale: 0.8 } });
  });
  it("재생 중이면 영상 소리를 낸다, 음소거 트랙은 끈다", () => {
    const on = buildPreview(p, 2000, { playing: true, sources });
    expect(on[0]).toMatchObject({ muted: false });
    const q = { ...p, tracks: p.tracks.map((t) => (t.id === "v" ? { ...t, muted: true } : t)) };
    expect(buildPreview(q, 2000, { playing: true, sources })[0]).toMatchObject({ muted: true });
  });
  it("워터마크·스티커는 이름표, 모서리 중심점", () => {
    const w = buildPreview(p, 4500, { playing: false, sources }).find((i) => i.key === "c6");
    expect(w).toMatchObject({ type: "tag", label: "logo" });
    expect(watermarkBox("br", { cx: 0.5, cy: 0.5, scale: 1, rotation: 0, opacity: 1 })).toMatchObject({ cx: 0.88 });
  });
  it("임시 클립(draft)이 우선한다", () => {
    const draft = new Map([["c1", { ...p.clips[0]!, transform: { cx: 0.2, cy: 0.5, scale: 1, rotation: 0, opacity: 1 } }]]);
    expect(buildPreview(p, 2000, { playing: false, sources, draft })[0]).toMatchObject({ box: { cx: 0.2 } });
  });
});
