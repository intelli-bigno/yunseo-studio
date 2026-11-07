// op 적용기 단위 테스트 — op 전부(정상·오류 코드)와 inverse 왕복, undo/redo 스택
import { describe, expect, it } from "vitest";
import { applyCommand, applyOp, applyPatch, historyStacks, placeScript, sameProject, type OpContext, type OpLogEntry, type ReelsOp } from "./ops";
import { parseSrt } from "./srt";
import { checkProject, clipEnd, emptyProjectV2, migrateV1toV2, ReelsOpError, toProjectV2, type Clip, type ReelsProjectV2 } from "./timeline";

const SOURCES: Record<string, { kind: "video" | "image" | "audio"; durationMs?: number }> = {
  vid: { kind: "video", durationMs: 10_000 },
  img: { kind: "image" },
  voice: { kind: "audio", durationMs: 8_000 },
};
const ctx: OpContext = { sources: (id) => SOURCES[id], luts: ["film-warm"], speech: () => [{ from: 200, to: 2000 }, { from: 2400, to: 4000 }, { from: 4300, to: 6000 }] };

function base(): ReelsProjectV2 {
  const p = emptyProjectV2("테스트");
  p.tracks.push({ id: "t-overlay", kind: "overlay", name: "오버레이 1" });
  p.clips.push(
    { id: "c1", trackId: "t-video", start: 0, in: 0, out: 4000, speed: 1, sourceId: "vid", sourceKind: "video", sourceMs: 10_000 },
    { id: "c2", trackId: "t-video", start: 4000, in: 1000, out: 5000, speed: 1, sourceId: "vid", sourceKind: "video", sourceMs: 10_000 },
    { id: "a1", trackId: "t-audio", start: 0, in: 0, out: 8000, speed: 1, sourceId: "voice", sourceKind: "audio", sourceMs: 8000 },
  );
  return p;
}

/** 적용 → inverse 적용 == 원본 */
function roundTrip(p: ReelsProjectV2, op: ReelsOp) {
  const r = applyOp(p, op, ctx);
  expect(sameProject(applyPatch(r.project, r.inverse), p)).toBe(true);
  expect(sameProject(applyPatch(p, r.forward), r.project)).toBe(true);
  return r;
}
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ReelsOpError) return e.code;
    throw e;
  }
  return "OK";
};
const get = (p: ReelsProjectV2, id: string) => p.clips.find((c) => c.id === id)!;

describe("add_clip", () => {
  it("빈 곳에 놓고 id·기본 transform 을 채운다", () => {
    const r = roundTrip(base(), { op: "add_clip", trackId: "t-video", sourceId: "vid", in: 2000, out: 7000, id: "c3" });
    expect(get(r.project, "c3")).toMatchObject({ start: 8000, in: 2000, out: 7000, speed: 1, transform: { scale: 1 } });
    expect(r.effects.created).toEqual(["c3"]);
  });
  it("이미지 기본 길이 3000ms, insert 는 뒤를 민다", () => {
    const r = roundTrip(base(), { op: "add_clip", trackId: "t-video", sourceId: "img", start: 4000, mode: "insert" });
    const c = r.project.clips.find((x) => x.sourceKind === "image")!;
    expect(c.out - c.in).toBe(3000);
    expect(get(r.project, "c2").start).toBe(7000);
  });
  it("오류 코드", () => {
    expect(code(() => applyOp(base(), { op: "add_clip", trackId: "t-video", sourceId: "vid", start: 1000 }, ctx))).toBe("CLIP_OVERLAP");
    expect(code(() => applyOp(base(), { op: "add_clip", trackId: "t-video", sourceId: "nope" }, ctx))).toBe("SOURCE_NOT_FOUND");
    expect(code(() => applyOp(base(), { op: "add_clip", trackId: "t-text", sourceId: "vid" }, ctx))).toBe("TRACK_KIND_MISMATCH");
    expect(code(() => applyOp(base(), { op: "add_clip", trackId: "t-x", sourceId: "vid" }, ctx))).toBe("TRACK_NOT_FOUND");
    expect(code(() => applyOp(base(), { op: "add_clip", trackId: "t-video", sourceId: "vid", id: "c1" }, ctx))).toBe("ID_EXISTS");
    expect(code(() => applyOp(base(), { op: "add_clip", trackId: "t-video", sourceId: "vid", in: 0, out: 20_000 }, ctx))).toBe("INVALID_ARGUMENT");
    expect(code(() => applyOp(base(), { op: "nope" }, ctx))).toBe("UNKNOWN_OP");
  });
});

