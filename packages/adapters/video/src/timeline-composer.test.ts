// [W5 릴스] 타임라인 합성기 — 필터 그래프 생성 단위 테스트(ffmpeg 없이) + 짧은 샘플 렌더 통합 테스트 1개(진짜 ffmpeg, Windows 실행기).
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { emptyProjectV2, type ReelsProjectV2 } from "@yunseo/domain";
import { assertFfmpegReady, runProcess, type FfmpegBinaries } from "./ffmpeg-runner";
import { atempoChain, buildTimelineAss, buildTimelineGraph, composeTimeline, escapeFilterPath, keyframeExpr, speechFromSilencedetect, xfadeName, type TimelineMedia } from "./timeline-composer";
import { grabFrame, pixelAt, writeTone } from "./testing";

function sample(): ReelsProjectV2 {
  const p = emptyProjectV2("샘플");
  p.tracks.push({ id: "t-overlay", kind: "overlay", name: "오버레이" });
  p.clips.push(
    { id: "c1", trackId: "t-video", start: 0, in: 500, out: 2500, speed: 1, sourceId: "red", sourceKind: "video", sourceMs: 4000, color: { brightness: 0.1, contrast: 0.1, saturation: -0.2, temperature: 0.3, lut: null } },
    {
      id: "c2", trackId: "t-video", start: 1600, in: 0, out: 3000, speed: 1.5, sourceId: "blue", sourceKind: "video", sourceMs: 4000,
      transition: { kind: "crossfade", durationMs: 400 },
      keyframes: [{ id: "k1", prop: "scale", at: 0, value: 1.3, ease: "ease-in-out" }, { id: "k2", prop: "scale", at: 1500, value: 1, ease: "linear" }],
    },
    { id: "a1", trackId: "t-audio", start: 200, in: 0, out: 3000, speed: 1, sourceId: "tone", sourceKind: "audio", sourceMs: 3000, audio: { volumeDb: -6, fadeInMs: 300, fadeOutMs: 500, fadeCurve: "ease" } },
    { id: "s1", trackId: "t-subtitle", start: 0, in: 0, out: 1500, speed: 1, text: { value: "HELLO", style: "viral-white" } },
    { id: "x1", trackId: "t-text", start: 1000, in: 0, out: 1500, speed: 1, text: { value: "TOP", style: "viral-yellow", box: { cx: 0.5, cy: 0.3, w: 0.8 } } },
    { id: "o1", trackId: "t-overlay", start: 0, in: 0, out: 3600, speed: 1, component: { type: "watermark", assetId: "logo", corner: "br", marginPx: 40 } },
  );
  return p;
}
const MEDIA: Record<string, TimelineMedia> = { red: { path: "red.mp4", kind: "video", hasAudio: false }, blue: { path: "blue.mp4", kind: "video", hasAudio: false }, tone: { path: "tone.wav", kind: "audio" } };

