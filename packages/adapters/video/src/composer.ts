// ReelComposer 구현 — 카드 세트 → 9:16 MP4(+SRT). 계획·배치 규칙은 domain, 여기서는 파일과 ffmpeg 만 다룬다.
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { CardRenderResult, RenderedFile, ReelComposer, ReelResult } from "@yunseo/application";
import {
  AppError,
  DEFAULT_REEL_PRESET,
  buildSrt,
  computeReelLayout,
  planReel,
  reelLayoutIssues,
  reelPresetIssues,
  type ReelPreset,
  type ReelTransitionName,
} from "@yunseo/domain";
import { buildAss } from "./ass";
import { DEFAULT_ENCODER, buildFfmpegArgs, type AudioSlot, type EncoderOptions } from "./ffmpeg-args";
import { reelSpecIssues } from "./ffprobe";
import { DEFAULT_BINARIES, FfmpegRunError, assertFfmpegReady, probeMedia, runProcess, tailOf, type FfmpegBinaries } from "./ffmpeg-runner";
import { readPngSize } from "./png";
import { isWoff1, sfntExtension, woffToSfnt } from "./woff";

export interface FfmpegReelComposerOptions extends Partial<FfmpegBinaries> {
  preset?: ReelPreset;
  transition?: ReelTransitionName;
  /** 음성·음악 자리. 경로가 주어진 것만 섞는다. 기본 없음 */
  tracks?: readonly AudioSlot[];
  /** 카드별 자막 문장을 직접 줄 때(카드 수와 같은 길이). 없으면 카드의 대체 텍스트(altTexts)에서 첫 문장을 쓴다 */
  subtitleTexts?: readonly string[];
  /** 서체 폴더 — 서체를 이름만으로 못 찾는 환경용(저장소의 Pretendard 등). 합성 때 작업 폴더로 복사해 쓰므로 경로 글자 제한이 없다 */
  fontsDir?: string;
  encoder?: Partial<EncoderOptions>;
}

/** 규칙 위반으로 합성을 시작하지 않았을 때 */
export class ReelComposeError extends AppError<"REEL_RULE_VIOLATION"> {
  override name = "ReelComposeError";
  constructor(
    message: string,
    readonly problems: readonly string[],
  ) {
    super("REEL_RULE_VIOLATION", `${message}\n${problems.map((p) => `  - ${p}`).join("\n")}`, { status: 422, details: { problems } });
  }
}

const safeName = (id: string) => id.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "piece";

