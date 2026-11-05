import { describe, expect, it } from "vitest";
import { DEFAULT_REEL_PRESET, REEL_TRANSITIONS, computeReelLayout, insideSafeArea, planReel, type ReelPreset } from "@yunseo/domain";
import { XFADE_EFFECT, buildFfmpegArgs, buildFilterGraph, type AudioSlot, type BuildFfmpegInput } from "./ffmpeg-args";

const P = DEFAULT_REEL_PRESET;
const texts = ["Rates move first.", "Prices follow later on.", "Watch the core reading closely.", "Sources are on the last card."].map((text) => ({ text }));

function input(patch: Partial<BuildFfmpegInput> & { preset?: ReelPreset; transition?: (typeof REEL_TRANSITIONS)[number] } = {}): BuildFfmpegInput {
  const preset = patch.preset ?? P;
  const plan = planReel(texts, preset, patch.transition ? { transition: patch.transition } : {});
  return { plan, preset, cardPaths: texts.map((_, i) => `/cards/c${i + 1}.png`), assName: "subtitles.ass", outPath: "/out/reel.mp4", ...patch };
}

const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1];
const afterLast = (args: string[], flag: string) => args[args.lastIndexOf(flag) + 1];

describe("ffmpeg 인자 — 입력과 길이", () => {
  const i = input();
  const args = buildFfmpegArgs(i);

  it("카드마다 정지 이미지 입력을 프레임 수에 맞춰 연다 (반 프레임 덜어 한 프레임이 더 붙지 않게)", () => {
    const inputs = args.reduce<number[]>((acc, a, idx) => (a === "-i" ? [...acc, idx] : acc), []);
    expect(inputs.length).toBe(5); // 카드 4 + 무음 오디오 1
    i.plan.scenes.forEach((s, k) => {
      const at = inputs[k]!;
      expect(args.slice(at - 8, at + 2)).toEqual(["-threads", "1", "-loop", "1", "-framerate", "30", "-t", String(Number(((s.frames - 0.5) / 30).toFixed(4))), "-i", `/cards/c${k + 1}.png`]);
    });
  });

  it("출력은 H.264(yuv420p) + AAC, 전체 길이는 계획의 프레임 수와 같다", () => {
    expect(after(args, "-c:v")).toBe("libx264");
    expect(after(args, "-pix_fmt")).toBe("yuv420p");
    expect(after(args, "-c:a")).toBe("aac");
    expect(afterLast(args, "-t")).toBe(String(Number((i.plan.totalFrames / 30).toFixed(4))));
    expect(args.at(-1)).toBe("/out/reel.mp4");
    expect(args).toContain("-movflags");
  });

  it("스레드 수를 제한한다 (실행기 pids.max=256 에서 기본값으로는 스레드를 못 만들어 죽는다)", () => {
    expect(after(args, "-filter_threads")).toBe("4");
    expect(after(args, "-filter_complex_threads")).toBe("1");
    expect(after(args, "-threads")).toBe("4");
    const one = buildFfmpegArgs({ ...i, encoder: { crf: 20, preset: "medium", threads: 1 } });
    expect(after(one, "-filter_threads")).toBe("1");
    expect(after(one, "-threads")).toBe("1");
  });

  it("카드 수와 장면 수가 다르면 실패한다", () => {
    expect(() => buildFfmpegArgs({ ...i, cardPaths: ["/a.png"] })).toThrow("수가 다르다");
  });
});

describe("ffmpeg 필터 — 배치와 안전영역", () => {
  const layout = computeReelLayout(P);

  it("카드를 레이아웃이 계산한 위치·크기로 놓고, 그 자리는 안전영역 안이다", () => {
    const graph = buildFilterGraph(input());
    expect(graph).toContain(`scale=${layout.card.w}:${layout.card.h}:flags=lanczos`);
    expect(graph).toContain(`overlay=x=${layout.card.x}:y=${layout.card.y}`);
    expect(insideSafeArea(layout.card, layout)).toBe(true);
  });

  it("배경은 같은 카드를 9:16 으로 채워 흐리고 어둡게 한다 (새 색 없음)", () => {
    const graph = buildFilterGraph(input());
    expect(graph).toContain("scale=1080:1920:force_original_aspect_ratio=increase");
    expect(graph).toContain(`gblur=sigma=${P.background.blurSigma}`);
    expect(graph).toContain(`eq=brightness=-${P.background.dim}`);
  });

  it("색은 bt709·TV 범위로 한 번에 변환한다", () => {
    expect(buildFilterGraph(input())).toContain("out_color_matrix=bt709:out_range=tv");
  });
});

