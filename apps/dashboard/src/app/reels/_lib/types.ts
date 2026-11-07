// [릴스 편집기] 클라이언트 타입 — docs/12-reels-ops-schema.md 가 정본(§1 타임라인 v2 · §2 요청·응답 · §3 오류 코드 · §4 op 목록).
// 엔진(packages/domain/src/reel/timeline.ts)이 main 에 들어오면 이 파일의 모델 타입을 도메인 export 로 바꾼다 — 화면은 이 파일만 import 한다.

export type Ms = number; // 정수, 0 이상
export type Unit = number; // 0~1 캔버스 비율

export const TRACK_KINDS = ["video", "text", "subtitle", "audio", "overlay"] as const;
export type TrackKind = (typeof TRACK_KINDS)[number];

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted?: boolean;
  hidden?: boolean;
  locked?: boolean;
  /** −60~+12, 기본 0 */
  volumeDb?: number;
}

export interface Transform {
  cx: Unit;
  cy: Unit;
  scale: number;
  rotation: number;
  opacity: number;
}

export const KEY_PROPS = ["cx", "cy", "scale", "rotation", "opacity", "volumeDb"] as const;
export type KeyProp = (typeof KEY_PROPS)[number];
export type KeyEase = "linear" | "ease-in-out" | "hold";
export interface Keyframe {
  id: string;
  prop: KeyProp;
  /** 클립 시작 기준 */
  at: Ms;
  value: number;
  ease: KeyEase;
}

export interface Color {
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
  lut?: { id: string; strength: number } | null;
}

export const TRANSITION_KINDS = ["cut", "crossfade", "dip", "slide"] as const;
export type TransitionKind = (typeof TRANSITION_KINDS)[number];
export type Direction = "left" | "right" | "up" | "down";
export interface Transition {
  kind: TransitionKind;
  durationMs: Ms;
  direction?: Direction;
}

export interface TextBody {
  value: string;
  style: string;
  runs?: { from: number; to: number; color?: string; bold?: boolean }[];
  box?: { cx: Unit; cy: Unit; w: Unit };
}

export type Corner = "tl" | "tr" | "bl" | "br";
export type Component =
  | { type: "sticker"; assetId: string }
  | { type: "watermark"; assetId: string; corner: Corner; marginPx?: number }
  | { type: "card"; sourceId: string }
  | { type: "title" | "badge" | "cta"; text: string };

export interface ClipAudio {
  volumeDb: number;
  fadeInMs: Ms;
  fadeOutMs: Ms;
  fadeCurve: "linear" | "ease";
}

export interface Clip {
  id: string;
  trackId: string;
  start: Ms;
  in: Ms;
  out: Ms;
  speed: number;
  sourceId?: string;
  sourceKind?: "video" | "image" | "audio";
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
  canvas: { width: 1080; height: 1920; fps: 30 };
  tracks: Track[];
  clips: Clip[];
}

/** 편집에 쓰는 자산 목록 한 줄(서버가 준다) */
export interface SourceRef {
  id: string;
  kind: "video" | "image" | "audio";
  label: string;
  src: string;
  poster?: string;
  durationMs?: number;
}

// ── 한도(문서 §1.1 · 현행 v1 상수와 같다) ──
export const MIN_CLIP_MS = 100;
export const MAX_MS = 180_000;
export const DEFAULT_IMAGE_MS = 3000;
export const DEFAULT_TEXT_MS = 3000;
export const SPEED_RANGE = [0.25, 4] as const;
export const DB_RANGE = [-60, 12] as const;

export const DEFAULT_TRANSFORM: Transform = { cx: 0.5, cy: 0.5, scale: 1, rotation: 0, opacity: 1 };
export const DEFAULT_COLOR: Color = { brightness: 0, contrast: 0, saturation: 0, temperature: 0, lut: null };
export const DEFAULT_AUDIO: ClipAudio = { volumeDb: 0, fadeInMs: 0, fadeOutMs: 0, fadeCurve: "linear" };

