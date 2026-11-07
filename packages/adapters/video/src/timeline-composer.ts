// [W5 릴스] 타임라인 합성기 — ReelsProjectV2(docs/12 §1) → 1080x1920 MP4 + SRT.
// 기존 ReelComposer(카드 세트 → 릴스)는 그대로 두고, /reels 편집기 렌더는 이 파일을 쓴다.
// 필터 그래프 만들기는 순수 함수(buildTimelineGraph)라 ffmpeg 없이 단위 테스트가 된다. 프로세스는 composeTimeline 만 띄운다.
//
// 구조: 검은 바탕(color) 위에 그림 트랙(video·overlay)을 아래→위로 overlay 한다. 트랙 하나는 「클립마다 캔버스 크기 투명 스트림」을
// 시간 순으로 concat(틈은 투명 color) / xfade(전환) 로 이어 붙인 한 줄이다. 글자(text·subtitle·title/badge/cta)는 ASS 로 맨 위에 새긴다.
// 소리는 클립마다 atrim·atempo·volume·afade·adelay 후 무음 바탕과 amix 한다.
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  buildSrt,
  clipLength,
  DEFAULT_COLOR,
  DEFAULT_REEL_PRESET,
  DEFAULT_TRANSFORM,
  projectDurationV2,
  type Clip,
  type Keyframe,
  type KeyProp,
  type ReelPreset,
  type ReelsProjectV2,
  type SourceKind,
  type SpeechSegment,
  type Track,
} from "@yunseo/domain";
import { runProcess, probeMedia, type FfmpegBinaries } from "./ffmpeg-runner";
import type { ProbeSummary } from "./ffprobe";

export interface TimelineMedia {
  path: string;
  kind: SourceKind;
  /** 영상 파일에 소리 스트림이 있나(없으면 영상 클립 소리를 섞지 않는다) */
  hasAudio?: boolean;
}

export interface TimelineEncoder {
  crf: number;
  preset: string;
  /**
   * 인코더·필터 스레드 상한. Windows 실행기 작업 cgroup(pids.max=256)에서 필터 그래프가 커지면
   * pthread_create EAGAIN 으로 죽는다 — -threads·-filter_threads·-filter_complex_threads 를 모두 2 로 묶는다.
   */
  threads: number;
}
export const TIMELINE_ENCODER: TimelineEncoder = { crf: 20, preset: "medium", threads: 2 };

export interface TimelineGraphInput {
  project: ReelsProjectV2;
  media: (sourceId: string) => TimelineMedia | undefined;
  /** 스티커·워터마크 그림 경로 */
  asset?: (assetId: string) => string | undefined;
  /** LUT(.cube) 경로 — §7 기본안: assets/luts/<id>.cube */
  lut?: (lutId: string) => string | undefined;
  /** 번인할 ASS 파일 이름(ffmpeg 작업 폴더 기준). null 이면 글자를 새기지 않는다 */
  assName: string | null;
  fontsDir?: string | undefined;
  outPath: string;
  preset?: ReelPreset;
  encoder?: TimelineEncoder;
}

export interface TimelineGraph {
  args: string[];
  filter: string;
  ass: string | null;
  srt: string;
  durationMs: number;
  warnings: string[];
}

const W = 1080;
const H = 1920;
const FPS = 30;
const SAFE = /^[A-Za-z0-9_./-]+$/;
const n = (v: number) => {
  const s = (Math.round(v * 10000) / 10000).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
};
const sec = (ms: number) => n(ms / 1000);
const safePath = (p: string, what: string) => {
  if (!SAFE.test(p)) throw new Error(`${what} 경로에는 영문·숫자·._/- 만 쓸 수 있다: ${p}`);
  return p;
};

/** ffmpeg xfade 효과 이름 */
export function xfadeName(kind: string, direction?: string): string | null {
  if (kind === "crossfade") return "fade";
  if (kind === "dip") return "fadeblack";
  if (kind === "slide") return `slide${direction ?? "left"}`;
  return null;
}

/**
 * 키프레임 → ffmpeg 식. tVar 는 클립 안 시각(초)을 뜻하는 식(예: "t", "in/30").
 * linear 직선, ease-in-out 은 smoothstep, hold 는 다음 키까지 값 유지. 첫 키 앞·마지막 키 뒤는 그 값으로 고정.
 */