async function describeFile(path: string, name: string): Promise<RenderedFile> {
  const bytes = await readFile(path);
  return { name, path, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export function createFfmpegReelComposer(options: FfmpegReelComposerOptions = {}): ReelComposer {
  const preset = options.preset ?? DEFAULT_REEL_PRESET;
  const bins: FfmpegBinaries = { ffmpegPath: options.ffmpegPath ?? DEFAULT_BINARIES.ffmpegPath, ffprobePath: options.ffprobePath ?? DEFAULT_BINARIES.ffprobePath };
  const encoder: EncoderOptions = { ...DEFAULT_ENCODER, ...options.encoder };

  return {
    async compose(cards: CardRenderResult, outDir: string): Promise<ReelResult> {
      const warnings: string[] = [];
      // 호출한 쪽의 작업 폴더 기준 상대 경로를 여기서 절대 경로로 굳힌다 — ffmpeg 는 작업 폴더(.reel-work-*)에서 실행되므로
      // 상대 경로로 넘기면 존재 점검(stat)은 통과하고 ffmpeg 만 엉뚱한 곳을 본다
      const tracks: readonly AudioSlot[] = (options.tracks ?? []).map((t) => ({ ...t, path: resolve(t.path) }));
      const fontsDir = options.fontsDir === undefined ? undefined : resolve(options.fontsDir);

      // 1) 입력 점검 — 시작 전에 규칙 위반을 한꺼번에 알린다
      const presetIssues = [...reelPresetIssues(preset), ...reelLayoutIssues(computeReelLayout(preset))];
      if (presetIssues.length > 0) throw new ReelComposeError("릴스 프리셋이 규칙에 어긋난다", presetIssues);
      if (cards.cards.length === 0) throw new ReelComposeError("카드가 없어 릴스를 만들 수 없다", ["cards 가 비어 있다"]);

      const cardPaths = cards.cards.map((c) => resolve(c.path));
      const cardProblems: string[] = [];
      for (const [i, path] of cardPaths.entries()) {
        const bytes = await readFile(path).catch(() => null);
        if (bytes === null) {
          cardProblems.push(`${i + 1}번 카드 파일을 읽을 수 없다: ${path}`);
          continue;
        }
        const size = readPngSize(bytes);
        if (size === null) cardProblems.push(`${i + 1}번 카드가 PNG 가 아니다: ${basename(path)}`);
        else if (size.width * preset.cardSource.height !== size.height * preset.cardSource.width) {
          warnings.push(`reel/card-size: ${i + 1}번 카드가 4:5 가 아니다(${size.width}x${size.height}) — 비율을 유지한 채 맞춰 넣는다`);
        } else if (size.width !== preset.cardSource.width) {
          warnings.push(`reel/card-size: ${i + 1}번 카드가 ${preset.cardSource.width}x${preset.cardSource.height} 가 아니다(${size.width}x${size.height})`);
        }
      }
      for (const track of tracks) {
        if (!(await stat(track.path).then((s) => s.isFile(), () => false))) cardProblems.push(`${track.role} 파일이 없다: ${track.path}`);
      }
      if (cardProblems.length > 0) throw new ReelComposeError("입력 파일에 문제가 있다", cardProblems);

      // 2) 장면 계획
      const texts = options.subtitleTexts ?? cards.altTexts;
      if (texts.length !== cards.cards.length) {
        warnings.push(`reel/alt-texts-mismatch: 자막 문장 ${texts.length}개, 카드 ${cards.cards.length}장 — 모자란 카드는 자막 없이 간다`);
      }
      const plan = planReel(cards.cards.map((_, i) => ({ text: texts[i] ?? "" })), preset, options.transition === undefined ? {} : { transition: options.transition });
      warnings.push(...plan.warnings);
      if (plan.violations.length > 0) throw new ReelComposeError("릴스 길이 규칙을 지킬 수 없다", plan.violations);

      // 3) ffmpeg 점검 — 없으면 건너뛰지 않고 실패한다
      await assertFfmpegReady(bins, { burnIn: preset.subtitle.burnIn });

      // 4) 산출물은 작업 폴더에서 만들어 규격 검사를 통과한 뒤에만 제자리로 옮긴다 — 실패하면 기존 정상 파일(mp4·SRT)이 그대로 남는다
      const absOut = resolve(outDir);
      await mkdir(absOut, { recursive: true });
      const stem = `${safeName(cards.pieceId)}-reel`;
      const videoPath = join(absOut, `${stem}.mp4`);
      const srtPath = join(absOut, `${stem}.srt`);
      const cues = plan.scenes.flatMap((s) =>
        s.cue === null ? [] : [{ startMs: Math.round((s.cue.startFrame * 1000) / plan.fps), endMs: Math.round((s.cue.endFrame * 1000) / plan.fps), text: s.cue.lines.join("\n") }],
      );

      const work = await mkdtemp(join(absOut, ".reel-work-"));
      let probe: Awaited<ReturnType<typeof probeMedia>>;
      try {
        const workVideo = join(work, `${stem}.mp4`);
        const workSrt = join(work, `${stem}.srt`);
        if (cues.length > 0) await writeFile(workSrt, buildSrt(cues), "utf8");
        const burn = preset.subtitle.burnIn && cues.length > 0;
        if (burn) await writeFile(join(work, "subtitles.ass"), buildAss(plan, preset), "utf8");
        // [L7] 서체는 작업 폴더의 fonts/ 로 복사해 상대 경로로 넘긴다 — Windows 절대 경로(C:\…)는 필터 값에 쓸 수 없는 글자(: \)가 있다
        let workFonts: string | undefined;
        if (burn && fontsDir !== undefined) {
          await mkdir(join(work, "fonts"));
          const copied = await stageSubtitleFonts(fontsDir, join(work, "fonts"));
          if (copied.length === 0) throw new ReelComposeError("서체 폴더에 libass 가 읽을 서체(TTF·OTF·TTC·WOFF1)가 없다", [fontsDir]);
          workFonts = "fonts";
        }
        const args = buildFfmpegArgs({ plan, preset, cardPaths, assName: burn ? "subtitles.ass" : null, fontsDir: workFonts, outPath: workVideo, tracks, encoder });
        // 필터가 상대 경로(subtitles.ass)를 쓰므로 작업 폴더에서 실행한다 — 카드·음원·서체 폴더·출력은 절대 경로
        const run = await runProcess(bins.ffmpegPath, args, { cwd: work });
        if (run.spawnError !== null || run.code !== 0) {
          throw new FfmpegRunError(`ffmpeg 실패(종료 코드 ${run.code ?? "없음"}): ${run.spawnError ?? tailOf(run.stderr, 12)}`, run);
        }
        if (run.stderr.trim()) warnings.push(`reel/ffmpeg-warning: ${run.stderr.trim().split("\n").slice(-3).join(" | ")}`);

        // 5) 산출물 규격 검사 — 약속한 모양이 아니면 성공으로 돌려보내지 않는다
        probe = await probeMedia(bins, workVideo);
        const specIssues = reelSpecIssues(probe, {
          width: preset.canvas.width,
          height: preset.canvas.height,
          fps: preset.canvas.fps,
          durationSec: plan.totalSec,
          toleranceSec: 0.5,
          expectAudio: tracks.length > 0 || preset.audio.silentTrack,
        });
        if (specIssues.length > 0) throw new ReelComposeError("산출 영상이 규격에 어긋난다", specIssues);

        await rename(workVideo, videoPath);
        if (cues.length > 0) await rename(workSrt, srtPath);
        else await rm(srtPath, { force: true });
      } finally {
        await rm(work, { recursive: true, force: true });
      }

      return {
        pieceId: cards.pieceId,
        video: await describeFile(videoPath, basename(videoPath)),
        durationSec: Math.round((probe.video?.durationSec ?? probe.formatDurationSec ?? plan.totalSec) * 100) / 100,
        subtitles: cues.length > 0 ? await describeFile(srtPath, basename(srtPath)) : null,
        warnings,
      };
    },
  };
}

/**
 * [L9] 자막용 서체를 작업 폴더로 옮긴다 — TTF·OTF·TTC 는 그대로 복사, WOFF1 은 SFNT(OTF/TTF)로 무손실 변환해 넣는다.
 * libass 는 WOFF 를 못 읽어 경고 뒤 다른 서체로 대신 그렸다. WOFF2 는 변환하지 않고 넣지도 않는다(넣으면 같은 경고가 난다).
 * 같은 이름의 TTF/OTF 가 이미 있으면 WOFF 는 건너뛴다. 넣은 파일 이름을 돌려준다.
 */
export async function stageSubtitleFonts(fontsDir: string, dest: string): Promise<string[]> {
  const names = (await readdir(fontsDir)).sort();
  const stem = (f: string) => f.replace(/\.[^.]+$/, "").toLowerCase();
  const direct = names.filter((f) => /\.(?:ttf|otf|ttc)$/i.test(f));
  const have = new Set(direct.map(stem));
  const out: string[] = [];
  for (const f of direct) {
    await copyFile(join(fontsDir, f), join(dest, f));
    out.push(f);
  }
  for (const f of names.filter((x) => /\.woff$/i.test(x) && !have.has(stem(x)))) {
    const bytes = await readFile(join(fontsDir, f));
    if (!isWoff1(bytes)) continue;
    const sfnt = woffToSfnt(bytes);
    const name = `${f.replace(/\.woff$/i, "")}${sfntExtension(sfnt)}`;
    await writeFile(join(dest, name), sfnt);
    out.push(name);
  }
  return out;
}
