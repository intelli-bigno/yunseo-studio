// 통합 테스트 — 진짜 ffmpeg 로 짧은 릴스를 만들고 ffprobe·프레임 픽셀로 규격을 확인한다.
// ffmpeg 가 없으면 건너뛰지 않고 실패한다: beforeAll 의 assertFfmpegReady 가 이유와 해결 방법을 담은 메시지를 던진다.
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_REEL_PRESET, REEL_TRANSITION_SEC, computeReelLayout, insideSafeArea, planReel, reelPresetIssues, type ReelPreset } from "@yunseo/domain";
import { ReelComposeError, createFfmpegReelComposer } from "./composer";
import { assertFfmpegReady, probeMedia, type FfmpegBinaries } from "./ffmpeg-runner";
import { brightBounds, grabFrame, pixelAt, writeCardFixtures, writeTone } from "./testing";

const BINS: FfmpegBinaries = { ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg", ffprobePath: process.env.FFPROBE_PATH ?? "ffprobe" };

// 짧은 시험용 프리셋: 장면 2.5초 고정, 전체 5~20초. 규칙(전환 2번 + 자막 1초)은 그대로 지킨다.
const FAST: ReelPreset = { ...DEFAULT_REEL_PRESET, totalSec: { min: 5, max: 20 }, scene: { minSec: 2.5, maxSec: 2.5, baseSec: 1, charsPerSec: 14, stretchMaxSec: 4 } };
const ENCODER = { preset: "ultrafast", crf: 28, threads: 1 } as const;

const COLORS = [
  [24, 40, 90],
  [90, 40, 24],
  [30, 80, 40],
] as const;
const ALT = ["Rates move first.", "Prices follow later on.", "Watch the core reading closely."];

let root = "";
let layout = computeReelLayout(FAST);

beforeAll(async () => {
  // ffmpeg 가 없거나 기능이 빠졌으면 여기서 메시지와 함께 실패한다 (skip 아님)
  await assertFfmpegReady(BINS, { burnIn: true });
  root = await mkdtemp(join(tmpdir(), "yunseo-reel-test-"));
  layout = computeReelLayout(FAST);
}, 60_000);

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

const composer = (extra: Parameters<typeof createFfmpegReelComposer>[0] = {}) => createFfmpegReelComposer({ ...BINS, preset: FAST, encoder: ENCODER, ...extra });

describe("ffmpeg 가 있는 환경", () => {
  it("테스트 프리셋은 규칙을 지킨다", () => {
    expect(reelPresetIssues(FAST)).toEqual([]);
  });

  it("릴스를 만든다: 1080x1920 · H.264 · yuv420p · 30fps · AAC 무음 트랙 · 계획된 길이", async () => {
    const cards = await writeCardFixtures(join(root, "basic-cards"), COLORS, ALT);
    const out = join(root, "basic-out");
    const reel = await composer().compose(cards, out);

    const plan = planReel(ALT.map((text) => ({ text })), FAST);
    const probe = await probeMedia(BINS, reel.video.path);
    expect(probe.video).toMatchObject({ codec: "h264", width: 1080, height: 1920, pixFmt: "yuv420p", fps: 30 });
    expect(probe.audio).toMatchObject({ codec: "aac", sampleRate: 48000, channels: 2 });
    expect(probe.video?.frames, "프레임 수가 계획과 정확히 같다").toBe(plan.totalFrames);
    expect(Math.abs((probe.video?.durationSec ?? 0) - plan.totalSec)).toBeLessThan(0.1);
    expect(probe.formatName).toContain("mp4");

    // 계약(ReelResult): 파일 정보는 실제 파일과 맞는다
    const bytes = await readFile(reel.video.path);
    expect(reel.pieceId).toBe("fixture-piece");
    expect(reel.video.bytes).toBe(bytes.byteLength);
    expect(reel.video.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(reel.video.name).toBe("fixture-piece-reel.mp4");
    expect(reel.durationSec).toBeCloseTo(plan.totalSec, 0);
    expect(reel.warnings).toEqual([]);

    // SRT: 큐 3개, 시각은 계획과 같다
    const srt = await readFile(reel.subtitles!.path, "utf8");
    expect(srt).toContain("1\n00:00:00,000 -->");
    expect(srt.match(/-->/g)?.length).toBe(3);
    expect(srt).toContain("Rates move first.");
    expect(reel.subtitles!.sha256).toBe(createHash("sha256").update(srt).digest("hex"));

    // 중간 파일(ASS 작업 폴더)은 남지 않는다
    expect((await readdir(out)).sort()).toEqual(["fixture-piece-reel.mp4", "fixture-piece-reel.srt"]);
  }, 120_000);

  it("장면 순서·전환·자막이 계획대로 영상에 들어간다 (프레임 픽셀 검사)", async () => {
    const cards = await writeCardFixtures(join(root, "frames-cards"), COLORS, ALT);
    const reel = await composer({ transition: "crossfade" }).compose(cards, join(root, "frames-out"));
    const plan = planReel(ALT.map((text) => ({ text })), FAST, { transition: "crossfade" });
    const centerX = layout.card.x + layout.card.w / 2;
    const centerY = layout.card.y + layout.card.h / 2;
    const near = (a: readonly number[], b: readonly number[], tol = 10) => a.every((v, i) => Math.abs(v - b[i]!) <= tol);

    // 각 장면이 온전히 보이는 한가운데: 카드 색이 그대로, 자막이 있고, 자막은 전부 안전영역 안·자막 칸 안
    for (const [i, scene] of plan.scenes.entries()) {
      const mid = (scene.cue!.startSec + scene.cue!.endSec) / 2;
      const frame = await grabFrame(BINS.ffmpegPath, reel.video.path, mid);
      expect(near(pixelAt(frame, Math.round(centerX), Math.round(centerY)), COLORS[i]!), `장면 ${i + 1} 카드 색`).toBe(true);
      const bright = brightBounds(frame);
      expect(bright, `장면 ${i + 1} 자막`).not.toBeNull();
      expect(bright!.count).toBeGreaterThan(300);
      expect(insideSafeArea(bright!, layout), `장면 ${i + 1} 자막 경계 ${JSON.stringify(bright)}`).toBe(true);
      expect(bright!.y).toBeGreaterThanOrEqual(layout.subtitleBox.y);
      expect(bright!.y + bright!.h).toBeLessThanOrEqual(layout.subtitleBox.y + layout.subtitleBox.h);
    }

    // 전환 한가운데: 자막은 없고(카드가 온전히 보일 때만 뜬다), 카드 색은 앞뒤 장면 사이의 값이다
    const t = REEL_TRANSITION_SEC.crossfade;
    const blend = await grabFrame(BINS.ffmpegPath, reel.video.path, plan.scenes[1]!.startSec + t / 2);
    expect(brightBounds(blend)).toBeNull();
    const [r] = pixelAt(blend, Math.round(centerX), Math.round(centerY));
    expect(r).toBeGreaterThan(Math.min(COLORS[0]![0], COLORS[1]![0]) + 15);
    expect(r).toBeLessThan(Math.max(COLORS[0]![0], COLORS[1]![0]) - 15);
  }, 180_000);

  it("전환 프리셋마다 길이가 겹침만큼 줄어든다 (crossfade·dip·slide·cut)", async () => {
    const cards = await writeCardFixtures(join(root, "tr-cards"), COLORS, ALT);
    for (const transition of ["crossfade", "dip", "slide", "cut"] as const) {
      const reel = await composer({ transition }).compose(cards, join(root, `tr-out-${transition}`));
      const plan = planReel(ALT.map((text) => ({ text })), FAST, { transition });
      expect(plan.totalSec, transition).toBeCloseTo(3 * 2.5 - 2 * REEL_TRANSITION_SEC[transition], 1);
      expect(Math.abs(reel.durationSec - plan.totalSec), transition).toBeLessThan(0.3);
    }
  }, 240_000);

  it("기본 프리셋(15~45초)으로 카드 3장을 합성하면 15초 이상이다", async () => {
    const long = ["Inflation data lands on Tuesday and sets the tone for the week.", "The central bank may hold steady while markets weigh every word.", "Watch the core reading before drawing any conclusion at all."];
    const cards = await writeCardFixtures(join(root, "default-cards"), COLORS, long);
    const reel = await createFfmpegReelComposer({ ...BINS, encoder: ENCODER }).compose(cards, join(root, "default-out"));
    expect(reel.durationSec).toBeGreaterThanOrEqual(14.7);
    expect(reel.durationSec).toBeLessThanOrEqual(45);
    const probe = await probeMedia(BINS, reel.video.path);
    expect(probe.video).toMatchObject({ width: 1080, height: 1920, codec: "h264" });
  }, 240_000);

  it("음성·음악 파일을 주면 섞고, 길이는 영상과 같다 (슬롯)", async () => {
    const voice = join(root, "voice.wav");
    const music = join(root, "music.wav");
    await writeTone(BINS.ffmpegPath, voice, 2, 440);
    await writeTone(BINS.ffmpegPath, music, 1, 220); // 영상보다 짧아도 반복해 끝까지 간다
    const cards = await writeCardFixtures(join(root, "audio-cards"), COLORS, ALT);
    const reel = await composer({ tracks: [{ role: "voice", path: voice }, { role: "music", path: music }] }).compose(cards, join(root, "audio-out"));
    const probe = await probeMedia(BINS, reel.video.path);
    expect(probe.audio).toMatchObject({ codec: "aac", channels: 2 });
    const total = planReel(ALT.map((text) => ({ text })), FAST).totalSec;
    expect(Math.abs((probe.formatDurationSec ?? 0) - total)).toBeLessThan(0.4);
  }, 180_000);

  it("상대 경로 음원·서체 폴더도 호출 위치 기준으로 읽는다 (ffmpeg 는 작업 폴더에서 돌아도 절대 경로를 받는다)", async () => {
    const dir = join(root, "rel");
    await mkdir(join(dir, "fonts"), { recursive: true });
    // [L7] 저장소의 Pretendard(L1 이 둔 서체) — 합성은 작업 폴더로 복사해 상대 경로 fonts 로 넘긴다
    await copyFile(fileURLToPath(new URL("../../render-html/fonts/Pretendard-Regular.woff", import.meta.url)), join(dir, "fonts", "Pretendard-Regular.woff"));
    const voice = join(dir, "voice.wav");
    const music = join(dir, "music.wav");
    await writeTone(BINS.ffmpegPath, voice, 2, 440);
    await writeTone(BINS.ffmpegPath, music, 1, 220);
    // ffmpeg 에 실제로 넘어간 인자를 기록하는 얇은 껍데기 — 진짜 ffmpeg 를 그대로 실행한다
    const logPath = join(dir, "calls.log");
    const wrapper = join(dir, "ffmpeg-wrap.sh");
    await writeFile(wrapper, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${logPath}'\nexec '${BINS.ffmpegPath}' "$@"\n`);
    await chmod(wrapper, 0o755);

    const cwd = process.cwd();
    const relVoice = relative(cwd, voice);
    const relMusic = relative(cwd, music);
    const relFonts = relative(cwd, join(dir, "fonts"));
    expect(isAbsolute(relVoice) || isAbsolute(relFonts), "시험 입력은 상대 경로다").toBe(false);

    const cards = await writeCardFixtures(join(dir, "cards"), COLORS, ALT);
    const reel = await composer({
      ffmpegPath: wrapper,
      fontsDir: relFonts,
      tracks: [
        { role: "voice", path: relVoice },
        { role: "music", path: relMusic },
      ],
    }).compose(cards, join(dir, "out"));

    const probe = await probeMedia(BINS, reel.video.path);
    expect(probe.audio).toMatchObject({ codec: "aac", channels: 2 });
    const calls = (await readFile(logPath, "utf8")).split("\n");
    const render = calls.find((line) => line.includes("-filter_complex"));
    expect(render, "합성 호출이 기록됐다").toBeDefined();
    expect(render).toContain(`-i ${resolve(voice)}`);
    expect(render).toContain(`-i ${resolve(music)}`);
    expect(render, "서체는 작업 폴더로 복사한 fonts 를 쓴다(Windows 경로 글자 회피)").toContain("fontsdir=fonts,");
    expect(render, "상대 경로가 그대로 넘어가지 않는다").not.toContain(`-i ${relVoice}`);
    expect(render).not.toContain(`fontsdir=${relFonts}`);
  }, 180_000);

  it("합성이 실패하면 기존 정상 mp4·SRT 를 건드리지 않고 작업 폴더도 남기지 않는다", async () => {
    const dir = join(root, "keep");
    const cards = await writeCardFixtures(join(dir, "cards"), COLORS, ALT);
    const out = join(dir, "out");
    const good = await composer().compose(cards, out);
    const before = { video: await readFile(good.video.path), srt: await readFile(good.subtitles!.path) };

    // 존재하지만 오디오가 아닌 파일 → 사전 점검은 통과하고 ffmpeg 가 입력을 못 읽어 실패한다
    const junk = join(dir, "junk.wav");
    await writeFile(junk, "not audio at all");
    await expect(composer({ tracks: [{ role: "voice", path: junk }] }).compose(cards, out)).rejects.toThrow("ffmpeg 실패");

    expect((await readdir(out)).sort()).toEqual(["fixture-piece-reel.mp4", "fixture-piece-reel.srt"]);
    expect((await readFile(good.video.path)).equals(before.video)).toBe(true);
    expect((await readFile(good.subtitles!.path)).equals(before.srt)).toBe(true);
  }, 180_000);

  it("프리셋이 무음 트랙을 끄면 오디오 스트림이 없다", async () => {
    const cards = await writeCardFixtures(join(root, "noaudio-cards"), COLORS, ALT);
    const reel = await composer({ preset: { ...FAST, audio: { ...FAST.audio, silentTrack: false } } }).compose(cards, join(root, "noaudio-out"));
    expect((await probeMedia(BINS, reel.video.path)).audio).toBeNull();
  }, 120_000);

  it("번인을 끄면 자막이 영상에 없고 SRT 만 나온다", async () => {
    const cards = await writeCardFixtures(join(root, "noburn-cards"), COLORS, ALT);
    const reel = await composer({ preset: { ...FAST, subtitle: { ...FAST.subtitle, burnIn: false } } }).compose(cards, join(root, "noburn-out"));
    const plan = planReel(ALT.map((text) => ({ text })), FAST);
    const frame = await grabFrame(BINS.ffmpegPath, reel.video.path, (plan.scenes[0]!.cue!.startSec + plan.scenes[0]!.cue!.endSec) / 2);
    expect(brightBounds(frame)).toBeNull();
    expect(reel.subtitles).not.toBeNull();
  }, 120_000);

  it("자막 문장이 없는 카드는 자막 없이 가고 경고한다", async () => {
    const cards = await writeCardFixtures(join(root, "nosub-cards"), COLORS, ["Only the first has text.", "", ""]);
    const reel = await composer().compose(cards, join(root, "nosub-out"));
    expect(reel.warnings.filter((w) => w.startsWith("reel/no-subtitle")).length).toBe(2);
    expect((await readFile(reel.subtitles!.path, "utf8")).match(/-->/g)?.length).toBe(1);
  }, 120_000);

  it("규칙을 못 지키면 ffmpeg 를 돌리기 전에 ReelComposeError 로 실패한다", async () => {
    const one = await writeCardFixtures(join(root, "one-cards"), [COLORS[0]], ["Just one card."]);
    // ffmpeg 경로가 틀려도 규칙 위반이 먼저 보고된다 = 합성 전에 걸러진다
    const bad = createFfmpegReelComposer({ ffmpegPath: "/no/such/ffmpeg", ffprobePath: "/no/such/ffprobe" });
    await expect(bad.compose(one, join(root, "one-out"))).rejects.toThrow(ReelComposeError);
    await expect(bad.compose(one, join(root, "one-out"))).rejects.toThrow("reel/too-short");
    const none = { ...one, cards: [], altTexts: [] };
    await expect(bad.compose(none, join(root, "none-out"))).rejects.toThrow("카드가 없어");
  });

  it("카드 파일이 없거나 PNG 가 아니면 이유를 모아 알린다", async () => {
    const cards = await writeCardFixtures(join(root, "badcard-cards"), COLORS, ALT);
    const notPng = join(root, "badcard-cards", "not-a-png.txt");
    await writeFile(notPng, "this is not a PNG");
    const broken = { ...cards, cards: [cards.cards[0]!, { ...cards.cards[1]!, path: join(root, "missing.png") }, { ...cards.cards[2]!, path: notPng }] };
    const error = await composer().compose(broken, join(root, "badcard-out")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReelComposeError);
    expect((error as Error).message).toContain("2번 카드 파일을 읽을 수 없다");
    expect((error as Error).message).toContain("3번 카드가 PNG 가 아니다");
  });

  it("4:5 가 아닌 카드는 경고하고 비율을 유지한 채 넣는다", async () => {
    const cards = await writeCardFixtures(join(root, "odd-cards"), COLORS, ALT, { width: 1080, height: 1080 });
    const reel = await composer().compose(cards, join(root, "odd-out"));
    expect(reel.warnings.filter((w) => w.startsWith("reel/card-size")).length).toBe(3);
    expect((await probeMedia(BINS, reel.video.path)).video).toMatchObject({ width: 1080, height: 1920 });
  }, 120_000);
});

describe("ffmpeg 가 없는 환경 (명확한 실패)", () => {
  it("없는 실행 파일이면 이유와 해결 방법을 담아 던진다 — 건너뛰지 않는다", async () => {
    await expect(assertFfmpegReady({ ffmpegPath: "/no/such/ffmpeg", ffprobePath: "ffprobe" }, { burnIn: true })).rejects.toThrow(/ffmpeg 를 실행할 수 없다.*win auto/s);
    await expect(assertFfmpegReady({ ffmpegPath: "ffmpeg", ffprobePath: "/no/such/ffprobe" }, { burnIn: true })).rejects.toThrow("ffprobe 를 실행할 수 없다");
  });

  it("합성기도 같은 메시지로 실패한다", async () => {
    const cards = await writeCardFixtures(join(root, "nobin-cards"), COLORS, ALT);
    await expect(createFfmpegReelComposer({ preset: FAST, ffmpegPath: "/no/such/ffmpeg" }).compose(cards, join(root, "nobin-out"))).rejects.toThrow("ffmpeg 를 실행할 수 없다");
  });
});