describe("remove_clip · trim · split · move · ripple_delete", () => {
  it("remove_clip ripple 은 뒤를 당긴다", () => {
    const r = roundTrip(base(), { op: "remove_clip", clipId: "c1", ripple: true });
    expect(get(r.project, "c2").start).toBe(0);
    expect(r.effects.removed).toEqual(["c1"]);
    expect(code(() => applyOp(base(), { op: "remove_clip", clipId: "zz" }, ctx))).toBe("CLIP_NOT_FOUND");
  });
  it("trim 앞·뒤 — in 이 같이 움직이고 원본 범위를 지킨다", () => {
    let r = roundTrip(base(), { op: "trim", clipId: "c2", edge: "start", to: 4500 });
    expect(get(r.project, "c2")).toMatchObject({ start: 4500, in: 1500, out: 5000 });
    r = roundTrip(base(), { op: "trim", clipId: "c1", edge: "end", to: 3000, ripple: true });
    expect(get(r.project, "c1").out).toBe(3000);
    expect(get(r.project, "c2").start).toBe(3000);
    expect(code(() => applyOp(base(), { op: "trim", clipId: "c2", edge: "start", to: 3500 }, ctx))).toBe("CLIP_OVERLAP");
    expect(code(() => applyOp(base(), { op: "trim", clipId: "c1", edge: "start", to: 0 - 0 + 0 }, ctx))).toBe("OK");
    expect(code(() => applyOp(base(), { op: "trim", clipId: "c2", edge: "end", to: 14_000 }, ctx))).toBe("OUT_OF_RANGE");
  });
  it("split — 키프레임·페이드를 나눠 갖는다", () => {
    const p = base();
    get(p, "c1").keyframes = [
      { id: "k1", prop: "scale", at: 0, value: 1.2, ease: "linear" },
      { id: "k2", prop: "scale", at: 3000, value: 1, ease: "linear" },
    ];
    const r = roundTrip(p, { op: "split", clipId: "c1", at: 2000, newId: "c1b" });
    expect(get(r.project, "c1")).toMatchObject({ out: 2000 });
    expect(get(r.project, "c1b")).toMatchObject({ start: 2000, in: 2000, out: 4000 });
    expect(get(r.project, "c1").keyframes!.map((k) => k.at)).toEqual([0]);
    expect(get(r.project, "c1b").keyframes!.map((k) => k.at)).toEqual([1000]);
    expect(r.effects).toMatchObject({ created: ["c1b"], updated: ["c1"] });
    expect(code(() => applyOp(base(), { op: "split", clipId: "c1", at: 50 }, ctx))).toBe("SPLIT_AT_EDGE");
  });
  it("move — 트랙 간·겹침·종류", () => {
    const r = roundTrip(base(), { op: "move", clipId: "c2", start: 9000 });
    expect(get(r.project, "c2").start).toBe(9000);
    expect(code(() => applyOp(base(), { op: "move", clipId: "c2", start: 1000 }, ctx))).toBe("CLIP_OVERLAP");
    expect(code(() => applyOp(base(), { op: "move", clipId: "c2", start: 9000, trackId: "t-text" }, ctx))).toBe("TRACK_KIND_MISMATCH");
  });
  it("ripple_delete — 여러 구간을 잘라내고 뒤를 당긴다(가운데가 빠지면 두 조각)", () => {
    const r = roundTrip(base(), { op: "ripple_delete", trackIds: ["t-video"], ranges: [{ from: 1000, to: 2000 }, { from: 5000, to: 6000 }] });
    const vids = r.project.clips.filter((c) => c.trackId === "t-video").sort((a, b) => a.start - b.start);
    expect(vids.map((c) => [c.start, clipEnd(c)])).toEqual([[0, 1000], [1000, 3000], [3000, 4000], [4000, 6000]]);
    expect(code(() => applyOp(base(), { op: "ripple_delete", ranges: [{ from: 5, to: 1 }] }, ctx))).toBe("INVALID_ARGUMENT");
  });
});

