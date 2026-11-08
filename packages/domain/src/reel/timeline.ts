// 릴스 타임라인 v2 모델 — docs/12-reels-ops-schema.md §1 이 정본. 순수 타입·상수·검사·v1 변환만 둔다(화면·저장 없음).
// 시간은 정수 ms, 공간은 캔버스 비율(0~1) + 중심점. 픽셀은 렌더 어댑터만 안다.
import { AppError } from "../errors";
import { REEL_TRANSITIONS, REEL_TRANSITION_SEC, type ReelTransitionName } from "./preset";

export type Ms = number;
export type Unit = number;

export const REELS_V2_TRACK_KINDS = ["video", "text", "subtitle", "audio", "overlay"] as const;
export type TrackKind = (typeof REELS_V2_TRACK_KINDS)[number];
export const REELS_MIN_CLIP_MS = 100;
export const REELS_MAX_MS = 180_000;
export const REELS_MAX_CLIPS = 2000;
export const REELS_MAX_TRACKS = 40;
export const REELS_DEFAULT_MS = { video: 5000, image: 3000, audio: 5000, text: 3000 } as const;
export const REELS_SPEED = { min: 0.25, max: 4 } as const;
export const REELS_VOLUME_DB = { min: -60, max: 12 } as const;
/** §7 기본안 — 자막·텍스트 스타일 프리셋 이름 */
export const REELS_TEXT_STYLES = ["subtitle-default", "text-default", "viral-white", "viral-yellow"] as const;
export const REELS_DEFAULT_SUBTITLE_MAX_LINES = 2;

export const CANVAS = { width: 1080, height: 1920, fps: 30 } as const;
export type Canvas = typeof CANVAS;

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted?: boolean;
  hidden?: boolean;
  locked?: boolean;
  volumeDb?: number;
}

export interface Transform { cx: Unit; cy: Unit; scale: number; rotation: number; opacity: number }
export const DEFAULT_TRANSFORM: Transform = { cx: 0.5, cy: 0.5, scale: 1, rotation: 0, opacity: 1 };

export const KEY_PROPS = ["cx", "cy", "scale", "rotation", "opacity", "volumeDb"] as const;
export type KeyProp = (typeof KEY_PROPS)[number];
export const KEY_EASES = ["linear", "ease-in-out", "hold"] as const;
export type KeyEase = (typeof KEY_EASES)[number];
export interface Keyframe { id: string; prop: KeyProp; at: Ms; value: number; ease: KeyEase }

export interface Lut { id: string; strength: number }
export interface Color { brightness: number; contrast: number; saturation: number; temperature: number; lut?: Lut | null }
export const DEFAULT_COLOR: Color = { brightness: 0, contrast: 0, saturation: 0, temperature: 0, lut: null };

export type FadeCurve = "linear" | "ease";
export interface ClipAudio { volumeDb: number; fadeInMs: Ms; fadeOutMs: Ms; fadeCurve: FadeCurve }
export const DEFAULT_CLIP_AUDIO: ClipAudio = { volumeDb: 0, fadeInMs: 0, fadeOutMs: 0, fadeCurve: "linear" };

export const TRANSITION_DIRECTIONS = ["left", "right", "up", "down"] as const;
export interface Transition { kind: ReelTransitionName; durationMs: Ms; direction?: (typeof TRANSITION_DIRECTIONS)[number] }
export const defaultTransitionMs = (kind: ReelTransitionName): Ms => Math.round(REEL_TRANSITION_SEC[kind] * 1000);

export interface TextRun { from: number; to: number; color?: string; bold?: boolean }
export interface TextBox { cx: Unit; cy: Unit; w: Unit }
export interface TextBody { value: string; style: string; runs?: TextRun[]; box?: TextBox }

export type Component =
  | { type: "sticker"; assetId: string }
  | { type: "watermark"; assetId: string; corner: "tl" | "tr" | "bl" | "br"; marginPx?: number }
  | { type: "card"; sourceId: string }
  | { type: "title" | "badge" | "cta"; text: string };

export type SourceKind = "video" | "image" | "audio";

export interface Clip {
  id: string;
  trackId: string;
  start: Ms;
  in: Ms;
  out: Ms;
  speed: number;
  sourceId?: string;
  sourceKind?: SourceKind;
  sourceMs?: Ms;
  text?: TextBody;
  component?: Component;
  transform?: Transform;
  keyframes?: Keyframe[];
  color?: Color;
  audio?: ClipAudio;
  transition?: Transition;
}