describe("buildTimelineGraph(순수)", () => {
  const g = buildTimelineGraph({ project: sample(), media: (id) => MEDIA[id], asset: () => "logo.png", assName: "reel.ass", outPath: "out.mp4" });

  it("스레드 상한 2 · 1080x1920 · 30fps · 길이 = 타임라인 끝", () => {
    expect(g.args.slice(0, 8)).toEqual(["-hide_banner", "-y", "-threads", "2", "-filter_threads", "2", "-filter_complex_threads", "2"]);
    expect(g.filter).toContain("color=c=black:s=1080x1920:r=30:d=3.6");
    expect(g.durationMs).toBe(3600);
    expect(g.args[g.args.lastIndexOf("-t") + 1]).toBe("3.6");
    expect(g.args.at(-1)).toBe("out.mp4");
  });
  it("트림·속도·색·전환·줌·워터마크", () => {
    expect(g.filter).toContain("trim=start=0.5:end=2.5,setpts=(PTS-STARTPTS)/1");
    expect(g.filter).toContain("setpts=(PTS-STARTPTS)/1.5");
    expect(g.filter).toContain("eq=brightness=0.03:contrast=1.1:saturation=0.8");
    expect(g.filter).toContain("colortemperature=temperature=5600");
    expect(g.filter).toMatch(/xfade=transition=fade:duration=0\.4:offset=1\.6/);
    expect(g.filter).toContain("zoompan=z='max(1,if(lt(in/30,0),1.3,");
    expect(g.filter).toContain("overlay=x='W-w-40':y='H-h-40'");
  });
  it("오디오 — 볼륨·페이드(곡선)·지연·무음 바탕 amix", () => {
    expect(g.filter).toContain("volume=-6dB,afade=t=in:st=0:d=0.3:curve=qsin,afade=t=out:st=2.5:d=0.5:curve=qsin,adelay=200:all=1");
    expect(g.filter).toContain("amix=inputs=2:duration=first:normalize=0[aout]");
    expect(g.filter).toContain("subtitles=reel.ass");
  });
  it("LUT 은 split → lut3d → blend(strength)", () => {
    const p = sample();
    p.clips[0]!.color!.lut = { id: "film-warm", strength: 0.6 };
    const lg = buildTimelineGraph({ project: p, media: (id) => MEDIA[id], asset: () => "logo.png", lut: (id) => `luts/${id}.cube`, assName: null, outPath: "o.mp4" });
    expect(lg.filter).toMatch(/lut3d=file=luts\/film-warm\.cube\[\w+\];\[\w+\]\[\w+\]blend=all_mode=normal:all_opacity=0\.6/);
    expect(lg.filter).not.toContain("subtitles=");
  });
  it("숨긴 트랙·음소거 트랙은 뺀다, 원본 없으면 던진다", () => {
    const p = sample();
    p.tracks.find((t) => t.id === "t-overlay")!.hidden = true;
    p.tracks.find((t) => t.id === "t-audio")!.muted = true;
    const h = buildTimelineGraph({ project: p, media: (id) => MEDIA[id], assName: null, outPath: "o.mp4" });
    expect(h.filter).not.toContain("W-w-40");
    expect(h.filter).toContain("[asil]anull[aout]");
    expect(() => buildTimelineGraph({ project: sample(), media: () => undefined, assName: null, outPath: "o.mp4" })).toThrow(/원본/);
  });
  it("도우미 — 키프레임 식·atempo·xfade 이름·ASS·silencedetect", () => {
    expect(keyframeExpr([], "t", 1)).toBe("1");
    expect(keyframeExpr([{ id: "a", prop: "cx", at: 0, value: 0.5, ease: "hold" }, { id: "b", prop: "cx", at: 1000, value: 0.2, ease: "linear" }], "t", 0)).toBe("if(lt(t,0),0.5,if(lt(t,1),0.5,0.2))");
    expect(atempoChain(4)).toEqual(["atempo=2", "atempo=2"]);
    expect(atempoChain(0.25)).toEqual(["atempo=0.5", "atempo=0.5"]);
    expect(atempoChain(1)).toEqual([]);
    expect(xfadeName("slide", "up")).toBe("slideup");
    expect(xfadeName("cut")).toBeNull();
    const ass = buildTimelineAss(sample())!;
    expect(ass).toContain("Style: viral-yellow");
    expect(ass).toContain("viral-yellow,,0,0,0,,{\\an5\\pos(540,576)}TOP");
    expect(speechFromSilencedetect("[silencedetect] silence_start: 0\n[silencedetect] silence_end: 0.4 | silence_duration: 0.4\nsilence_start: 1.5\nsilence_end: 2.0\n", 3000)).toEqual([
      { from: 400, to: 1500 },
      { from: 2000, to: 3000 },
    ]);
  });
});