export function keyframeExpr(keys: readonly Keyframe[], tVar: string, fallback: number): string {
  const ks = [...keys].sort((a, b) => a.at - b.at);
  if (!ks.length) return n(fallback);
  let expr = n(ks.at(-1)!.value);
  for (let i = ks.length - 2; i >= 0; i -= 1) {
    const a = ks[i]!;
    const b = ks[i + 1]!;
    const t0 = a.at / 1000;
    const span = (b.at - a.at) / 1000;
    const p = `((${tVar})-${n(t0)})/${n(span)}`;
    const seg =
      a.ease === "hold" ? n(a.value) : a.ease === "ease-in-out" ? `${n(a.value)}+${n(b.value - a.value)}*(${p})*(${p})*(3-2*(${p}))` : `${n(a.value)}+${n(b.value - a.value)}*(${p})`;
    expr = `if(lt(${tVar},${n(b.at / 1000)}),${seg},${expr})`;
  }
  return `if(lt(${tVar},${n(ks[0]!.at / 1000)}),${n(ks[0]!.value)},${expr})`;
}

const keysOf = (c: Clip, prop: KeyProp) => (c.keyframes ?? []).filter((k) => k.prop === prop);

/** speed 를 atempo(0.5~2) 사슬로 */
export function atempoChain(speed: number): string[] {
  const out: string[] = [];
  let s = speed;
  while (s > 2) {
    out.push("atempo=2");
    s /= 2;
  }
  while (s < 0.5) {
    out.push("atempo=0.5");
    s /= 0.5;
  }
  if (Math.abs(s - 1) > 1e-6) out.push(`atempo=${n(s)}`);
  return out;
}

/** 색 보정 필터(eq·colortemperature). 값 대응: brightness×0.3, contrast 1+c, saturation 1+s(−1 = 흑백), 색온도 6500K−t×3000K [미검증 — 눈 확인 후 조정] */
export function colorFilters(c: Clip): string[] {
  const col = { ...DEFAULT_COLOR, ...c.color };
  const out: string[] = [];
  if (col.brightness || col.contrast || col.saturation) out.push(`eq=brightness=${n(col.brightness * 0.3)}:contrast=${n(1 + col.contrast)}:saturation=${n(1 + col.saturation)}`);
  if (col.temperature) out.push(`colortemperature=temperature=${Math.round(6500 - col.temperature * 3000)}`);
  return out;
}

