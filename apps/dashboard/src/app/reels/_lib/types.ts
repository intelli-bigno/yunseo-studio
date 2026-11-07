// [릴스 편집기] 타입 — 모델·상수·오류 코드는 엔진(@yunseo/domain, packages/domain/src/reel/timeline.ts·ops.ts)이 정본이다.
// 화면은 이 파일만 import 하고, 여기서 도메인 export 를 그대로 다시 내보낸다. 이 파일에 새로 두는 것은
// 화면 전용(자산 목록 줄 SourceRef)과 요청·응답의 타입 있는 모양(Op 합집합·OpRequest·OpSuccess)뿐이다 — 문서: docs/12-reels-ops-schema.md §2~§4.
import {
  DEFAULT_CLIP_AUDIO,
  DEFAULT_COLOR,
  DEFAULT_TRANSFORM,
  KEY_PROPS,
  REELS_DEFAULT_MS,
  REELS_MAX_MS,
  REELS_MIN_CLIP_MS,
  REELS_OP_ERROR_STATUS,
  REELS_SPEED,
  REELS_V2_TRACK_KINDS,
  REELS_VOLUME_DB,
  REEL_TRANSITIONS,
  TRANSITION_DIRECTIONS,
  type Clip,
  type ClipAudio,
  type Color,
  type Component,
  type Keyframe,
  type KeyEase,
  type KeyProp,
  type Ms,
  type OpEffects,
  type ReelTransitionName,
  type ReelsProjectV2,
  type TextBody,
  type Track,
  type TrackKind,
  type Transform,
  type Transition,
  type Unit,
} from "@yunseo/domain";

export type { Clip, ClipAudio, Color, Component, Keyframe, KeyEase, KeyProp, Ms, OpEffects, ReelsProjectV2, TextBody, Track, TrackKind, Transform, Transition, Unit };
export { DEFAULT_COLOR, DEFAULT_TRANSFORM, KEY_PROPS };

// ── 도메인 이름 → 화면에서 쓰던 이름 ──
export const TRACK_KINDS = REELS_V2_TRACK_KINDS;
export const TRANSITION_KINDS = REEL_TRANSITIONS;
export type TransitionKind = ReelTransitionName;
export type Direction = (typeof TRANSITION_DIRECTIONS)[number];
export type Corner = Extract<Component, { type: "watermark" }>["corner"];

export const DEFAULT_AUDIO = DEFAULT_CLIP_AUDIO;
export const MIN_CLIP_MS: number = REELS_MIN_CLIP_MS;
export const MAX_MS: number = REELS_MAX_MS;
export const DEFAULT_IMAGE_MS: number = REELS_DEFAULT_MS.image;
export const DEFAULT_TEXT_MS: number = REELS_DEFAULT_MS.text;
export const SPEED_RANGE: readonly [number, number] = [REELS_SPEED.min, REELS_SPEED.max];
export const DB_RANGE: readonly [number, number] = [REELS_VOLUME_DB.min, REELS_VOLUME_DB.max];

/** 편집에 쓰는 자산 목록 한 줄(서버가 준다) — 화면 전용 */
export interface SourceRef {
  id: string;
  kind: "video" | "image" | "audio";
  label: string;
  src: string;
  poster?: string;
  durationMs?: number;
}

// ── op (문서 §4) — 서버는 느슨한 { op: string } & Record 로 받고 인자를 검사한다. 화면은 이 합집합으로 만든다 ──
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

/** 문서 §3 오류 코드 — 엔진 표(REELS_OP_ERROR_STATUS)의 키 */
export const OP_ERROR_CODES = Object.keys(REELS_OP_ERROR_STATUS) as (keyof typeof REELS_OP_ERROR_STATUS)[];
export type OpErrorCode = (typeof OP_ERROR_CODES)[number];