describe("ffmpeg 필터 — 전환 프리셋", () => {
  it("전환 이름마다 효과가 다르고 2종 이상은 실제 겹치는 전환이다", () => {
    const effects = REEL_TRANSITIONS.map((t) => XFADE_EFFECT[t]);
    expect(new Set(effects).size).toBe(REEL_TRANSITIONS.length);
    expect(effects.filter((e) => e !== null).length).toBeGreaterThanOrEqual(2);
  });

  it.each(REEL_TRANSITIONS.filter((t) => t !== "cut"))("%s: xfade 가 장면 사이마다 계획의 시작 시각(offset)으로 걸린다", (transition) => {
    const i = input({ transition });
    const graph = buildFilterGraph(i);
    const xfades = graph.split(";").filter((p) => p.includes("xfade="));
    expect(xfades.length).toBe(i.plan.scenes.length - 1);
    xfades.forEach((part, k) => {
      expect(part).toContain(`transition=${XFADE_EFFECT[transition]}`);
      expect(part).toContain(`duration=${Number((i.plan.transitionFrames / 30).toFixed(4))}`);
      expect(part).toContain(`offset=${Number((i.plan.scenes[k + 1]!.startFrame / 30).toFixed(4))}`);
    });
    expect(graph).not.toContain("concat=");
  });

  it("cut 은 겹침 없이 concat 으로 잇는다", () => {
    const graph = buildFilterGraph(input({ transition: "cut" }));
    expect(graph).toContain("concat=n=4:v=1:a=0[vx]");
    expect(graph).not.toContain("xfade=");
  });

  it("한 장뿐이면 잇지 않는다", () => {
    const plan = planReel([{ text: "Only." }], P);
    const graph = buildFilterGraph({ plan, preset: P, cardPaths: ["/a.png"], assName: null, outPath: "/o.mp4" });
    expect(graph).toContain("[v0]format=yuv420p[vout]");
  });
});

describe("ffmpeg 필터 — 자막", () => {
  it("번인이면 ASS 를 subtitles 로 새기고, 아니면 새기지 않는다", () => {
    expect(buildFilterGraph(input())).toContain("subtitles=filename=subtitles.ass,format=yuv420p[vout]");
    const none = buildFilterGraph(input({ assName: null }));
    expect(none).not.toContain("subtitles=");
    expect(none).toContain("format=yuv420p[vout]");
  });

  it("서체 폴더는 안전한 경로만 받는다 (필터 이스케이프 회피)", () => {
    expect(buildFilterGraph(input({ fontsDir: "/usr/share/fonts" }))).toContain(":fontsdir=/usr/share/fonts");
    expect(() => buildFilterGraph(input({ fontsDir: "C:\\Fonts" }))).toThrow("fontsDir");
    expect(() => buildFilterGraph(input({ assName: "a'b.ass" }))).toThrow("ASS 파일 이름");
  });
});

describe("ffmpeg 인자 — 오디오 슬롯", () => {
  it("기본은 무음 AAC 트랙 (D6: 자막만)", () => {
    const args = buildFfmpegArgs(input());
    expect(args.join(" ")).toContain("anullsrc=r=48000:cl=stereo");
    expect(args).toContain("4:a"); // 카드 4장(0~3) 다음 입력
    expect(after(args, "-ar")).toBe("48000");
  });

  it("프리셋이 무음 트랙을 끄면 오디오가 아예 없다", () => {
    const args = buildFfmpegArgs(input({ preset: { ...P, audio: { ...P.audio, silentTrack: false } } }));
    expect(args).not.toContain("-c:a");
    expect(args.join(" ")).not.toContain("anullsrc");
  });

  it("음성 슬롯 하나면 그 파일을 섞는다", () => {
    const args = buildFfmpegArgs(input({ tracks: [{ role: "voice", path: "/a/voice.wav" }] }));
    const graph = after(args, "-filter_complex")!;
    expect(args).toContain("/a/voice.wav");
    expect(graph).toContain("[4:a]aresample=48000");
    expect(graph).toContain("volume=0dB");
    expect(graph).toContain("[at0]anull,apad,atrim=end=");
    expect(args).toContain("[aout]");
    expect(args.join(" ")).not.toContain("anullsrc");
  });

  it("음성 + 음악이면 amix, 음악은 반복(-stream_loop)하고 기본 −18dB", () => {
    const tracks: AudioSlot[] = [
      { role: "voice", path: "/a/voice.wav" },
      { role: "music", path: "/a/bgm.mp3" },
    ];
    const args = buildFfmpegArgs(input({ tracks }));
    const graph = after(args, "-filter_complex")!;
    expect(args.slice(args.indexOf("/a/bgm.mp3") - 3, args.indexOf("/a/bgm.mp3") + 1)).toEqual(["-stream_loop", "-1", "-i", "/a/bgm.mp3"]);
    expect(graph).toContain("[at0][at1]amix=inputs=2:duration=longest:normalize=0");
    expect(graph).toContain("[5:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=-18dB[at1]");
    expect(graph).toMatch(/afade=t=out:st=\d+(\.\d+)?:d=1\[aout\]/);
  });

  it("gainDb 를 주면 그 값을 쓴다", () => {
    const args = buildFfmpegArgs(input({ tracks: [{ role: "music", path: "/a/bgm.mp3", gainDb: -9 }] }));
    expect(after(args, "-filter_complex")).toContain("volume=-9dB");
  });
});