describe("속도·변형·글자·자막", () => {
  it("set_speed — 길이 = (out−in)/speed, keepEnd", () => {
    let r = roundTrip(base(), { op: "set_speed", clipId: "c2", speed: 2 });
    expect(clipEnd(get(r.project, "c2"))).toBe(6000);
    r = roundTrip(base(), { op: "set_speed", clipId: "c2", speed: 2, keepEnd: true });
    expect(get(r.project, "c2").start).toBe(6000);
    expect(code(() => applyOp(base(), { op: "set_speed", clipId: "c1", speed: 0.5 }, ctx))).toBe("CLIP_OVERLAP");
    expect(code(() => applyOp(base(), { op: "set_speed", clipId: "c1", speed: 9 }, ctx))).toBe("INVALID_ARGUMENT");
  });
  it("set_transform 은 병합한다", () => {
    const r = roundTrip(base(), { op: "set_transform", clipId: "c1", transform: { cy: 0.35, scale: 1.2 } });
    expect(get(r.project, "c1").transform).toEqual({ cx: 0.5, cy: 0.35, scale: 1.2, rotation: 0, opacity: 1 });
  });
  it("add_text · update_text", () => {
    let r = roundTrip(base(), { op: "add_text", trackId: "t-text", start: 0, durationMs: 2600, text: { value: "아… 허리야", style: "viral-yellow", box: { cx: 0.5, cy: 0.3, w: 0.86 } }, id: "x-01" });
    r = roundTrip(r.project, { op: "update_text", clipId: "x-01", text: { value: "아… 허리야\n욕조" } });
    expect(get(r.project, "x-01").text).toMatchObject({ value: "아… 허리야\n욕조", style: "viral-yellow" });
    expect(code(() => applyOp(base(), { op: "add_text", trackId: "t-video", start: 0, durationMs: 1000, text: { value: "a", style: "s" } }, ctx))).toBe("TRACK_KIND_MISMATCH");
  });
  it("import_srt — 큐 하나 = 클립 하나, replace, 줄 수 경고, 파싱 오류", () => {
    const srt = "1\n00:00:00,170 --> 00:00:02,810\n아… 허리야\n\n2\n00:00:02,900 --> 00:00:05,400\n한 줄\n두 줄\n세 줄\n";
    const r = roundTrip(base(), { op: "import_srt", trackId: "t-subtitle", srt, style: "viral-white", replace: true });
    expect(r.effects.created).toEqual(["sub-0001", "sub-0002"]);
    expect(get(r.project, "sub-0001")).toMatchObject({ start: 170, out: 2640, text: { style: "viral-white" } });
    expect(r.warnings.some((w) => w.startsWith("subtitle/lines"))).toBe(true);
    expect(code(() => applyOp(base(), { op: "import_srt", trackId: "t-subtitle", srt: "1\nxx --> yy\n글" }, ctx))).toBe("SRT_PARSE_ERROR");
  });
  it("auto_place_subtitles — 대본 문장을 말소리 구간에 놓는다", () => {
    const r = roundTrip(base(), { op: "auto_place_subtitles", trackId: "t-subtitle", audioClipId: "a1", script: "아… 허리야.\n욕조 닦기 진짜 힘들죠.\n그래서 이걸로 바꿨거든요." });
    const subs = r.project.clips.filter((c) => c.trackId === "t-subtitle");
    expect(subs.map((c) => [c.start, clipEnd(c)])).toEqual([[200, 2000], [2400, 4000], [4300, 6000]]);
    expect(r.warnings).toEqual([]);
  });
  it("placeScript — 구간이 많으면 가장 짧은 틈부터 합친다", () => {
    const out = placeScript("하나.\n둘.", [{ from: 0, to: 1000 }, { from: 1050, to: 2000 }, { from: 3000, to: 4000 }], 2);
    expect(out.cues.map((c) => [c.from, c.to])).toEqual([[0, 2000], [3000, 4000]]);
    expect(out.warnings).toHaveLength(1);
  });
});

