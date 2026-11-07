import { describe, expect, it } from "vitest";
import { clip, project, track } from "./fixtures";
import { activeClips, clampTrim, clipEnd, clipLen, firstFreeStart, moveTarget, snapMs, sourceSeconds, splitTargets, trackAccepts, trimGhost } from "./timeline";

const p = project(
  [track("v", "video"), track("v2", "video"), track("a", "audio"), track("lock", "video", { locked: true })],
  [clip("c1", "v", 0, 3000, { sourceKind: "video", sourceMs: 10_000 }), clip("c2", "v", 5000, 2000, { sourceKind: "video", in: 1000, out: 3000, sourceMs: 10_000 }), clip("c3", "a", 0, 4000, { sourceKind: "audio" })],
);

describe("길이·끝", () => {
  it("길이 = round((out − in) / speed)", () => {
    expect(clipLen(clip("x", "v", 0, 3000, { speed: 2 }))).toBe(1500);
    expect(clipLen(clip("x", "v", 0, 1000, { speed: 0.25 }))).toBe(4000);
    expect(clipEnd(clip("x", "v", 500, 1000))).toBe(1500);
  });
  it("원본 시각(초)은 속도를 곱한다", () => {
    const c = clip("x", "v", 1000, 4000, { in: 2000, out: 6000, speed: 2 });
    expect(sourceSeconds(c, 1000)).toBe(2);
    expect(sourceSeconds(c, 2000)).toBe(4);
  });
});

describe("빈자리·받는 트랙", () => {
  it("겹치면 뒤 첫 빈자리", () => {
    expect(firstFreeStart(p, "v", 0, 1000)).toBe(3000);
    expect(firstFreeStart(p, "v", 3000, 2000)).toBe(3000);
    expect(firstFreeStart(p, "v", 3000, 2500)).toBe(7000);
    expect(firstFreeStart(p, "v", 0, 1000, "c1")).toBe(0);
  });
  it("I2 — 트랙 종류와 클립 종류", () => {
    expect(trackAccepts(track("t", "video"), { sourceKind: "image" })).toBe(true);
    expect(trackAccepts(track("t", "video"), { sourceKind: "audio" })).toBe(false);
    expect(trackAccepts(track("t", "audio"), { sourceKind: "video" })).toBe(false);
    expect(trackAccepts(track("t", "subtitle"), { text: { value: "a", style: "s" } })).toBe(true);
    expect(trackAccepts(track("t", "overlay"), { component: { type: "cta", text: "a" } })).toBe(true);
  });
});

describe("재생 위치에 걸린 클립", () => {
  it("트랙 순서(아래→위)로", () => {
    expect(activeClips(p, 1000).map((x) => x.clip.id)).toEqual(["c1", "c3"]);
    expect(activeClips(p, 4500)).toEqual([]);
    expect(activeClips(p, 5000).map((x) => x.clip.id)).toEqual(["c2"]);
  });
  it("전환 겹침이면 한 트랙에 둘", () => {
    const q = project([track("v", "video")], [clip("a", "v", 0, 3000), clip("b", "v", 2500, 2000)]);
    expect(activeClips(q, 2700).map((x) => x.clip.id)).toEqual(["a", "b"]);
  });
});

describe("다듬기 한계", () => {
  const c1 = p.clips[0]!;
  const c2 = p.clips[1]!;
  it("끝은 이웃 시작·원본 길이·최소 길이에서 멈춘다", () => {
    expect(clampTrim(p, c1, "end", 9000)).toBe(5000);
    expect(clampTrim(p, c1, "end", 50)).toBe(100);
    expect(clampTrim(p, c2, "end", 9000)).toBe(9000);
    expect(clampTrim(p, c2, "end", 20_000)).toBe(5000 + (10_000 - 1000)); // 원본 남은 9초
  });
  it("시작은 앞 클립 끝·원본 앞쪽(in)·최소 길이에서 멈춘다", () => {
    expect(clampTrim(p, c2, "start", 0)).toBe(4000); // in=1000 만큼만 되살린다
    expect(clampTrim(p, c2, "start", 9000)).toBe(clipEnd(c2) - 100);
    expect(clampTrim(p, c1, "start", -500)).toBe(0);
  });
  it("임시 위치", () => {
    expect(trimGhost(c1, "start", 500)).toEqual({ start: 500, len: 2500, trackId: "v" });
    expect(trimGhost(c1, "end", 2000)).toEqual({ start: 0, len: 2000, trackId: "v" });
  });
});

describe("이동 목표", () => {
  const c1 = p.clips[0]!;
  it("겹치면 뒤 빈자리로 밀린다", () => {
    expect(moveTarget(p, c1, 4500)).toEqual({ start: 7000, trackId: "v" });
  });
  it("받는 트랙으로만 옮긴다 — 잠금·종류 불일치는 제자리 트랙", () => {
    expect(moveTarget(p, c1, 0, "v2")).toEqual({ start: 0, trackId: "v2" });
    expect(moveTarget(p, c1, 0, "a")).toEqual({ start: 0, trackId: "v" });
    expect(moveTarget(p, c1, 0, "lock")).toEqual({ start: 0, trackId: "v" });
  });
  it("3분을 넘기면 null", () => {
    const q = project([track("v", "video")], [clip("a", "v", 0, 100_000), clip("b", "v", 100_000, 80_000, { sourceKind: "video" })]);
    expect(moveTarget(q, q.clips[0]!, 100_000)).toBeNull();
  });
});

describe("자르기 대상·붙이기", () => {
  it("고른 클립이 있으면 그것, 없으면 재생 위치에 걸린 잠기지 않은 트랙", () => {
    expect(splitTargets(p, p.clips[0]!, 1000).map((c) => c.id)).toEqual(["c1"]);
    expect(splitTargets(p, null, 1000).map((c) => c.id)).toEqual(["c1", "c3"]);
  });
  it("가장자리 100ms 안은 뺀다", () => {
    expect(splitTargets(p, p.clips[0]!, 50)).toEqual([]);
    expect(splitTargets(p, p.clips[0]!, 2950)).toEqual([]);
  });
  it("가까운 가장자리로 붙는다", () => {
    expect(snapMs(p, 3050, 100)).toBe(3000);
    expect(snapMs(p, 3500, 100)).toBe(3500);
    expect(snapMs(p, 3050, 100, "c1")).toBe(3050);
    expect(snapMs(p, 1980, 100, undefined, [2000])).toBe(2000);
  });
});
