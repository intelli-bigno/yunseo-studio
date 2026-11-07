import { describe, expect, it } from "vitest";
import { toV2 } from "./project";

const v1 = {
  version: 1,
  title: "옛 릴스",
  tracks: [
    { id: "t-video", kind: "video", name: "영상 1", muted: true },
    { id: "t-sub", kind: "subtitle", name: "자막 1" },
    { id: "t-text", kind: "text", name: "텍스트 1" },
    { id: "t-comp", kind: "component", name: "컴포넌트 1" },
  ],
  clips: [
    { id: "c1", trackId: "t-video", start: 1000, duration: 4000, offset: 2000, sourceId: "S/1/video", sourceKind: "video", sourceMs: 9000 },
    { id: "c2", trackId: "t-sub", start: 0, duration: 1500, offset: 0, text: "안녕" },
    { id: "c3", trackId: "t-text", start: 0, duration: 1000, offset: 0, text: "제목" },
    { id: "c4", trackId: "t-comp", start: 500, duration: 2000, offset: 0, component: "cta", text: "지금" },
  ],
};

describe("toV2 — v1 → v2 (문서 §6 표)", () => {
  const p = toV2(v1)!;
  it("version·canvas·제목", () => {
    expect(p.version).toBe(2);
    expect(p.canvas).toEqual({ width: 1080, height: 1920, fps: 30 });
    expect(p.title).toBe("옛 릴스");
  });
  it("트랙 component → overlay, muted 유지", () => {
    expect(p.tracks.map((t) => t.kind)).toEqual(["video", "subtitle", "text", "overlay"]);
    expect(p.tracks[0]!.muted).toBe(true);
  });
  it("영상 클립: in = offset, out = offset + duration, speed 1", () => {
    expect(p.clips[0]).toMatchObject({ id: "c1", start: 1000, in: 2000, out: 6000, speed: 1, sourceMs: 9000, sourceKind: "video" });
  });
  it("글자 클립: TextBody 로, 원본 없는 클립은 in=0 out=길이", () => {
    expect(p.clips[1]).toMatchObject({ in: 0, out: 1500, text: { value: "안녕", style: "subtitle-default" } });
    expect(p.clips[2]).toMatchObject({ text: { value: "제목", style: "text-default" } });
  });
  it("컴포넌트 클립: {type, text}", () => {
    expect(p.clips[3]!.component).toEqual({ type: "cta", text: "지금" });
    expect(p.clips[3]!.text).toBeUndefined();
  });
  it("v2 는 그대로 통과(speed 기본값만 채움)", () => {
    const v2 = { version: 2, title: "n", tracks: [{ id: "t", kind: "video", name: "v" }], clips: [{ id: "c", trackId: "t", start: 0, in: 0, out: 1000 }] };
    expect(toV2(v2)!.clips[0]).toMatchObject({ speed: 1, out: 1000 });
  });
  it("알아볼 수 없으면 null", () => {
    expect(toV2(null)).toBeNull();
    expect(toV2({ version: 1 })).toBeNull();
  });
});