export interface ReelsProjectV2 {
  version: 2;
  title: string;
  canvas: Canvas;
  tracks: Track[];
  clips: Clip[];
}

/** 편집에 쓰는 원본 — 서버가 목록을 준다(op 적용기가 종류·길이를 안다) */
export interface SourceInfo { kind: SourceKind; durationMs?: Ms }

// ── 시간 계산 ──────────────────────────────────────────────
export const clipLength = (c: Pick<Clip, "in" | "out" | "speed">): Ms => Math.round((c.out - c.in) / c.speed);
export const clipEnd = (c: Pick<Clip, "start" | "in" | "out" | "speed">): Ms => c.start + clipLength(c);
export const projectDurationV2 = (p: ReelsProjectV2): Ms => p.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
export const clipsOnTrack = (p: ReelsProjectV2, trackId: string, ignore?: string): Clip[] =>
  p.clips.filter((c) => c.trackId === trackId && c.id !== ignore).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
export const trackEndV2 = (p: ReelsProjectV2, trackId: string): Ms => clipsOnTrack(p, trackId).reduce((m, c) => Math.max(m, clipEnd(c)), 0);
/** 원본 시각(ms) — 타임라인 t 에서 이 클립이 보여 주는 원본 위치 */
export const sourceAt = (c: Clip, t: Ms): Ms => c.in + Math.round((t - c.start) * c.speed);

/** 이 트랙 종류에 이 클립이 놓일 수 있나(I2). 음성 트랙은 영상의 소리도 받는다(v1 규칙 유지) */
export function trackAccepts(kind: TrackKind, c: Pick<Clip, "sourceKind" | "text" | "component">): boolean {
  if (kind === "video") return c.sourceKind === "video" || c.sourceKind === "image";
  if (kind === "audio") return c.sourceKind === "audio" || c.sourceKind === "video";
  if (kind === "text" || kind === "subtitle") return c.text !== undefined && c.sourceKind === undefined;
  return c.component !== undefined || c.sourceKind === "image";
}

export const emptyProjectV2 = (title = "새 릴스"): ReelsProjectV2 => ({
  version: 2,
  title,
  canvas: { ...CANVAS },
  tracks: [
    { id: "t-video", kind: "video", name: "영상 1" },
    { id: "t-text", kind: "text", name: "텍스트 1" },
    { id: "t-audio", kind: "audio", name: "음성 1" },
    { id: "t-subtitle", kind: "subtitle", name: "자막 1" },
  ],
  clips: [],
});

// ── 오류 ──────────────────────────────────────────────────
export const REELS_OP_ERROR_STATUS = {
  BAD_REQUEST: 400,
  UNKNOWN_OP: 400,
  INVALID_ARGUMENT: 400,
  PROJECT_NOT_FOUND: 404,
  CLIP_NOT_FOUND: 404,
  TRACK_NOT_FOUND: 404,
  KEYFRAME_NOT_FOUND: 404,
  SOURCE_NOT_FOUND: 404,
  REVISION_CONFLICT: 409,
  ID_EXISTS: 409,
  NOTHING_TO_UNDO: 409,
  NOTHING_TO_REDO: 409,
  LOSSY_OVERWRITE: 409,
  TRACK_KIND_MISMATCH: 422,
  TRACK_LOCKED: 422,
  CLIP_OVERLAP: 422,
  OUT_OF_RANGE: 422,
  SPLIT_AT_EDGE: 422,
  INVALID_PROJECT: 422,
  SRT_PARSE_ERROR: 422,
  BATCH_FAILED: 422,
  TOO_LARGE: 413,
} as const;
export type ReelsOpErrorCode = keyof typeof REELS_OP_ERROR_STATUS;

export interface ReelsOpErrorBody { code: ReelsOpErrorCode; message: string; path?: string; details?: Record<string, unknown> }

export class ReelsOpError extends AppError<ReelsOpErrorCode> {
  override name = "ReelsOpError";
  constructor(code: ReelsOpErrorCode, message: string, path?: string, details?: Record<string, unknown>) {
    super(code, message, { status: REELS_OP_ERROR_STATUS[code], path, details });
  }
  override toBody(): ReelsOpErrorBody {
    return super.toBody() as ReelsOpErrorBody;
  }
}

// ── 불변식 I1~I8 ───────────────────────────────────────────
const isInt = (v: number) => Number.isInteger(v) && v >= 0;