// ── op (문서 §4) ──
export type Op =
  | { op: "add_clip"; trackId: string; sourceId?: string; start?: Ms; in?: Ms; out?: Ms; id?: string; mode?: "place" | "insert" }
  | { op: "remove_clip"; clipId: string; ripple?: boolean }
  | { op: "trim"; clipId: string; edge: "start" | "end"; to: Ms; ripple?: boolean }
  | { op: "split"; clipId: string; at: Ms; newId?: string }
  | { op: "ripple_delete"; trackIds?: string[]; ranges: { from: Ms; to: Ms }[] }
  | { op: "move"; clipId: string; start: Ms; trackId?: string }
  | { op: "set_speed"; clipId: string; speed: number; keepEnd?: boolean }
  | { op: "set_transform"; clipId: string; transform: Partial<Transform> }
  | { op: "add_text"; trackId: string; start: Ms; durationMs: Ms; text: TextBody; id?: string }
  | { op: "update_text"; clipId: string; text: Partial<TextBody> }
  | { op: "import_srt"; trackId: string; srt: string; offsetMs?: Ms; style?: string; replace?: boolean }
  | { op: "auto_place_subtitles"; trackId: string; script: string; audioClipId: string; style?: string; maxLines?: number; silence?: { noiseDb: number; minMs: number } }
  | { op: "set_volume"; clipId?: string; trackId?: string; volumeDb: number }
  | { op: "set_fade"; clipId: string; inMs?: Ms; outMs?: Ms; curve?: "linear" | "ease" }
  | { op: "add_component"; trackId: string; start: Ms; durationMs: Ms; component: Component; transform?: Partial<Transform>; id?: string }
  | { op: "set_transition"; clipId: string; transition: Transition | null }
  | { op: "set_color"; clipId: string; color: Partial<Color> }
  | { op: "add_keyframe"; clipId: string; prop: KeyProp; at: Ms; value: number; ease?: KeyEase; id?: string }
  | { op: "remove_keyframe"; clipId: string; keyframeId: string }
  | { op: "add_track"; kind: TrackKind; name?: string; id?: string; index?: number }
  | { op: "remove_track"; trackId: string }
  | { op: "set_track"; trackId: string; muted?: boolean; hidden?: boolean; locked?: boolean; name?: string; index?: number; volumeDb?: number }
  | { op: "undo"; steps?: number }
  | { op: "redo" }
  | { op: "batch"; ops: Op[]; label?: string };

export interface OpRequest {
  revision: number;
  op: Op;
  clientId?: string;
  requestId?: string;
  dryRun?: boolean;
}

export interface OpEffects {
  created: string[];
  updated: string[];
  removed: string[];
}

export interface OpSuccess {
  revision: number;
  opId: string;
  effects: OpEffects;
  /** return:"diff" 를 주지 않으면 전체 프로젝트가 온다 */
  project?: ReelsProjectV2;
  changed?: { clips: Clip[]; tracks: Track[] };
  warnings: string[];
  undo: { available: boolean; redo: boolean };
}

export interface OpFailure {
  error: { code: string; message: string; path?: string; details?: unknown };
  revision?: number;
}

/** 문서 §3 오류 코드 */
export const OP_ERROR_CODES = [
  "BAD_REQUEST",
  "UNKNOWN_OP",
  "INVALID_ARGUMENT",
  "PROJECT_NOT_FOUND",
  "CLIP_NOT_FOUND",
  "TRACK_NOT_FOUND",
  "KEYFRAME_NOT_FOUND",
  "SOURCE_NOT_FOUND",
  "REVISION_CONFLICT",
  "ID_EXISTS",
  "NOTHING_TO_UNDO",
  "NOTHING_TO_REDO",
  "TRACK_KIND_MISMATCH",
  "TRACK_LOCKED",
  "CLIP_OVERLAP",
  "OUT_OF_RANGE",
  "SPLIT_AT_EDGE",
  "INVALID_PROJECT",
  "SRT_PARSE_ERROR",
  "BATCH_FAILED",
  "TOO_LARGE",
] as const;
export type OpErrorCode = (typeof OP_ERROR_CODES)[number];