describe("오디오·컴포넌트·전환·색·키프레임·트랙", () => {
  it("set_volume — 클립 또는 트랙 하나만", () => {
    let r = roundTrip(base(), { op: "set_volume", clipId: "a1", volumeDb: -6 });
    expect(get(r.project, "a1").audio!.volumeDb).toBe(-6);
    r = roundTrip(base(), { op: "set_volume", trackId: "t-audio", volumeDb: -18 });
    expect(r.project.tracks.find((t) => t.id === "t-audio")!.volumeDb).toBe(-18);
    expect(code(() => applyOp(base(), { op: "set_volume", clipId: "a1", trackId: "t-audio", volumeDb: 0 }, ctx))).toBe("INVALID_ARGUMENT");
  });
  it("set_fade — 합이 길이를 넘으면 OUT_OF_RANGE", () => {
    const r = roundTrip(base(), { op: "set_fade", clipId: "a1", inMs: 500, outMs: 1500, curve: "ease" });
    expect(get(r.project, "a1").audio).toEqual({ volumeDb: 0, fadeInMs: 500, fadeOutMs: 1500, fadeCurve: "ease" });
    expect(code(() => applyOp(base(), { op: "set_fade", clipId: "a1", inMs: 5000, outMs: 5000 }, ctx))).toBe("OUT_OF_RANGE");
  });
  it("add_component — 워터마크·카드", () => {
    const r = roundTrip(base(), { op: "add_component", trackId: "t-overlay", start: 0, durationMs: 3000, component: { type: "watermark", assetId: "logo-white", corner: "br", marginPx: 48 } });
    expect(r.project.clips.at(-1)!.component).toEqual({ type: "watermark", assetId: "logo-white", corner: "br", marginPx: 48 });
    expect(code(() => applyOp(base(), { op: "add_component", trackId: "t-overlay", start: 0, durationMs: 3000, component: { type: "card", sourceId: "vid" } }, ctx))).toBe("SOURCE_NOT_FOUND");
  });
  it("set_transition — 앞 클립과 겹치게 당기고, null 이면 되민다", () => {
    const r = roundTrip(base(), { op: "set_transition", clipId: "c2", transition: { kind: "crossfade", durationMs: 500 } });
    expect(get(r.project, "c2").start).toBe(3500);
    const back = roundTrip(r.project, { op: "set_transition", clipId: "c2", transition: null });
    expect(get(back.project, "c2").start).toBe(4000);
    expect(code(() => applyOp(base(), { op: "set_transition", clipId: "c2", transition: { kind: "crossfade", durationMs: 2500 } }, ctx))).toBe("OUT_OF_RANGE");
    expect(code(() => applyOp(base(), { op: "set_transition", clipId: "c1", transition: { kind: "dip", durationMs: 300 } }, ctx))).toBe("OUT_OF_RANGE");
  });
  it("set_color — 병합·LUT 목록 검사", () => {
    const r = roundTrip(base(), { op: "set_color", clipId: "c1", color: { brightness: 0.05, temperature: 0.15, lut: { id: "film-warm", strength: 0.6 } } });
    expect(get(r.project, "c1").color).toEqual({ brightness: 0.05, contrast: 0, saturation: 0, temperature: 0.15, lut: { id: "film-warm", strength: 0.6 } });
    expect(code(() => applyOp(base(), { op: "set_color", clipId: "c1", color: { lut: { id: "nope" } } }, ctx))).toBe("INVALID_ARGUMENT");
    expect(code(() => applyOp(base(), { op: "set_color", clipId: "a1", color: {} }, ctx))).toBe("TRACK_KIND_MISMATCH");
  });
  it("add_keyframe(같은 prop·at 이면 교체) · remove_keyframe", () => {
    let r = roundTrip(base(), { op: "add_keyframe", clipId: "c1", prop: "scale", at: 0, value: 1.25, ease: "ease-in-out", id: "k1" });
    r = roundTrip(r.project, { op: "add_keyframe", clipId: "c1", prop: "scale", at: 0, value: 1.3 });
    expect(get(r.project, "c1").keyframes).toEqual([{ id: "k1", prop: "scale", at: 0, value: 1.3, ease: "ease-in-out" }]);
    r = roundTrip(r.project, { op: "remove_keyframe", clipId: "c1", keyframeId: "k1" });
    expect(get(r.project, "c1").keyframes).toBeUndefined();
    expect(code(() => applyOp(base(), { op: "remove_keyframe", clipId: "c1", keyframeId: "zz" }, ctx))).toBe("KEYFRAME_NOT_FOUND");
    expect(code(() => applyOp(base(), { op: "add_keyframe", clipId: "c1", prop: "scale", at: 9000, value: 1 }, ctx))).toBe("OUT_OF_RANGE");
  });
  it("add_track · set_track(잠금) · remove_track", () => {
    let r = roundTrip(base(), { op: "add_track", kind: "overlay", id: "t-o2", index: 0 });
    expect(r.project.tracks[0]!.id).toBe("t-o2");
    r = roundTrip(base(), { op: "set_track", trackId: "t-video", locked: true, name: "메인" });
    expect(code(() => applyOp(r.project, { op: "move", clipId: "c1", start: 20_000 }, ctx))).toBe("TRACK_LOCKED");
    expect(code(() => applyOp(r.project, { op: "remove_track", trackId: "t-video" }, ctx))).toBe("TRACK_LOCKED");
    r = roundTrip(base(), { op: "remove_track", trackId: "t-video" });
    expect(r.project.clips.some((c) => c.trackId === "t-video")).toBe(false);
  });
});