/**
 * 저장 전 검사. 위반이면 ReelsOpError 를 던지고(가장 구체적인 코드), 통과하면 경고(I8) 목록을 돌려준다.
 * maxLines: 자막 줄 수 상한(I8). 프리셋 값을 넘겨 준다(기본 2).
 */
export function checkProject(p: ReelsProjectV2, opts: { subtitleMaxLines?: number | undefined } = {}): string[] {
  const bad = (msg: string, details?: Record<string, unknown>): never => {
    throw new ReelsOpError("INVALID_PROJECT", msg, undefined, details);
  };
  if (p.version !== 2) bad("version 은 2");
  if (typeof p.title !== "string" || !p.title.trim() || p.title.length > 80) bad("title 은 1~80자");
  if (p.tracks.length > REELS_MAX_TRACKS) bad(`트랙은 ${REELS_MAX_TRACKS}개 이하`);
  if (p.clips.length > REELS_MAX_CLIPS) bad(`클립은 ${REELS_MAX_CLIPS}개 이하`);
  const tracks = new Map<string, Track>();
  for (const t of p.tracks) {
    if (!t.id || t.id.length > 64 || tracks.has(t.id)) bad(`트랙 id 가 비었거나 겹친다: ${t.id}`);
    if (!REELS_V2_TRACK_KINDS.includes(t.kind)) bad(`트랙 종류: ${t.kind}`);
    tracks.set(t.id, t);
  }
  const ids = new Set<string>();
  const warnings: string[] = [];
  const maxLines = opts.subtitleMaxLines ?? REELS_DEFAULT_SUBTITLE_MAX_LINES;
  for (const c of p.clips) {
    if (!c.id || c.id.length > 64 || ids.has(c.id)) bad(`클립 id 가 비었거나 겹친다: ${c.id}`);
    ids.add(c.id);
    const t = tracks.get(c.trackId);
    if (!t) throw new ReelsOpError("TRACK_NOT_FOUND", `클립 ${c.id} 의 트랙이 없다: ${c.trackId}`);
    if (!trackAccepts(t.kind, c)) throw new ReelsOpError("TRACK_KIND_MISMATCH", `${t.name}(${t.kind}) 트랙에 ${c.id} 를 놓을 수 없다`, undefined, { trackId: t.id, clipId: c.id });
    const range = (msg: string): never => {
      throw new ReelsOpError("OUT_OF_RANGE", `${c.id}: ${msg}`, undefined, { clipId: c.id });
    };
    if (!isInt(c.start) || !isInt(c.in) || !isInt(c.out) || !(c.in < c.out)) range("0 ≤ in < out, 시각은 0 이상 정수"); // I3
    if (c.sourceMs !== undefined && c.sourceKind !== "image" && c.out > c.sourceMs) range(`out(${c.out}) 이 원본 길이(${c.sourceMs})를 넘는다`);
    if (!(c.speed >= REELS_SPEED.min && c.speed <= REELS_SPEED.max)) range(`speed 는 ${REELS_SPEED.min}~${REELS_SPEED.max}`);
    const len = clipLength(c);
    if (len < REELS_MIN_CLIP_MS) range(`길이 ${len}ms < ${REELS_MIN_CLIP_MS}ms`); // I4
    if (clipEnd(c) > REELS_MAX_MS) range(`끝 ${clipEnd(c)}ms 가 ${REELS_MAX_MS}ms 를 넘는다`);
    const seen = new Set<string>();
    for (const k of c.keyframes ?? []) {
      // I5
      if (k.at < 0 || k.at > len) range(`키프레임 ${k.id} at=${k.at} 이 0~${len} 밖`);
      const key = `${k.prop}@${k.at}`;
      if (seen.has(key)) range(`키프레임 ${k.prop}·${k.at} 중복`);
      seen.add(key);
    }
    if (c.audio && c.audio.fadeInMs + c.audio.fadeOutMs > len) range(`페이드 합(${c.audio.fadeInMs + c.audio.fadeOutMs})이 길이(${len})를 넘는다`); // I6
    if (t.kind === "subtitle" && c.text && c.text.value.split("\n").length > maxLines) warnings.push(`subtitle/lines: ${c.id} 줄 수 ${c.text.value.split("\n").length} > ${maxLines}`); // I8
  }
  for (const t of p.tracks) {
    const cs = clipsOnTrack(p, t.id);
    for (let i = 1; i < cs.length; i += 1) {
      const a = cs[i - 1]!;
      const b = cs[i]!;
      const overlap = clipEnd(a) - b.start;
      const tr = b.transition && b.transition.kind !== "cut" ? b.transition : null;
      if (tr) {
        // I7
        const half = Math.min(clipLength(a), clipLength(b)) / 2;
        if (tr.durationMs > half) throw new ReelsOpError("OUT_OF_RANGE", `${b.id}: 전환 ${tr.durationMs}ms 가 앞뒤 짧은 클립의 절반(${half}ms)을 넘는다`, undefined, { clipId: b.id });
      }
      if (overlap > (tr ? tr.durationMs : 0))
        throw new ReelsOpError("CLIP_OVERLAP", `${t.name}: ${a.id}·${b.id} 겹침`, undefined, { trackId: t.id, with: b.id, clipId: a.id });
    }
  }
  return warnings;
}

