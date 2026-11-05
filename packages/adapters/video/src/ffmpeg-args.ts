// ffmpeg 인자 만들기 — 순수 함수. 프로세스를 띄우지 않으니 어디서든 단위 테스트가 된다.
import { computeReelLayout, type ReelPlan, type ReelPreset, type ReelTransitionName } from "@yunseo/domain";

/** 음성·음악 자리. 경로가 주어질 때만 섞는다 — 기본은 없음(docs/08 D6: 자막만) */
export interface AudioSlot {
  role: "voice" | "music";
  path: string;
  /** 음량 보정(dB). 기본: 음성 0, 음악 −18 [미검증 — 배경 음악이 자막 읽기를 방해하지 않는 선] */
  gainDb?: number;
}

export interface EncoderOptions {
  crf: number;
  /** x264 preset 이름 (ultrafast … veryslow) */
  preset: string;
  /**
   * 인코더·필터가 만드는 스레드 상한. 기본(코어 수만큼)으로 두면 스레드 수가 제한된 환경에서 터진다:
   * Windows 실행기의 작업 cgroup 은 pids.max=256 인데 코어가 24개라, 장면 8개짜리 필터 그래프 + x264 가 스레드를 못 만들어
   * 「Failed to configure output pad on Parsed_scale_N」「Error while opening encoder … Generic error」로 죽었다(2026-11-05 실측).
   */
  threads: number;
}

export const DEFAULT_ENCODER: EncoderOptions = { crf: 20, preset: "medium", threads: 4 };

export interface BuildFfmpegInput {
  plan: ReelPlan;
  preset: ReelPreset;
  /** plan.scenes 와 같은 순서 */
  cardPaths: readonly string[];
  /** 번인할 ASS 파일 이름(작업 디렉터리 기준). null 이면 자막을 새기지 않는다 */
  assName: string | null;
  fontsDir?: string | undefined;
  outPath: string;
  tracks?: readonly AudioSlot[];
  encoder?: EncoderOptions;
}

/** 도메인의 전환 이름 → ffmpeg xfade 효과. cut 은 null (겹치지 않고 이어 붙인다) */
export const XFADE_EFFECT: Readonly<Record<ReelTransitionName, string | null>> = {
  cut: null,
  crossfade: "fade",
  dip: "fadeblack",
  slide: "slideleft",
};

const SAFE_FILTER_VALUE = /^[A-Za-z0-9_./-]+$/;
const sec = (n: number) => n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");

/** 필터 옵션 값에 쓸 수 있는 문자만 허용한다 — ffmpeg 필터 이스케이프 규칙을 피하려고 이름을 제한한다 */
function filterValue(value: string, what: string): string {
  if (!SAFE_FILTER_VALUE.test(value)) throw new Error(`${what} 에는 영문·숫자·._/- 만 쓸 수 있다: ${value}`);
  return value;
}

export function buildFilterGraph(input: BuildFfmpegInput): string {
  const { plan, preset } = input;
  const layout = computeReelLayout(preset);
  const { width: W, height: H, fps } = preset.canvas;
  const { card } = layout;
  const small = { w: Math.max(2, Math.round(W / 8 / 2) * 2), h: Math.max(2, Math.round(H / 8 / 2) * 2) };
  const parts: string[] = [];

  // 장면마다: 배경(같은 카드를 흐리고 어둡게) + 카드(4:5)를 안전영역 안에. 색 변환은 bt709·TV 범위로 한 번만 한다
  plan.scenes.forEach((_, i) => {
    parts.push(`[${i}:v]split=2[bs${i}][fs${i}]`);
    parts.push(
      `[bs${i}]scale=${W}:${H}:force_original_aspect_ratio=increase:out_color_matrix=bt709:out_range=tv,format=yuv420p,crop=${W}:${H},` +
        `scale=${small.w}:${small.h}:flags=bilinear,gblur=sigma=${preset.background.blurSigma},scale=${W}:${H}:flags=bicubic,` +
        `eq=brightness=${-preset.background.dim}[b${i}]`,
    );
    parts.push(`[fs${i}]scale=${card.w}:${card.h}:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p[f${i}]`);
    parts.push(`[b${i}][f${i}]overlay=x=${card.x}:y=${card.y},fps=${fps},setsar=1,format=yuv420p[v${i}]`);
  });

  // 장면 잇기
  const n = plan.scenes.length;
  const effect = XFADE_EFFECT[plan.transition];
  let tail = "v0";
  if (n > 1 && effect === null) {
    parts.push(`${plan.scenes.map((_, i) => `[v${i}]`).join("")}concat=n=${n}:v=1:a=0[vx]`);
    tail = "vx";
  } else if (n > 1) {
    for (let k = 1; k < n; k++) {
      const out = k === n - 1 ? "vx" : `x${k}`;
      parts.push(`[${tail}][v${k}]xfade=transition=${effect}:duration=${sec(plan.transitionFrames / fps)}:offset=${sec(plan.scenes[k]!.startFrame / fps)}[${out}]`);
      tail = out;
    }
  }

  // 끝에 마지막 프레임을 2장 덧붙여 둔다 — 전환 필터가 끝에서 한 프레임을 잃어도 출력 길이(-t)가 계획의 프레임 수를 채운다
  parts.push(`[${tail}]tpad=stop=2:stop_mode=clone[vt]`);
  tail = "vt";

  // 자막 번인
  if (input.assName !== null) {
    const fontsDir = input.fontsDir === undefined ? "" : `:fontsdir=${filterValue(input.fontsDir, "fontsDir")}`;
    parts.push(`[${tail}]subtitles=filename=${filterValue(input.assName, "ASS 파일 이름")}${fontsDir},format=yuv420p[vout]`);
  } else {
    parts.push(`[${tail}]format=yuv420p[vout]`);
  }
  return parts.join(";");
}