// ── ASS ──────────────────────────────────────────────────
const assClock = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 10) * 10);
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  const s = Math.floor((t % 60_000) / 1000);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(Math.floor((t % 1000) / 10)).padStart(2, "0")}`;
};
const assText = (s: string) => s.replace(/\\/g, "/").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\r?\n/g, "\\N");

/** §7 기본안 스타일 3종 + text-default. 색은 &HAABBGGRR */
export function assStyles(preset: ReelPreset): string[] {
  const f = preset.subtitle.fontName;
  const mv = preset.safeArea.bottom + 40;
  const ml = preset.safeArea.left;
  return [
    `Style: subtitle-default,${f},${preset.subtitle.fontSize},&H00FFFFFF,&H00FFFFFF,&H4D000000,&H4D000000,0,0,0,0,100,100,0,0,3,${preset.subtitle.padPx},0,2,${ml},${ml},${mv},1`,
    `Style: text-default,${f},64,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,4,0,5,${ml},${ml},0,1`,
    `Style: viral-white,${f},76,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,7,0,2,${ml},${ml},${mv},1`,
    `Style: viral-yellow,${f},76,&H0000E5FF,&H0000E5FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,7,0,2,${ml},${ml},${mv},1`,
  ];
}
const STYLE_NAMES = new Set(["subtitle-default", "text-default", "viral-white", "viral-yellow"]);

export function buildTimelineAss(p: ReelsProjectV2, preset: ReelPreset = DEFAULT_REEL_PRESET): string | null {
  const hidden = new Set(p.tracks.filter((t) => t.hidden).map((t) => t.id));
  const order = new Map(p.tracks.map((t, i) => [t.id, i]));
  const events: string[] = [];
  const clips = p.clips.filter((c) => !hidden.has(c.trackId)).sort((a, b) => order.get(a.trackId)! - order.get(b.trackId)! || a.start - b.start);
  for (const c of clips) {
    let text: string | null = null;
    let style = "text-default";
    let pos: string = "";
    if (c.text) {
      text = c.text.value;
      style = STYLE_NAMES.has(c.text.style) ? c.text.style : "text-default";
      if (c.text.box) pos = `{\\an5\\pos(${Math.round(c.text.box.cx * W)},${Math.round(c.text.box.cy * H)})}`;
      else if (style === "text-default") pos = `{\\an5\\pos(${W / 2},${Math.round(H * 0.3)})}`;
    } else if (c.component && (c.component.type === "title" || c.component.type === "badge" || c.component.type === "cta")) {
      text = c.component.text;
      style = c.component.type === "cta" ? "viral-yellow" : "viral-white";
      const t = { ...DEFAULT_TRANSFORM, ...c.transform };
      pos = `{\\an5\\pos(${Math.round(t.cx * W)},${Math.round(t.cy * H)})}`;
    }
    if (text === null || !text.trim()) continue;
    const layer = order.get(c.trackId)!;
    events.push(`Dialogue: ${layer},${assClock(c.start)},${assClock(c.start + clipLength(c))},${style},,0,0,0,,${pos}${assText(text)}`);
  }
  if (!events.length) return null;
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    ...assStyles(preset),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    "",
  ].join("\n");
}

export function buildTimelineSrt(p: ReelsProjectV2): string {
  const subs = new Set(p.tracks.filter((t) => t.kind === "subtitle" && !t.hidden).map((t) => t.id));
  const cues = p.clips
    .filter((c) => subs.has(c.trackId) && c.text?.value.trim())
    .sort((a, b) => a.start - b.start)
    .map((c) => ({ startMs: c.start, endMs: c.start + clipLength(c), text: c.text!.value }));
  return buildSrt(cues);
}

// ── 필터 그래프 ───────────────────────────────────────────
export function buildTimelineGraph(input: TimelineGraphInput): TimelineGraph {
  const { project: p } = input;
  const preset = input.preset ?? DEFAULT_REEL_PRESET;
  const enc = input.encoder ?? TIMELINE_ENCODER;
  const warnings: string[] = [];
  const durationMs = Math.max(100, projectDurationV2(p));
  const T = sec(durationMs);
  const args: string[] = ["-hide_banner", "-y", "-threads", String(enc.threads), "-filter_threads", String(enc.threads), "-filter_complex_threads", String(enc.threads)];
  let inputs = 0;
  const addInput = (path: string, image: boolean, lenMs: number): number => {
    if (image) args.push("-loop", "1", "-framerate", String(FPS), "-t", sec(lenMs + 1000));
    args.push("-i", path);
    return inputs++;
  };
  const g: string[] = [];
  let label = 0;
  const L = (prefix: string) => `${prefix}${label++}`;
  const transparent = (ms: number) => {
    const o = L("gap");
    g.push(`color=c=black@0:s=${W}x${H}:r=${FPS}:d=${sec(ms)},format=yuva420p,settb=1/${FPS}[${o}]`);
    return o;
  };

  /** 클립 하나 → 캔버스 크기 투명 스트림(길이 = 타임라인 길이). 그림이 없으면 null */
  const visualClip = (c: Clip, track: Track): string | null => {
    const len = clipLength(c);
    let path: string | undefined;
    let image: boolean;
    let fit: "cover" | "contain" | "watermark" = track.kind === "video" ? "cover" : "contain";
    if (c.sourceId && (c.sourceKind === "video" || c.sourceKind === "image")) {
      const m = input.media(c.sourceId);
      if (!m) throw new Error(`원본을 찾을 수 없다: ${c.sourceId}`);
      path = m.path;
      image = c.sourceKind === "image";
    } else if (c.component?.type === "card") {
      path = input.media(c.component.sourceId)?.path;
      image = true;
    } else if (c.component?.type === "sticker" || c.component?.type === "watermark") {
      path = input.asset?.(c.component.assetId);
      image = true;
      if (c.component.type === "watermark") fit = "watermark";
    } else return null;
    if (!path) {
      warnings.push(`render/asset: ${c.id} 그림을 찾지 못해 뺐다`);
      return null;
    }
    const i = addInput(path, image, len);
    const chain: string[] = [];
    if (image) chain.push(`fps=${FPS}`, `trim=duration=${sec(len)}`, "setpts=PTS-STARTPTS");
    else chain.push(`trim=start=${sec(c.in)}:end=${sec(c.out)}`, `setpts=(PTS-STARTPTS)/${n(c.speed)}`, `fps=${FPS}`, `trim=duration=${sec(len)}`);
    chain.push("setsar=1", ...colorFilters(c));
    const t = { ...DEFAULT_TRANSFORM, ...c.transform };
    const kScale = keysOf(c, "scale");
    const kcx = keysOf(c, "cx");
    const kcy = keysOf(c, "cy");
    if (keysOf(c, "opacity").length || keysOf(c, "rotation").length) warnings.push(`render/keyframes: ${c.id} 불투명도·회전 키프레임은 P0 렌더에서 첫 값 대신 transform 값을 쓴다`);
    const out = L("v");
    const lut = c.color?.lut ? input.lut?.(c.color.lut.id) : undefined;
    if (c.color?.lut && !lut) warnings.push(`render/lut: ${c.id} LUT ${c.color.lut.id} 파일이 없어 뺐다`);
    const pre = L("src");
    g.push(`[${i}:v]${chain.join(",")}[${pre}]`);
    let cur = pre;
    if (lut) {
      const a = L("la");
      const b = L("lb");
      const l = L("lc");
      const o = L("lm");
      g.push(`[${cur}]split[${a}][${b}]`, `[${b}]lut3d=file=${safePath(lut, "LUT")}[${l}]`, `[${l}][${a}]blend=all_mode=normal:all_opacity=${n(c.color!.lut!.strength)}[${o}]`);
      cur = o;
    }
    const tail: string[] = [];
    if (t.rotation) tail.push("format=yuva420p", `rotate=${n((t.rotation * Math.PI) / 180)}:c=none:ow=rotw(${n((t.rotation * Math.PI) / 180)}):oh=roth(${n((t.rotation * Math.PI) / 180)})`);
    if (t.opacity < 1) tail.push("format=rgba", `colorchannelmixer=aa=${n(t.opacity)}`);
    const canvas = L("cv");
    g.push(`color=c=black@0:s=${W}x${H}:r=${FPS}:d=${sec(len)},format=yuva420p[${canvas}]`);
    const fg = L("fg");
    if (kScale.length && fit === "cover") {
      // 줌 키프레임 — 캔버스를 꽉 채운 뒤 zoompan(배율 1 미만은 1 로 묶음)
      if (kScale.some((k) => k.value < 1)) warnings.push(`render/zoom: ${c.id} 배율 키프레임 1 미만은 1 로 그린다`);
      const tv = `in/${FPS}`;
      const z = `max(1,${keyframeExpr(kScale, tv, t.scale)})`;
      const cx = keyframeExpr(kcx, tv, t.cx);
      const cy = keyframeExpr(kcy, tv, t.cy);
      g.push(
        `[${cur}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},zoompan=z='${z}':x='max(0,min(iw-iw/zoom,(${cx})*iw-iw/zoom/2))':y='max(0,min(ih-ih/zoom,(${cy})*ih-ih/zoom/2))':d=1:s=${W}x${H}:fps=${FPS}${tail.length ? "," + tail.join(",") : ""},format=yuva420p[${fg}]`,
      );
      g.push(`[${canvas}][${fg}]overlay=0:0:format=auto,format=yuva420p,settb=1/${FPS}[${out}]`);
      return out;
    }
    if (kScale.length) warnings.push(`render/zoom: ${c.id} 오버레이 배율 키프레임은 P0 렌더에서 transform.scale 을 쓴다`);
    let box: string;
    if (fit === "watermark") box = `scale=${Math.round(220 * t.scale)}:-2`;
    else box = `scale=${Math.round(W * t.scale)}:${Math.round(H * t.scale)}:force_original_aspect_ratio=${fit === "cover" ? "increase" : "decrease"}`;
    g.push(`[${cur}]${[box, ...tail].join(",")},format=yuva420p[${fg}]`);
    let x: string;
    let y: string;
    if (c.component?.type === "watermark") {
      const m = c.component.marginPx ?? 48;
      x = c.component.corner.endsWith("l") ? String(m) : `W-w-${m}`;
      y = c.component.corner.startsWith("t") ? String(m) : `H-h-${m}`;
    } else {
      x = `(${keyframeExpr(kcx, "t", t.cx)})*W-w/2`;
      y = `(${keyframeExpr(kcy, "t", t.cy)})*H-h/2`;
    }
    const dyn = kcx.length || kcy.length ? ":eval=frame" : "";
    g.push(`[${canvas}][${fg}]overlay=x='${x}':y='${y}'${dyn}:format=auto,format=yuva420p,settb=1/${FPS}[${out}]`);
    return out;
  };

  g.push(`color=c=black:s=${W}x${H}:r=${FPS}:d=${T},format=yuv420p,settb=1/${FPS}[base]`);
  let main = "base";
  for (const track of p.tracks) {
    if (track.hidden || (track.kind !== "video" && track.kind !== "overlay")) continue;
    const clips = p.clips.filter((c) => c.trackId === track.id).sort((a, b) => a.start - b.start);
    let chain: string | null = null;
    let cursor = 0;
    for (const c of clips) {
      const v = visualClip(c, track);
      if (!v) continue;
      const len = clipLength(c);
      const gap = c.start - cursor;
      const fx = c.transition ? xfadeName(c.transition.kind, c.transition.direction) : null;
      if (chain === null) {
        chain = c.start > 0 ? concat(transparent(c.start), v) : v;
      } else if (gap < 0 && fx) {
        const o = L("xf");
        g.push(`[${chain}][${v}]xfade=transition=${fx}:duration=${sec(-gap)}:offset=${sec(cursor + gap)}[${o}]`);
        chain = o;
      } else {
        chain = gap > 0 ? concat(concat(chain, transparent(gap)), v) : concat(chain, v);
      }
      cursor = c.start + len;
    }
    if (!chain) continue;
    const o = L("m");
    g.push(`[${main}][${chain}]overlay=0:0:eof_action=pass:format=auto[${o}]`);
    main = o;
  }
  function concat(a: string, b: string): string {
    const o = L("cc");
    g.push(`[${a}][${b}]concat=n=2:v=1:a=0[${o}]`);
    return o;
  }

  const ass = input.assName ? buildTimelineAss(p, preset) : null;
  const vtail = [`trim=duration=${T}`];
  if (ass && input.assName) vtail.push(`subtitles=${safePath(input.assName, "ASS")}${input.fontsDir ? `:fontsdir=${safePath(input.fontsDir, "서체 폴더")}` : ""}`);
  vtail.push("format=yuv420p");
  g.push(`[${main}]${vtail.join(",")}[vout]`);

  // 소리
  const muted = new Set(p.tracks.filter((t) => t.muted).map((t) => t.id));
  const trackDb = new Map(p.tracks.map((t) => [t.id, t.volumeDb ?? 0]));
  const kindOf = new Map(p.tracks.map((t) => [t.id, t.kind]));
  const audioLabels: string[] = [];
  const videoInput = new Map<string, number>();
  // 영상 트랙 클립의 입력 번호(같은 입력의 소리 스트림을 쓴다) — visualClip 이 만든 순서를 다시 계산하지 않으려고 args 를 훑는다
  {
    let idx = 0;
    for (let k = 0; k < args.length; k += 1) if (args[k] === "-i") videoInput.set(args[k + 1]!, idx++);
  }
  for (const c of [...p.clips].sort((a, b) => a.start - b.start)) {
    const kind = kindOf.get(c.trackId);
    if (muted.has(c.trackId) || !c.sourceId || (kind !== "audio" && kind !== "video")) continue;
    if (c.sourceKind !== "audio" && c.sourceKind !== "video") continue;
    const m = input.media(c.sourceId);
    if (!m || (c.sourceKind === "video" && !m.hasAudio)) continue;
    const i = kind === "video" && videoInput.has(m.path) ? videoInput.get(m.path)! : addInput(m.path, false, 0);
    const len = clipLength(c);
    const a = { volumeDb: 0, fadeInMs: 0, fadeOutMs: 0, fadeCurve: "linear" as const, ...c.audio };
    const curve = a.fadeCurve === "ease" ? "qsin" : "tri";
    const kv = keysOf(c, "volumeDb");
    const chain = [`atrim=start=${sec(c.in)}:end=${sec(c.out)}`, "asetpts=PTS-STARTPTS", ...atempoChain(c.speed), `aformat=sample_rates=${preset.audio.sampleRate}:channel_layouts=stereo`];
    const db = a.volumeDb + (trackDb.get(c.trackId) ?? 0);
    if (kv.length) chain.push(`volume='pow(10,((${keyframeExpr(kv, "t", a.volumeDb)})+${n(trackDb.get(c.trackId) ?? 0)})/20)':eval=frame`);
    else if (db) chain.push(`volume=${n(db)}dB`);
    if (a.fadeInMs) chain.push(`afade=t=in:st=0:d=${sec(a.fadeInMs)}:curve=${curve}`);
    if (a.fadeOutMs) chain.push(`afade=t=out:st=${sec(len - a.fadeOutMs)}:d=${sec(a.fadeOutMs)}:curve=${curve}`);
    if (c.start) chain.push(`adelay=${c.start}:all=1`);
    const o = L("a");
    g.push(`[${i}:a]${chain.join(",")}[${o}]`);
    audioLabels.push(o);
  }
  g.push(`anullsrc=r=${preset.audio.sampleRate}:cl=stereo,atrim=duration=${T}[asil]`);
  if (audioLabels.length) g.push(`[asil]${audioLabels.map((l) => `[${l}]`).join("")}amix=inputs=${audioLabels.length + 1}:duration=first:normalize=0[aout]`);
  else g.push("[asil]anull[aout]");

  const filter = g.join(";");
  args.push(
    "-filter_complex", filter,
    "-map", "[vout]", "-map", "[aout]",
    "-t", T,
    "-r", String(FPS),
    "-c:v", "libx264", "-preset", enc.preset, "-crf", String(enc.crf), "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", `${preset.audio.bitrateKbps}k`, "-ar", String(preset.audio.sampleRate),
    "-movflags", "+faststart",
    input.outPath,
  );
  return { args, filter, ass, srt: buildTimelineSrt(p), durationMs, warnings };
}

// ── 실행 ─────────────────────────────────────────────────
export interface ComposeTimelineOptions extends Omit<TimelineGraphInput, "assName" | "outPath"> {
  outDir: string;
  /** 파일 이름 앞부분(기본 reel) */
  name?: string;
  bins: FfmpegBinaries;
  timeoutMs?: number;
}

export interface ComposeTimelineResult {
  videoPath: string;
  srtPath: string;
  probe: ProbeSummary;
  durationMs: number;
  warnings: string[];
}

export async function composeTimeline(o: ComposeTimelineOptions): Promise<ComposeTimelineResult> {
  const outDir = resolve(o.outDir);
  await mkdir(outDir, { recursive: true });
  const name = o.name ?? "reel";
  const videoPath = join(outDir, `${name}.mp4`);
  const srtPath = join(outDir, `${name}.srt`);
  const assName = `${name}.ass`;
  const graph = buildTimelineGraph({ ...o, assName, outPath: videoPath, ...(o.fontsDir ? { fontsDir: resolve(o.fontsDir) } : {}) });
  if (graph.ass) await writeFile(join(outDir, assName), graph.ass, "utf8");
  await writeFile(srtPath, graph.srt, "utf8");
  const r = await runProcess(o.bins.ffmpegPath, graph.args, { cwd: outDir, timeoutMs: o.timeoutMs ?? 600_000 });
  if (r.spawnError !== null || r.code !== 0) throw new Error(`ffmpeg 타임라인 합성 실패(code ${r.code}): ${r.spawnError ?? r.stderr.trim().split("\n").slice(-15).join("\n")}`);
  return { videoPath, srtPath, probe: await probeMedia(o.bins, videoPath), durationMs: graph.durationMs, warnings: graph.warnings };
}

// ── 무음 경계(auto_place_subtitles) ─────────────────────────
/** silencedetect 출력 → 말소리 구간(ms). 무음의 여집합 */
export function speechFromSilencedetect(stderr: string, durationMs: number, minMs = 100): SpeechSegment[] {
  const silences: { from: number; to: number }[] = [];
  let open: number | null = null;
  for (const line of stderr.split("\n")) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (s) open = Math.max(0, Math.round(Number(s[1]) * 1000));
    const e = /silence_end:\s*([\d.]+)/.exec(line);
    if (e) {
      silences.push({ from: open ?? 0, to: Math.round(Number(e[1]) * 1000) });
      open = null;
    }
  }
  if (open !== null) silences.push({ from: open, to: durationMs });
  const out: SpeechSegment[] = [];
  let t = 0;
  for (const s of silences) {
    if (s.from - t >= minMs) out.push({ from: t, to: s.from });
    t = Math.max(t, s.to);
  }
  if (durationMs - t >= minMs) out.push({ from: t, to: durationMs });
  return out;
}

export async function detectSpeech(bins: FfmpegBinaries, file: string, opt: { noiseDb: number; minMs: number }, durationMs: number): Promise<SpeechSegment[]> {
  const r = await runProcess(bins.ffmpegPath, ["-hide_banner", "-nostats", "-threads", "2", "-i", file, "-af", `silencedetect=noise=${opt.noiseDb}dB:d=${n(opt.minMs / 1000)}`, "-f", "null", "-"], { timeoutMs: 120_000 });
  if (r.spawnError !== null || r.code !== 0) throw new Error(`silencedetect 실패(${file}): ${r.spawnError ?? r.stderr.trim().split("\n").slice(-5).join("\n")}`);
  return speechFromSilencedetect(r.stderr, durationMs, opt.minMs);
}