// ── v1 → v2 ───────────────────────────────────────────────
export interface V1Clip { id: string; trackId: string; start: number; duration: number; offset: number; sourceId?: string; sourceKind?: SourceKind; sourceMs?: number; text?: string; component?: "title" | "badge" | "cta" }
export interface V1Project { version: 1; title: string; tracks: { id: string; kind: string; name: string; muted?: boolean }[]; clips: V1Clip[] }

/** 저장된 JSON 을 v2 로 — v1 이면 §6 규칙으로 바꾸고 v2 면 그대로 */
export function toProjectV2(raw: unknown): ReelsProjectV2 {
  const v = raw as { version?: unknown };
  if (v && v.version === 2) return raw as ReelsProjectV2;
  if (!v || v.version !== 1) throw new ReelsOpError("INVALID_PROJECT", "알 수 없는 프로젝트 버전");
  return migrateV1toV2(raw as V1Project);
}

export function migrateV1toV2(p: V1Project): ReelsProjectV2 {
  const kindOf = new Map(p.tracks.map((t) => [t.id, t.kind]));
  return {
    version: 2,
    title: p.title,
    canvas: { ...CANVAS },
    tracks: p.tracks.map((t) => ({ id: t.id, kind: (t.kind === "component" ? "overlay" : t.kind) as TrackKind, name: t.name, ...(t.muted ? { muted: true } : {}) })),
    clips: p.clips.map((c) => {
      const kind = kindOf.get(c.trackId);
      const out: Clip = { id: c.id, trackId: c.trackId, start: c.start, in: c.offset, out: c.offset + c.duration, speed: 1 };
      if (c.sourceId !== undefined) out.sourceId = c.sourceId;
      if (c.sourceKind !== undefined) out.sourceKind = c.sourceKind;
      if (c.sourceMs !== undefined) out.sourceMs = c.sourceMs;
      if (c.component) out.component = { type: c.component, text: c.text ?? "" };
      else if (kind === "text" || kind === "subtitle") out.text = { value: c.text ?? "", style: kind === "subtitle" ? "subtitle-default" : "text-default" };
      return out;
    }),
  };
}

/** v2 → v1 투영(통째 저장 PUT·v1 편집기용). lossless=false 면 v1 로 담을 수 없는 v2 편집(캔버스·속도·색·키프레임 등)이 버려진 판이다 */
export function toProjectV1(p: ReelsProjectV2): { project: V1Project; lossless: boolean } {
  const project: V1Project = {
    version: 1,
    title: p.title,
    tracks: p.tracks.map((t) => ({ id: t.id, kind: t.kind === "overlay" ? "component" : t.kind, name: t.name, ...(t.muted ? { muted: true } : {}) })),
    clips: p.clips.map((c) => {
      const out: V1Clip = { id: c.id, trackId: c.trackId, start: c.start, duration: clipLength(c), offset: c.in };
      if (c.sourceId !== undefined) out.sourceId = c.sourceId;
      if (c.sourceKind !== undefined) out.sourceKind = c.sourceKind;
      if (c.sourceMs !== undefined) out.sourceMs = c.sourceMs;
      const comp = c.component;
      if (comp && (comp.type === "title" || comp.type === "badge" || comp.type === "cta")) {
        out.component = comp.type;
        out.text = comp.text;
      } else if (c.text) out.text = c.text.value;
      return out;
    }),
  };
  return { project, lossless: stableJson(migrateV1toV2(project)) === stableJson(p) };
}

function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export const isTransitionKind = (v: unknown): v is ReelTransitionName => REEL_TRANSITIONS.includes(v as ReelTransitionName);