/** 오디오 입력·필터. 음성·음악 슬롯이 없으면 무음 트랙(프리셋이 켰을 때) 또는 오디오 없음 */
function audioPlan(input: BuildFfmpegInput, firstIndex: number): { inputs: string[]; filter: string | null; map: string | null } {
  const { preset, plan } = input;
  const tracks = input.tracks ?? [];
  const total = sec(plan.totalFrames / plan.fps);
  const sr = preset.audio.sampleRate;

  if (tracks.length === 0) {
    if (!preset.audio.silentTrack) return { inputs: [], filter: null, map: null };
    return { inputs: ["-f", "lavfi", "-t", total, "-i", `anullsrc=r=${sr}:cl=stereo`], filter: null, map: `${firstIndex}:a` };
  }

  const inputs = tracks.flatMap((t) => (t.role === "music" ? ["-stream_loop", "-1", "-i", t.path] : ["-i", t.path]));
  const chains = tracks.map((t, k) => {
    const gain = t.gainDb ?? (t.role === "music" ? -18 : 0);
    return `[${firstIndex + k}:a]aresample=${sr},aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${gain}dB[at${k}]`;
  });
  const mix = tracks.length === 1 ? "[at0]anull" : `${tracks.map((_, k) => `[at${k}]`).join("")}amix=inputs=${tracks.length}:duration=longest:normalize=0`;
  const fadeStart = sec(Math.max(0, plan.totalFrames / plan.fps - 1));
  const tail = `${mix},apad,atrim=end=${total},afade=t=out:st=${fadeStart}:d=1[aout]`;
  return { inputs, filter: [...chains, tail].join(";"), map: "[aout]" };
}

export function buildFfmpegArgs(input: BuildFfmpegInput): string[] {
  const { plan, preset } = input;
  const { fps } = preset.canvas;
  const encoder = input.encoder ?? DEFAULT_ENCODER;
  if (input.cardPaths.length !== plan.scenes.length) throw new Error(`카드 ${input.cardPaths.length}장, 장면 ${plan.scenes.length}개 — 수가 다르다`);
  if (plan.scenes.length === 0) throw new Error("장면이 없다");

  const args = ["-hide_banner", "-nostdin", "-loglevel", "warning", "-y", "-filter_threads", String(encoder.threads), "-filter_complex_threads", "1"];
  // 정지 이미지를 프레임 수에 딱 맞게 읽는다: 반 프레임을 덜어 마지막에 한 프레임이 더 붙지 않게 한다
  // 입력마다 디코더 스레드를 1개로 — PNG 디코더는 기본으로 코어 수만큼 스레드를 만든다(장면 8개 × 24 = 192개)
  plan.scenes.forEach((s, i) => args.push("-threads", "1", "-loop", "1", "-framerate", String(fps), "-t", sec((s.frames - 0.5) / fps), "-i", input.cardPaths[i]!));

  const audio = audioPlan(input, plan.scenes.length);
  args.push(...audio.inputs);
  args.push("-filter_complex", [buildFilterGraph(input), ...(audio.filter ? [audio.filter] : [])].join(";"));
  args.push("-map", "[vout]");
  if (audio.map) args.push("-map", audio.map);

  args.push(
    "-c:v", "libx264", "-preset", encoder.preset, "-crf", String(encoder.crf), "-threads", String(encoder.threads), "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-r", String(fps), "-g", String(fps * 2),
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
  );
  if (audio.map) args.push("-c:a", "aac", "-b:a", `${preset.audio.bitrateKbps}k`, "-ar", String(preset.audio.sampleRate), "-ac", "2");
  // 반 프레임을 덜어 정확히 totalFrames 장에서 끊는다(-t 는 pts < 값 인 프레임까지 포함하므로 정수 경계에 걸리면 한 장이 더 붙는다)
  args.push("-t", sec((plan.totalFrames - 0.5) / fps), "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact", "-movflags", "+faststart", input.outPath);
  return args;
}