describe("batch · undo · redo", () => {
  it("batch 는 전부 아니면 전무 — 실패하면 몇 번째인지", () => {
    const ok = roundTrip(base(), { op: "batch", label: "줌", ops: [
      { op: "add_keyframe", clipId: "c1", prop: "scale", at: 0, value: 1.25 },
      { op: "add_keyframe", clipId: "c1", prop: "scale", at: 1067, value: 1.08 },
    ] });
    expect(get(ok.project, "c1").keyframes).toHaveLength(2);
    let err: ReelsOpError | null = null;
    try {
      applyOp(base(), { op: "batch", ops: [{ op: "move", clipId: "c2", start: 9000 }, { op: "remove_clip", clipId: "c99" }] }, ctx);
    } catch (e) {
      err = e as ReelsOpError;
    }
    expect(err?.code).toBe("BATCH_FAILED");
    expect(err?.details).toMatchObject({ index: 1, cause: { code: "CLIP_NOT_FOUND" } });
    expect(code(() => applyOp(base(), { op: "batch", ops: [{ op: "undo" }] }, ctx))).toBe("BATCH_FAILED");
  });
  it("undo/redo — 공용 스택, 새 op 가 redo 를 비운다", () => {
    const log: OpLogEntry[] = [];
    let p = base();
    const run = (op: ReelsOp) => {
      const r = applyCommand(p, log, op, ctx);
      log.push(r.entry);
      p = r.project;
      return r;
    };
    const p0 = p;
    run({ op: "move", clipId: "c2", start: 9000 });
    const p1 = p;
    run({ op: "set_speed", clipId: "c1", speed: 2 });
    expect(run({ op: "undo" }).undo).toEqual({ available: true, redo: true });
    expect(sameProject(p, p1)).toBe(true);
    run({ op: "undo" });
    expect(sameProject(p, p0)).toBe(true);
    expect(code(() => applyCommand(p, log, { op: "undo" }, ctx))).toBe("NOTHING_TO_UNDO");
    run({ op: "redo" });
    expect(sameProject(p, p1)).toBe(true);
    run({ op: "add_track", kind: "text" });
    expect(historyStacks(log).redo).toHaveLength(0);
    expect(code(() => applyCommand(p, log, { op: "redo" }, ctx))).toBe("NOTHING_TO_REDO");
    run({ op: "undo", steps: 2 });
    expect(sameProject(p, p0)).toBe(true);
  });
});

describe("v1 → v2 · 불변식", () => {
  it("migrateV1toV2 — offset/duration → in/out, component 트랙 → overlay, 글자 → TextBody", () => {
    const v1 = {
      version: 1 as const,
      title: "옛",
      tracks: [{ id: "t-v", kind: "video", name: "영상" }, { id: "t-c", kind: "component", name: "컴" }, { id: "t-s", kind: "subtitle", name: "자막", muted: true }],
      clips: [
        { id: "a", trackId: "t-v", start: 0, duration: 2000, offset: 500, sourceId: "vid", sourceKind: "video" as const, sourceMs: 10_000 },
        { id: "b", trackId: "t-c", start: 0, duration: 1000, offset: 0, component: "cta" as const, text: "지금" },
        { id: "s", trackId: "t-s", start: 0, duration: 1000, offset: 0, text: "자막" },
      ],
    };
    const v2 = migrateV1toV2(v1);
    expect(v2.tracks[1]!.kind).toBe("overlay");
    expect(v2.clips[0]).toMatchObject({ in: 500, out: 2500, speed: 1 });
    expect(v2.clips[1]!.component).toEqual({ type: "cta", text: "지금" });
    expect(v2.clips[2]!.text).toEqual({ value: "자막", style: "subtitle-default" });
    expect(checkProject(v2)).toEqual([]);
    expect(toProjectV2(v2)).toBe(v2);
  });
  it("전환 경계만 겹침 허용(I1 예외)", () => {
    const p = base();
    const c2 = get(p, "c2") as Clip;
    c2.start = 3600;
    expect(code(() => checkProject(p))).toBe("CLIP_OVERLAP");
    c2.transition = { kind: "crossfade", durationMs: 400 };
    expect(code(() => checkProject(p))).toBe("OK");
  });
  it("parseSrt", () => {
    expect(parseSrt("﻿1\r\n00:00:01,000 --> 00:00:02,500\r\n안녕\r\n")).toEqual([{ startMs: 1000, endMs: 2500, text: "안녕" }]);
  });
});