describe("escapeFilterPath(필터그래프 경로)", () => {
  /** ffmpeg 가 하는 두 번 풀기를 흉내 — ① 그래프(\\ ' [ ] , ;) ② 옵션(\\ ' :) */
  const unescape = (s: string, set: string) => {
    let out = "";
    for (let i = 0; i < s.length; i += 1) out += s[i] === "\\" && i + 1 < s.length && set.includes(s[i + 1]!) ? s[++i] : s[i];
    return out;
  };
  const roundTrip = (p: string) => unescape(unescape(escapeFilterPath(p), "\\'[],;"), "\\':");

  it("Windows 절대경로 — 콜론·역슬래시가 이스케이프되고 두 번 풀면 원래 경로", () => {
    const win = "C:\\Users\\yjh99\\work\\luts\\film-warm.cube";
    expect(escapeFilterPath(win)).toBe(String.raw`C\\:\\\\Users\\\\yjh99\\\\work\\\\luts\\\\film-warm.cube`);
    expect(roundTrip(win)).toBe(win);
    expect(roundTrip("/mnt/d/a/b.ass")).toBe("/mnt/d/a/b.ass");
  });

  it("주입 시도(' , ; [ ] :)는 값 안에 갇힌다 — 이스케이프 안 된 구분자가 남지 않는다", () => {
    const evil = "x.cube':file=/etc/passwd[o];[o]drawtext=text=hi,null";
    const e = escapeFilterPath(evil);
    expect(roundTrip(evil)).toBe(evil);
    // 그래프 수준에서 역슬래시 없이 남은 구분자가 없다
    expect(e.replace(/\\./g, "")).not.toMatch(/['[\],;:]/);
  });

  it("줄바꿈·제어 문자·빈 값은 거부", () => {
    expect(() => escapeFilterPath("a\nb.ass")).toThrow(/쓸 수 없는/);
    expect(() => escapeFilterPath("")).toThrow();
  });

  it("그래프에 Windows 경로 LUT·ASS·서체 폴더가 그대로(이스케이프되어) 들어간다", () => {
    const p = sample();
    p.clips[0]!.color!.lut = { id: "film-warm", strength: 0.5 };
    const g = buildTimelineGraph({ project: p, media: (id) => MEDIA[id], asset: () => "logo.png", lut: () => "D:\\luts\\film-warm.cube", assName: "C:\\out\\reel.ass", fontsDir: "C:\\fonts", outPath: "o.mp4" });
    expect(g.filter).toContain(`lut3d=file=${escapeFilterPath("D:\\luts\\film-warm.cube")}[`);
    expect(g.filter).toContain(`subtitles=${escapeFilterPath("C:\\out\\reel.ass")}:fontsdir=${escapeFilterPath("C:\\fonts")}`);
  });

  it(
    "진짜 ffmpeg — 따옴표·쉼표·대괄호·공백이 든 절대경로의 ASS 를 subtitles 로 굽는다",
    async () => {
      await assertFfmpegReady(BINS, { burnIn: true });
      const dir = await mkdtemp(join(tmpdir(), "yunseo-esc 'a,b[c];d-"));
      try {
        const ass = join(dir, "x.ass");
        await writeFile(ass, "[Script Info]\nScriptType: v4.00+\nPlayResX: 64\nPlayResY: 64\n\n[V4+ Styles]\nFormat: Name, Fontsize\nStyle: Default,20\n\n[Events]\nFormat: Layer, Start, End, Style, Text\nDialogue: 0,0:00:00.00,0:00:01.00,Default,hi\n");
        const r = await runProcess(BINS.ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=0.2", "-filter_complex", `[0:v]subtitles=${escapeFilterPath(ass)}[v]`, "-map", "[v]", "-frames:v", "1", "-f", "null", "-"]);
        expect(r.code).toBe(0);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    60_000,
  );
});

// ── 통합: 진짜 ffmpeg 로 3.6초 샘플 렌더 ─────────────────────
const BINS: FfmpegBinaries = { ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg", ffprobePath: process.env.FFPROBE_PATH ?? "ffprobe" };
let root = "";
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("composeTimeline(ffmpeg)", () => {
  it(
    "트림·속도·자막·텍스트·오디오 믹스·색보정·전환·줌·워터마크 → 1080x1920 mp4",
    async () => {
      await assertFfmpegReady(BINS, { burnIn: true });
      root = await mkdtemp(join(tmpdir(), "yunseo-timeline-"));
      const make = (name: string, color: string) =>
        runProcess(BINS.ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `color=c=${color}:s=640x360:r=30:d=4`, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast", join(root, name)]);
      await make("red.mp4", "red");
      await make("blue.mp4", "blue");
      await runProcess(BINS.ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=white:s=200x80:d=1", "-frames:v", "1", join(root, "logo.png")]);
      await writeTone(BINS.ffmpegPath, join(root, "tone.wav"), 3);
      const abs: Record<string, TimelineMedia> = Object.fromEntries(Object.entries(MEDIA).map(([k, v]) => [k, { ...v, path: join(root, v.path) }]));
      const out = await composeTimeline({
        project: sample(),
        media: (id) => abs[id],
        asset: () => join(root, "logo.png"),
        outDir: join(root, "out"),
        bins: BINS,
        encoder: { preset: "ultrafast", crf: 28, threads: 2 },
      });
      expect(out.probe.video).toMatchObject({ codec: "h264", width: 1080, height: 1920, pixFmt: "yuv420p" });
      expect(Math.round(out.probe.video!.fps)).toBe(30);
      expect(out.probe.audio).toMatchObject({ codec: "aac", sampleRate: 48000 });
      expect(Math.abs((out.probe.formatDurationSec ?? 0) - 3.6)).toBeLessThan(0.15);
      // 0.3초: 빨간 화면(첫 클립) · 3.2초: 파란 화면(전환 뒤 둘째 클립)
      const f1 = await grabFrame(BINS.ffmpegPath, out.videoPath, 0.3);
      const [r1, , b1] = pixelAt(f1, 540, 1200);
      expect(r1).toBeGreaterThan(150);
      expect(b1).toBeLessThan(100);
      const f2 = await grabFrame(BINS.ffmpegPath, out.videoPath, 3.2);
      const [r2, , b2] = pixelAt(f2, 540, 1200);
      expect(b2).toBeGreaterThan(150);
      expect(r2).toBeLessThan(100);
      // 워터마크(흰색, 오른쪽 아래)
      const [wr, wg, wb] = pixelAt(f2, 1080 - 40 - 50, 1920 - 40 - 20);
      expect(Math.min(wr, wg, wb)).toBeGreaterThan(200);
    },
    180_000,
  );
});
