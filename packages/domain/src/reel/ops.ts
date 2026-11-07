// 릴스 편집 명령(op) 적용기 — docs/12-reels-ops-schema.md §4 가 정본. 순수 함수만 둔다.
// applyOp(project, op, ctx) → { project, forward, inverse, effects, warnings }. 실패하면 ReelsOpError 를 던지고 원본은 그대로다.
// 실행취소는 op 별 역연산 대신 「앞뒤 프로젝트 차이(patch)」로 저장한다 — apply(inverse, apply(forward, p)) == p 가 모든 op 에 대해 같은 코드로 성립한다.
import { parseSrt, SrtParseError } from "./srt";
import {
  DEFAULT_CLIP_AUDIO,
  DEFAULT_COLOR,
  DEFAULT_TRANSFORM,
  KEY_EASES,
  KEY_PROPS,
  REELS_DEFAULT_MS,
  REELS_MAX_MS,
  REELS_MIN_CLIP_MS,
  REELS_SPEED,
  REELS_V2_TRACK_KINDS,
  REELS_VOLUME_DB,
  ReelsOpError,
  TRANSITION_DIRECTIONS,
  checkProject,
  clipEnd,
  clipLength,
  clipsOnTrack,
  isTransitionKind,
  trackAccepts,
  trackEndV2,
  type Clip,
  type Color,
  type Component,
  type KeyEase,
  type KeyProp,
  type Keyframe,
  type Ms,
  type ReelsProjectV2,
  type SourceInfo,
  type TextBody,
  type Track,
  type TrackKind,
  type Transform,
  type Transition,
} from "./timeline";

export const REELS_OP_NAMES = [
  "add_clip", "remove_clip", "trim", "split", "ripple_delete", "move", "set_speed", "set_transform",
  "add_text", "update_text", "import_srt", "auto_place_subtitles", "set_volume", "set_fade", "add_component",
  "set_transition", "set_color", "add_keyframe", "remove_keyframe", "add_track", "remove_track", "set_track",
  "undo", "redo", "batch", "replace_project",
] as const;
export type ReelsOpName = (typeof REELS_OP_NAMES)[number];
/** 요청 그대로의 op(인자 검사는 적용기가 한다) */
export type ReelsOp = { op: string } & Record<string, unknown>;

export const REELS_BATCH_MAX = 200;
export const REELS_UNDO_DEPTH = 200;

export interface SpeechSegment { from: Ms; to: Ms }

export interface OpContext {
  /** 원본 id → 종류·길이. 없으면 add_clip 이 SOURCE_NOT_FOUND */
  sources?: (id: string) => SourceInfo | undefined;
  /** auto_place_subtitles — 음성 클립 원본 안의 말소리 구간(원본 ms). 서버가 silencedetect 로 재서 준다 */
  speech?: (clipId: string) => SpeechSegment[] | undefined;
  /** 등록된 LUT 이름 목록. 주면 set_color.lut.id 를 검사한다 */
  luts?: readonly string[];
  subtitleMaxLines?: number;
}

/** 프로젝트 차이 — tracks 는 바뀌었으면 통째, 클립은 넣기/바꾸기·지우기 + 최종 순서 */
export interface ProjectPatch {
  title?: string;
  tracks?: Track[];
  upsert: Clip[];
  remove: string[];
  order?: string[];
}

export interface OpEffects { created: string[]; updated: string[]; removed: string[] }

export interface OpResult {
  project: ReelsProjectV2;
  forward: ProjectPatch;
  inverse: ProjectPatch;
  effects: OpEffects;
  warnings: string[];
}

// ── 차이 계산 ─────────────────────────────────────────────
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}
export const sameProject = (a: ReelsProjectV2, b: ReelsProjectV2): boolean => stable(a) === stable(b);

const clone = <T>(v: T): T => structuredClone(v);

export function applyPatch(p: ReelsProjectV2, patch: ProjectPatch): ReelsProjectV2 {
  const gone = new Set(patch.remove);
  const up = new Map(patch.upsert.map((c) => [c.id, c]));
  const clips = p.clips.filter((c) => !gone.has(c.id)).map((c) => (up.has(c.id) ? clone(up.get(c.id)!) : c));
  const have = new Set(clips.map((c) => c.id));
  for (const c of patch.upsert) if (!have.has(c.id)) clips.push(clone(c));
  let ordered = clips;
  if (patch.order) {
    const byId = new Map(clips.map((c) => [c.id, c]));
    ordered = patch.order.map((id) => byId.get(id)).filter((c): c is Clip => c !== undefined);
  }
  return { ...p, ...(patch.title !== undefined ? { title: patch.title } : {}), tracks: patch.tracks ? clone(patch.tracks) : p.tracks, clips: ordered };
}

export function diffProjects(a: ReelsProjectV2, b: ReelsProjectV2): ProjectPatch {
  const before = new Map(a.clips.map((c) => [c.id, c]));
  const after = new Set(b.clips.map((c) => c.id));
  const patch: ProjectPatch = {
    upsert: b.clips.filter((c) => !before.has(c.id) || stable(before.get(c.id)) !== stable(c)).map(clone),
    remove: a.clips.filter((c) => !after.has(c.id)).map((c) => c.id),
  };
  if (a.title !== b.title) patch.title = b.title;
  if (stable(a.tracks) !== stable(b.tracks)) patch.tracks = clone(b.tracks);
  const natural = applyPatch(a, patch).clips.map((c) => c.id);
  const want = b.clips.map((c) => c.id);
  if (natural.join("\u0000") !== want.join("\u0000")) patch.order = want;
  return patch;
}

const effectsOf = (a: ReelsProjectV2, patch: ProjectPatch): OpEffects => {
  const had = new Set(a.clips.map((c) => c.id));
  const hadTracks = new Set(a.tracks.map((t) => t.id));
  const nowTracks = new Set((patch.tracks ?? a.tracks).map((t) => t.id));
  const trackCreated = [...nowTracks].filter((id) => !hadTracks.has(id));
  const trackRemoved = [...hadTracks].filter((id) => !nowTracks.has(id));
  const trackUpdated = patch.tracks ? patch.tracks.filter((t) => hadTracks.has(t.id) && stable(a.tracks.find((x) => x.id === t.id)) !== stable(t)).map((t) => t.id) : [];
  return {
    created: [...patch.upsert.filter((c) => !had.has(c.id)).map((c) => c.id), ...trackCreated],
    updated: [...patch.upsert.filter((c) => had.has(c.id)).map((c) => c.id), ...trackUpdated],
    removed: [...patch.remove, ...trackRemoved],
  };
};

// ── 인자 검사 ─────────────────────────────────────────────
const arg = (path: string, msg: string): never => {
  throw new ReelsOpError("INVALID_ARGUMENT", `${path}: ${msg}`, path);
};
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function int(o: Record<string, unknown>, key: string, opt: { lo?: number; hi?: number } = {}): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isInteger(v)) return arg(`op.${key}`, "정수 ms 여야 한다");
  if (v < (opt.lo ?? 0) || v > (opt.hi ?? REELS_MAX_MS)) return arg(`op.${key}`, `${opt.lo ?? 0}~${opt.hi ?? REELS_MAX_MS} 밖`);
  return v;
}
const optInt = (o: Record<string, unknown>, key: string, opt?: { lo?: number; hi?: number }) => (o[key] === undefined ? undefined : int(o, key, opt));
function num(o: Record<string, unknown>, key: string, lo: number, hi: number, path = `op.${key}`): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) return arg(path, `${lo}~${hi} 숫자여야 한다`);
  return v;
}
function str(o: Record<string, unknown>, key: string, max = 64, path = `op.${key}`): string {
  const v = o[key];
  if (typeof v !== "string" || !v || v.length > max) return arg(path, `1~${max}자 문자열이어야 한다`);
  return v;
}
const optStr = (o: Record<string, unknown>, key: string, max = 64) => (o[key] === undefined ? undefined : str(o, key, max));
function bool(o: Record<string, unknown>, key: string): boolean | undefined {
  const v = o[key];
  if (v === undefined) return undefined;
  if (typeof v !== "boolean") return arg(`op.${key}`, "true/false");
  return v;
}
function oneOf<T extends string>(o: Record<string, unknown>, key: string, list: readonly T[], path = `op.${key}`): T {
  const v = o[key];
  if (!list.includes(v as T)) return arg(path, `${list.join("|")} 중 하나`);
  return v as T;
}

// ── 작업 사본 도우미 ──────────────────────────────────────
interface Work {
  p: ReelsProjectV2;
  ctx: OpContext;
  warnings: string[];
}

function track(w: Work, id: unknown, path = "op.trackId"): Track {
  if (typeof id !== "string") return arg(path, "트랙 id 가 필요하다");
  const t = w.p.tracks.find((x) => x.id === id);
  if (!t) throw new ReelsOpError("TRACK_NOT_FOUND", `트랙 ${id} 없음`, path);
  return t;
}
function editableTrack(w: Work, id: unknown, path = "op.trackId"): Track {
  const t = track(w, id, path);
  if (t.locked) throw new ReelsOpError("TRACK_LOCKED", `${t.name} 트랙이 잠겼다`, path, { trackId: t.id });
  return t;
}
function clip(w: Work, id: unknown, path = "op.clipId"): Clip {
  if (typeof id !== "string") return arg(path, "클립 id 가 필요하다");
  const c = w.p.clips.find((x) => x.id === id);
  if (!c) throw new ReelsOpError("CLIP_NOT_FOUND", `${id} 없음`, path);
  editableTrack(w, c.trackId, path);
  return c;
}
function usedIds(p: ReelsProjectV2): Set<string> {
  const s = new Set<string>([...p.tracks.map((t) => t.id), ...p.clips.map((c) => c.id)]);
  for (const c of p.clips) for (const k of c.keyframes ?? []) s.add(k.id);
  return s;
}
function newId(w: Work, prefix: string, given: unknown, path: string): string {
  const used = usedIds(w.p);
  if (given !== undefined) {
    if (typeof given !== "string" || !given || given.length > 64) return arg(path, "id 는 1~64자");
    if (used.has(given)) throw new ReelsOpError("ID_EXISTS", `id ${given} 이미 있음`, path);
    return given;
  }
  for (let n = 1; ; n += 1) {
    const id = `${prefix}-${String(n).padStart(4, "0")}`;
    if (!used.has(id)) return id;
  }
}
const shiftAfter = (w: Work, trackId: string, from: Ms, delta: Ms, ignore?: string) => {
  if (!delta) return;
  for (const c of w.p.clips) if (c.trackId === trackId && c.id !== ignore && c.start >= from) c.start += delta;
};
const removeClips = (w: Work, ids: Set<string>) => {
  w.p.clips = w.p.clips.filter((c) => !ids.has(c.id));
};

function parseTransformPatch(v: unknown, path: string): Partial<Transform> {
  if (!isObj(v)) return arg(path, "객체여야 한다");
  const out: Partial<Transform> = {};
  if (v.cx !== undefined) out.cx = num(v, "cx", -1, 2, `${path}.cx`);
  if (v.cy !== undefined) out.cy = num(v, "cy", -1, 2, `${path}.cy`);
  if (v.scale !== undefined) out.scale = num(v, "scale", 0.05, 10, `${path}.scale`);
  if (v.rotation !== undefined) out.rotation = num(v, "rotation", -360, 360, `${path}.rotation`);
  if (v.opacity !== undefined) out.opacity = num(v, "opacity", 0, 1, `${path}.opacity`);
  return out;
}

function parseText(v: unknown, path: string, partial: boolean): Partial<TextBody> {
  if (!isObj(v)) return arg(path, "객체여야 한다");
  const out: Partial<TextBody> = {};
  if (v.value !== undefined || !partial) {
    if (typeof v.value !== "string" || v.value.length > 500) return arg(`${path}.value`, "500자 이하 문자열");
    out.value = v.value;
  }
  if (v.style !== undefined || !partial) out.style = str(v, "style", 40, `${path}.style`);
  if (v.runs !== undefined) {
    if (!Array.isArray(v.runs) || v.runs.length > 200) return arg(`${path}.runs`, "200개 이하 배열");
    out.runs = v.runs.map((r, i) => {
      if (!isObj(r)) return arg(`${path}.runs[${i}]`, "객체");
      const run: NonNullable<TextBody["runs"]>[number] = { from: num(r, "from", 0, 500, `${path}.runs[${i}].from`), to: num(r, "to", 0, 500, `${path}.runs[${i}].to`) };
      if (r.color !== undefined) run.color = str(r, "color", 16, `${path}.runs[${i}].color`);
      if (r.bold !== undefined) run.bold = r.bold === true;
      return run;
    });
  }
  if (v.box !== undefined) {
    if (!isObj(v.box)) return arg(`${path}.box`, "객체");
    out.box = { cx: num(v.box, "cx", 0, 1, `${path}.box.cx`), cy: num(v.box, "cy", 0, 1, `${path}.box.cy`), w: num(v.box, "w", 0.05, 1, `${path}.box.w`) };
  }
  return out;
}

function parseComponent(w: Work, v: unknown, path: string): Component {
  if (!isObj(v)) return arg(path, "객체여야 한다");
  const type = oneOf(v, "type", ["sticker", "watermark", "card", "title", "badge", "cta"] as const, `${path}.type`);
  if (type === "sticker") return { type, assetId: str(v, "assetId", 120, `${path}.assetId`) };
  if (type === "watermark") {
    const c: Component = { type, assetId: str(v, "assetId", 120, `${path}.assetId`), corner: oneOf(v, "corner", ["tl", "tr", "bl", "br"] as const, `${path}.corner`) };
    if (v.marginPx !== undefined) c.marginPx = num(v, "marginPx", 0, 540, `${path}.marginPx`);
    return c;
  }
  if (type === "card") {
    const sourceId = str(v, "sourceId", 200, `${path}.sourceId`);
    if (w.ctx.sources && w.ctx.sources(sourceId)?.kind !== "image") throw new ReelsOpError("SOURCE_NOT_FOUND", `카드 그림 ${sourceId} 없음`, `${path}.sourceId`);
    return { type, sourceId };
  }
  if (typeof v.text !== "string" || v.text.length > 200) return arg(`${path}.text`, "200자 이하 문자열");
  return { type, text: v.text };
}

// ── op 별 적용 ────────────────────────────────────────────
type Handler = (w: Work, o: Record<string, unknown>) => void;

function placeOrInsert(w: Work, c: Clip, mode: "place" | "insert") {
  if (mode === "insert") shiftAfter(w, c.trackId, c.start, clipLength(c));
  w.p.clips.push(c);
}

const HANDLERS: Record<Exclude<ReelsOpName, "undo" | "redo" | "batch">, Handler> = {
  add_clip(w, o) {
    const t = editableTrack(w, o.trackId);
    const sourceId = str(o, "sourceId", 200);
    const src = w.ctx.sources?.(sourceId);
    if (!src) throw new ReelsOpError("SOURCE_NOT_FOUND", `원본 ${sourceId} 없음`, "op.sourceId");
    const mode = o.mode === undefined ? "place" : oneOf(o, "mode", ["place", "insert"] as const);
    const bounded = src.kind !== "image" && src.durationMs !== undefined;
    const hi = bounded ? src.durationMs! : 3_600_000;
    const inMs = optInt(o, "in", { hi }) ?? 0;
    const outMs = optInt(o, "out", { lo: 1, hi }) ?? (bounded ? src.durationMs! : inMs + REELS_DEFAULT_MS[src.kind]);
    const c: Clip = { id: newId(w, "c", o.id, "op.id"), trackId: t.id, start: 0, in: inMs, out: outMs, speed: 1, sourceId, sourceKind: src.kind };
    if (bounded) c.sourceMs = src.durationMs!;
    c.start = optInt(o, "start") ?? trackEndV2(w.p, t.id);
    if (!trackAccepts(t.kind, c)) throw new ReelsOpError("TRACK_KIND_MISMATCH", `${t.name}(${t.kind}) 트랙에 ${src.kind} 를 놓을 수 없다`, "op.trackId");
    if (t.kind === "video" || t.kind === "overlay") c.transform = { ...DEFAULT_TRANSFORM };
    placeOrInsert(w, c, mode);
  },
  remove_clip(w, o) {
    const c = clip(w, o.clipId);
    removeClips(w, new Set([c.id]));
    if (bool(o, "ripple")) shiftAfter(w, c.trackId, clipEnd(c), -clipLength(c));
  },
  trim(w, o) {
    const c = clip(w, o.clipId);
    const edge = oneOf(o, "edge", ["start", "end"] as const);
    const to = int(o, "to");
    const oldEnd = clipEnd(c);
    if (edge === "start") {
      if (to >= oldEnd) throw new ReelsOpError("OUT_OF_RANGE", `시작(${to})이 끝(${oldEnd}) 이후`, "op.to");
      const newIn = c.in + Math.round((to - c.start) * c.speed);
      if (newIn < 0) throw new ReelsOpError("OUT_OF_RANGE", `원본 앞이 모자라다(in=${newIn})`, "op.to");
      c.in = newIn;
      c.start = to;
      if (bool(o, "ripple")) {
        // 앞을 당겨 생긴 길이 변화만큼 뒤 클립을 민다(시작은 그대로 두고 끝이 움직인 것처럼)
        const delta = clipEnd(c) - oldEnd;
        shiftAfter(w, c.trackId, oldEnd, delta, c.id);
      }
    } else {
      if (to <= c.start) throw new ReelsOpError("OUT_OF_RANGE", `끝(${to})이 시작(${c.start}) 이전`, "op.to");
      c.out = c.in + Math.round((to - c.start) * c.speed);
      if (bool(o, "ripple")) shiftAfter(w, c.trackId, oldEnd, clipEnd(c) - oldEnd, c.id);
    }
  },
  split(w, o) {
    const c = clip(w, o.clipId);
    const at = int(o, "at");
    const end = clipEnd(c);
    if (at - c.start < REELS_MIN_CLIP_MS || end - at < REELS_MIN_CLIP_MS) throw new ReelsOpError("SPLIT_AT_EDGE", `자르는 점 ${at} 이 가장자리(${c.start}·${end})에서 ${REELS_MIN_CLIP_MS}ms 안`, "op.at");
    const id = newId(w, `${c.id}b`.slice(0, 58), o.newId, "op.newId");
    const cut = c.in + Math.round((at - c.start) * c.speed);
    const local = at - c.start;
    const right: Clip = clone(c);
    right.id = id;
    right.start = at;
    right.in = cut;
    delete right.transition;
    c.out = cut;
    if (c.keyframes) {
      c.keyframes = c.keyframes.filter((k) => k.at < local);
      right.keyframes = (right.keyframes ?? []).filter((k) => k.at >= local).map((k) => ({ ...k, id: `${k.id}~${id}`.slice(0, 64), at: k.at - local }));
      if (!c.keyframes.length) delete c.keyframes;
      if (!right.keyframes.length) delete right.keyframes;
    }
    if (c.audio) {
      c.audio = { ...c.audio, fadeOutMs: 0 };
      right.audio = { ...right.audio!, fadeInMs: 0 };
    }
    w.p.clips.splice(w.p.clips.indexOf(c) + 1, 0, right);
  },
  ripple_delete(w, o) {
    if (!Array.isArray(o.ranges) || !o.ranges.length || o.ranges.length > 200) return arg("op.ranges", "1~200개 배열");
    const ranges = o.ranges.map((r, i) => {
      if (!isObj(r)) return arg(`op.ranges[${i}]`, "{from,to}");
      const from = int(r, "from");
      const to = int(r, "to");
      if (to <= from) return arg(`op.ranges[${i}]`, "to > from");
      return { from, to };
    });
    ranges.sort((a, b) => b.from - a.from);
    for (let i = 1; i < ranges.length; i += 1) if (ranges[i]!.to > ranges[i - 1]!.from) return arg("op.ranges", "구간이 겹친다");
    let tracks: Track[];
    if (o.trackIds === undefined) tracks = w.p.tracks.filter((t) => !t.locked);
    else {
      if (!Array.isArray(o.trackIds)) return arg("op.trackIds", "배열");
      tracks = o.trackIds.map((id, i) => editableTrack(w, id, `op.trackIds[${i}]`));
    }
    for (const t of tracks)
      for (const { from, to } of ranges) {
        const span = to - from;
        for (const c of clipsOnTrack(w.p, t.id)) {
          const s = c.start;
          const e = clipEnd(c);
          if (e <= from) continue;
          if (s >= to) {
            c.start -= span;
            continue;
          }
          if (s >= from && e <= to) {
            removeClips(w, new Set([c.id]));
            continue;
          }
          if (s < from && e > to) {
            // 가운데가 빠진다 — 왼쪽은 from 까지, 오른쪽 조각은 to 부터를 from 자리로
            const right = clone(c);
            right.id = newId(w, `${c.id}r`.slice(0, 58), undefined, "op");
            right.in = c.in + Math.round((to - s) * c.speed);
            right.start = from;
            delete right.transition;
            delete right.keyframes;
            c.out = c.in + Math.round((from - s) * c.speed);
            if (c.audio) {
              c.audio = { ...c.audio, fadeOutMs: 0 };
              right.audio = { ...right.audio!, fadeInMs: 0 };
            }
            w.p.clips.push(right);
            continue;
          }
          if (s < from) c.out = c.in + Math.round((from - s) * c.speed);
          else {
            c.in += Math.round((to - s) * c.speed);
            c.start = from;
          }
        }
      }
  },
  move(w, o) {
    const c = clip(w, o.clipId);
    const start = int(o, "start");
    if (o.trackId !== undefined) {
      const t = editableTrack(w, o.trackId);
      if (!trackAccepts(t.kind, c)) throw new ReelsOpError("TRACK_KIND_MISMATCH", `${t.name}(${t.kind}) 트랙에 ${c.id} 를 놓을 수 없다`, "op.trackId");
      c.trackId = t.id;
    }
    c.start = start;
  },
  set_speed(w, o) {
    const c = clip(w, o.clipId);
    const speed = num(o, "speed", REELS_SPEED.min, REELS_SPEED.max);
    const oldEnd = clipEnd(c);
    c.speed = speed;
    if (bool(o, "keepEnd")) {
      const start = oldEnd - clipLength(c);
      if (start < 0) throw new ReelsOpError("OUT_OF_RANGE", "끝을 고정하면 시작이 0 앞으로 간다", "op.speed");
      c.start = start;
    }
    if (c.keyframes) {
      const len = clipLength(c);
      c.keyframes = c.keyframes.filter((k) => k.at <= len);
    }
  },
  set_transform(w, o) {
    const c = clip(w, o.clipId);
    if (c.text !== undefined && c.component === undefined && c.sourceKind === undefined) return arg("op.clipId", "글자 클립은 text.box 로 옮긴다");
    c.transform = { ...DEFAULT_TRANSFORM, ...c.transform, ...parseTransformPatch(o.transform, "op.transform") };
  },
  add_text(w, o) {
    const t = editableTrack(w, o.trackId);
    if (t.kind !== "text" && t.kind !== "subtitle") throw new ReelsOpError("TRACK_KIND_MISMATCH", `${t.name}(${t.kind}) 트랙에 글자를 놓을 수 없다`, "op.trackId");
    const dur = int(o, "durationMs", { lo: REELS_MIN_CLIP_MS });
    w.p.clips.push({ id: newId(w, "x", o.id, "op.id"), trackId: t.id, start: int(o, "start"), in: 0, out: dur, speed: 1, text: parseText(o.text, "op.text", false) as TextBody });
  },
  update_text(w, o) {
    const c = clip(w, o.clipId);
    if (!c.text) return arg("op.clipId", "글자 클립이 아니다");
    c.text = { ...c.text, ...parseText(o.text, "op.text", true) };
  },
  import_srt(w, o) {
    const t = editableTrack(w, o.trackId);
    if (t.kind !== "subtitle" && t.kind !== "text") throw new ReelsOpError("TRACK_KIND_MISMATCH", `${t.name}(${t.kind}) 트랙에 자막을 놓을 수 없다`, "op.trackId");
    if (typeof o.srt !== "string" || o.srt.length > 500_000) return arg("op.srt", "문자열(500KB 이하)");
    const offset = optInt(o, "offsetMs") ?? 0;
    const style = optStr(o, "style", 40) ?? (t.kind === "subtitle" ? "subtitle-default" : "text-default");
    let cues;
    try {
      cues = parseSrt(o.srt);
    } catch (e) {
      if (e instanceof SrtParseError) throw new ReelsOpError("SRT_PARSE_ERROR", e.message, "op.srt", { line: e.line });
      throw e;
    }
    if (bool(o, "replace")) removeClips(w, new Set(clipsOnTrack(w.p, t.id).map((c) => c.id)));
    for (const q of cues) {
      const len = Math.max(REELS_MIN_CLIP_MS, q.endMs - q.startMs);
      w.p.clips.push({ id: newId(w, "sub", undefined, "op"), trackId: t.id, start: q.startMs + offset, in: 0, out: len, speed: 1, text: { value: q.text, style } });
    }
  },
  auto_place_subtitles(w, o) {
    const t = editableTrack(w, o.trackId);
    if (t.kind !== "subtitle") throw new ReelsOpError("TRACK_KIND_MISMATCH", `${t.name} 는 자막 트랙이 아니다`, "op.trackId");
    if (typeof o.script !== "string" || !o.script.trim() || o.script.length > 20_000) return arg("op.script", "1~20000자 문자열");
    const audioId = str(o, "audioClipId");
    const audio = w.p.clips.find((c) => c.id === audioId);
    if (!audio) throw new ReelsOpError("CLIP_NOT_FOUND", `${audioId} 없음`, "op.audioClipId");
    const speech = w.ctx.speech?.(audioId);
    if (!speech) return arg("op.audioClipId", "음성 구간 정보를 잴 수 없다(원본 소리 없음)");
    const maxLines = optInt(o, "maxLines", { lo: 1, hi: 4 }) ?? w.ctx.subtitleMaxLines ?? 2;
    const style = optStr(o, "style", 40) ?? "subtitle-default";
    // 원본 ms → 타임라인 ms (클립이 보여 주는 구간만)
    const segs = speech
      .map((s) => ({ from: Math.max(s.from, audio.in), to: Math.min(s.to, audio.out) }))
      .filter((s) => s.to - s.from >= REELS_MIN_CLIP_MS)
      .map((s) => ({ from: audio.start + Math.round((s.from - audio.in) / audio.speed), to: audio.start + Math.round((s.to - audio.in) / audio.speed) }));
    const placed = placeScript(o.script, segs, maxLines);
    w.warnings.push(...placed.warnings);
    for (const p of placed.cues) w.p.clips.push({ id: newId(w, "sub", undefined, "op"), trackId: t.id, start: p.from, in: 0, out: p.to - p.from, speed: 1, text: { value: p.text, style } });
  },
  set_volume(w, o) {
    const db = num(o, "volumeDb", REELS_VOLUME_DB.min, REELS_VOLUME_DB.max);
    if ((o.clipId === undefined) === (o.trackId === undefined)) return arg("op", "clipId 와 trackId 중 하나만");
    if (o.trackId !== undefined) {
      const t = track(w, o.trackId);
      if (t.kind !== "audio" && t.kind !== "video") throw new ReelsOpError("TRACK_KIND_MISMATCH", `${t.name} 트랙에는 소리가 없다`, "op.trackId");
      t.volumeDb = db;
      return;
    }
    const c = clip(w, o.clipId);
    if (c.sourceKind !== "audio" && c.sourceKind !== "video") throw new ReelsOpError("TRACK_KIND_MISMATCH", `${c.id} 에는 소리가 없다`, "op.clipId");
    c.audio = { ...DEFAULT_CLIP_AUDIO, ...c.audio, volumeDb: db };
  },
  set_fade(w, o) {
    const c = clip(w, o.clipId);
    if (c.sourceKind !== "audio" && c.sourceKind !== "video") throw new ReelsOpError("TRACK_KIND_MISMATCH", `${c.id} 에는 소리가 없다`, "op.clipId");
    const a = { ...DEFAULT_CLIP_AUDIO, ...c.audio };
    const inMs = optInt(o, "inMs");
    const outMs = optInt(o, "outMs");
    if (inMs !== undefined) a.fadeInMs = inMs;
    if (outMs !== undefined) a.fadeOutMs = outMs;
    if (o.curve !== undefined) a.fadeCurve = oneOf(o, "curve", ["linear", "ease"] as const);
    c.audio = a;
  },
  add_component(w, o) {
    const t = editableTrack(w, o.trackId);
    if (t.kind !== "overlay") throw new ReelsOpError("TRACK_KIND_MISMATCH", `${t.name}(${t.kind}) 트랙에 컴포넌트를 놓을 수 없다`, "op.trackId");
    const dur = int(o, "durationMs", { lo: REELS_MIN_CLIP_MS });
    const c: Clip = { id: newId(w, "o", o.id, "op.id"), trackId: t.id, start: int(o, "start"), in: 0, out: dur, speed: 1, component: parseComponent(w, o.component, "op.component") };
    c.transform = { ...DEFAULT_TRANSFORM, ...(o.transform !== undefined ? parseTransformPatch(o.transform, "op.transform") : {}) };
    w.p.clips.push(c);
  },
  set_transition(w, o) {
    const c = clip(w, o.clipId);
    if (o.transition === null || (isObj(o.transition) && o.transition.kind === "cut")) {
      // 컷으로 되돌린다 — 겹쳐 있던 만큼 뒤를 민다
      const prev = clipsOnTrack(w.p, c.trackId, c.id).filter((x) => x.start < c.start).at(-1);
      const overlap = prev ? Math.max(0, clipEnd(prev) - c.start) : 0;
      delete c.transition;
      if (overlap) {
        shiftAfter(w, c.trackId, c.start + 1, overlap, c.id);
        c.start += overlap;
      }
      return;
    }
    if (!isObj(o.transition)) return arg("op.transition", "객체 또는 null");
    const kind = o.transition.kind;
    if (!isTransitionKind(kind)) return arg("op.transition.kind", "cut|crossfade|dip|slide");
    const tr: Transition = { kind, durationMs: int(o.transition, "durationMs", { lo: 1, hi: 10_000 }) };
    if (o.transition.direction !== undefined) tr.direction = oneOf(o.transition, "direction", TRANSITION_DIRECTIONS, "op.transition.direction");
    const prev = clipsOnTrack(w.p, c.trackId, c.id).filter((x) => x.start < c.start || (x.start === c.start && x.id < c.id)).at(-1);
    if (!prev) throw new ReelsOpError("OUT_OF_RANGE", `${c.id} 앞에 같은 트랙 클립이 없다`, "op.clipId");
    const pull = c.start - (clipEnd(prev) - tr.durationMs);
    c.transition = tr;
    if (pull) {
      const from = c.start;
      c.start -= pull;
      shiftAfter(w, c.trackId, from + 1, -pull, c.id);
    }
  },
  set_color(w, o) {
    const c = clip(w, o.clipId);
    if (c.sourceKind !== "video" && c.sourceKind !== "image" && c.component?.type !== "card") throw new ReelsOpError("TRACK_KIND_MISMATCH", `${c.id} 는 그림 클립이 아니다`, "op.clipId");
    if (!isObj(o.color)) return arg("op.color", "객체");
    const v = o.color;
    const next: Color = { ...DEFAULT_COLOR, ...c.color };
    for (const k of ["brightness", "contrast", "saturation", "temperature"] as const) if (v[k] !== undefined) next[k] = num(v, k, -1, 1, `op.color.${k}`);
    if (v.lut !== undefined) {
      if (v.lut === null) next.lut = null;
      else {
        if (!isObj(v.lut)) return arg("op.color.lut", "{id,strength} 또는 null");
        const id = str(v.lut, "id", 64, "op.color.lut.id");
        if (!/^[A-Za-z0-9_-]+$/.test(id)) return arg("op.color.lut.id", "영문·숫자·_- 만");
        if (w.ctx.luts && !w.ctx.luts.includes(id)) throw new ReelsOpError("INVALID_ARGUMENT", `등록된 LUT 이 아니다: ${id}`, "op.color.lut.id");
        next.lut = { id, strength: v.lut.strength === undefined ? 1 : num(v.lut, "strength", 0, 1, "op.color.lut.strength") };
      }
    }
    c.color = next;
  },
  add_keyframe(w, o) {
    const c = clip(w, o.clipId);
    const prop = oneOf(o, "prop", KEY_PROPS) as KeyProp;
    const at = int(o, "at");
    const lim: Record<KeyProp, [number, number]> = { cx: [-1, 2], cy: [-1, 2], scale: [0.05, 10], rotation: [-360, 360], opacity: [0, 1], volumeDb: [REELS_VOLUME_DB.min, REELS_VOLUME_DB.max] };
    const value = num(o, "value", lim[prop][0], lim[prop][1]);
    const ease = (o.ease === undefined ? "linear" : oneOf(o, "ease", KEY_EASES)) as KeyEase;
    const ks = (c.keyframes ??= []);
    const same = ks.find((k) => k.prop === prop && k.at === at);
    if (same) {
      same.value = value;
      if (o.ease !== undefined) same.ease = ease;
      return;
    }
    const k: Keyframe = { id: newId(w, "kf", o.id, "op.id"), prop, at, value, ease };
    ks.push(k);
    ks.sort((a, b) => a.prop.localeCompare(b.prop) || a.at - b.at);
  },
  remove_keyframe(w, o) {
    const c = clip(w, o.clipId);
    const id = str(o, "keyframeId");
    const i = (c.keyframes ?? []).findIndex((k) => k.id === id);
    if (i < 0) throw new ReelsOpError("KEYFRAME_NOT_FOUND", `${id} 없음`, "op.keyframeId");
    c.keyframes!.splice(i, 1);
    if (!c.keyframes!.length) delete c.keyframes;
  },
  add_track(w, o) {
    const kind = oneOf(o, "kind", REELS_V2_TRACK_KINDS) as TrackKind;
    const names: Record<TrackKind, string> = { video: "영상", text: "텍스트", subtitle: "자막", audio: "음성", overlay: "오버레이" };
    const t: Track = { id: newId(w, `t-${kind}`, o.id, "op.id"), kind, name: optStr(o, "name", 40) ?? `${names[kind]} ${w.p.tracks.filter((x) => x.kind === kind).length + 1}` };
    const index = optInt(o, "index", { hi: w.p.tracks.length }) ?? w.p.tracks.length;
    w.p.tracks.splice(index, 0, t);
  },
  remove_track(w, o) {
    const t = editableTrack(w, o.trackId);
    w.p.tracks = w.p.tracks.filter((x) => x.id !== t.id);
    w.p.clips = w.p.clips.filter((c) => c.trackId !== t.id);
  },
  set_track(w, o) {
    const t = track(w, o.trackId);
    for (const k of ["muted", "hidden", "locked"] as const) {
      const b = bool(o, k);
      if (b === true) t[k] = true;
      else if (b === false) delete t[k];
    }
    if (o.name !== undefined) t.name = str(o, "name", 40);
    if (o.volumeDb !== undefined) t.volumeDb = num(o, "volumeDb", REELS_VOLUME_DB.min, REELS_VOLUME_DB.max);
    if (o.index !== undefined) {
      const index = int(o, "index", { hi: w.p.tracks.length - 1 });
      w.p.tracks = w.p.tracks.filter((x) => x !== t);
      w.p.tracks.splice(index, 0, t);
    }
  },
  replace_project(w, o) {
    if (!isObj(o.project)) return arg("op.project", "프로젝트 객체");
    w.p = clone(o.project) as unknown as ReelsProjectV2;
  },
};

function applyOne(w: Work, o: ReelsOp, inBatch: boolean): void {
  if (!isObj(o) || typeof o.op !== "string") return arg("op", "{op:<이름>} 객체여야 한다");
  if (!(REELS_OP_NAMES as readonly string[]).includes(o.op)) throw new ReelsOpError("UNKNOWN_OP", `알 수 없는 op: ${String(o.op)}`, "op.op");
  const name = o.op as ReelsOpName;
  if (name === "undo" || name === "redo") {
    if (inBatch) return arg("op.op", "batch 안에는 undo·redo 를 넣을 수 없다");
    return arg("op.op", "undo·redo 는 applyCommand 로 적용한다");
  }
  if (name === "batch") {
    if (inBatch) return arg("op.op", "batch 중첩 금지");
    if (!Array.isArray(o.ops) || !o.ops.length) return arg("op.ops", "1개 이상 배열");
    if (o.ops.length > REELS_BATCH_MAX) throw new ReelsOpError("TOO_LARGE", `batch 는 ${REELS_BATCH_MAX}개 이하`, "op.ops");
    o.ops.forEach((inner, index) => {
      try {
        applyOne(w, inner as ReelsOp, true);
      } catch (e) {
        if (!(e instanceof ReelsOpError)) throw e;
        throw new ReelsOpError("BATCH_FAILED", `${index + 1}번째 op 실패`, `op.ops[${index}]`, { index, cause: e.toBody() });
      }
    });
    return;
  }
  HANDLERS[name](w, o);
}

/** op 하나 적용(undo·redo 제외) — 실패하면 ReelsOpError, 성공하면 결과와 앞뒤 patch */
export function applyOp(project: ReelsProjectV2, op: ReelsOp, ctx: OpContext = {}): OpResult {
  const w: Work = { p: clone(project), ctx, warnings: [] };
  applyOne(w, op, false);
  w.warnings.push(...checkProject(w.p, { subtitleMaxLines: ctx.subtitleMaxLines }));
  const forward = diffProjects(project, w.p);
  return { project: w.p, forward, inverse: diffProjects(w.p, project), effects: effectsOf(project, forward), warnings: w.warnings };
}

// ── 실행취소 ──────────────────────────────────────────────
export interface OpLogEntry {
  kind: "do" | "undo" | "redo";
  /** undo·redo 가 몇 단계였나(기본 1) */
  steps?: number;
  forward: ProjectPatch;
  inverse: ProjectPatch;
}

interface Pair { forward: ProjectPatch; inverse: ProjectPatch }

/** op 로그를 처음부터 읽어 지금의 실행취소·다시 실행 스택을 만든다(사람·에이전트 공용 한 줄) */
export function historyStacks(log: readonly OpLogEntry[]): { undo: Pair[]; redo: Pair[] } {
  let undo: Pair[] = [];
  let redo: Pair[] = [];
  for (const e of log) {
    const steps = e.steps ?? 1;
    if (e.kind === "do") {
      undo.push({ forward: e.forward, inverse: e.inverse });
      if (undo.length > REELS_UNDO_DEPTH) undo = undo.slice(-REELS_UNDO_DEPTH);
      redo = [];
    } else if (e.kind === "undo") for (let i = 0; i < steps && undo.length; i += 1) redo.push(undo.pop()!);
    else for (let i = 0; i < steps && redo.length; i += 1) undo.push(redo.pop()!);
  }
  return { undo, redo };
}

export interface CommandResult extends OpResult {
  entry: OpLogEntry;
  undo: { available: boolean; redo: boolean };
}

/** 요청 op 하나(undo·redo 포함)를 적용하고 op 로그에 붙일 기록을 만든다 */
export function applyCommand(project: ReelsProjectV2, log: readonly OpLogEntry[], op: ReelsOp, ctx: OpContext = {}): CommandResult {
  const stacks = historyStacks(log);
  if (isObj(op) && (op.op === "undo" || op.op === "redo")) {
    const kind = op.op;
    const steps = op.steps === undefined ? 1 : int(op, "steps", { lo: 1, hi: REELS_UNDO_DEPTH });
    const stack = kind === "undo" ? stacks.undo : stacks.redo;
    if (!stack.length) throw new ReelsOpError(kind === "undo" ? "NOTHING_TO_UNDO" : "NOTHING_TO_REDO", kind === "undo" ? "되돌릴 편집이 없다" : "다시 할 편집이 없다");
    const n = Math.min(steps, stack.length);
    let p = project;
    for (let i = 0; i < n; i += 1) {
      const pair = stack[stack.length - 1 - i]!;
      p = applyPatch(p, kind === "undo" ? pair.inverse : pair.forward);
    }
    const warnings = checkProject(p, { subtitleMaxLines: ctx.subtitleMaxLines });
    const forward = diffProjects(project, p);
    const entry: OpLogEntry = { kind, ...(n > 1 ? { steps: n } : {}), forward, inverse: diffProjects(p, project) };
    const after = historyStacks([...log, entry]);
    return { project: p, forward, inverse: entry.inverse, effects: effectsOf(project, forward), warnings, entry, undo: { available: after.undo.length > 0, redo: after.redo.length > 0 } };
  }
  const r = applyOp(project, op, ctx);
  const entry: OpLogEntry = { kind: "do", forward: r.forward, inverse: r.inverse };
  return { ...r, entry, undo: { available: true, redo: false } };
}

export const undoState = (log: readonly OpLogEntry[]) => {
  const s = historyStacks(log);
  return { available: s.undo.length > 0, redo: s.redo.length > 0 };
};

// ── 대본 → 자막 배치(auto_place_subtitles) ─────────────────
const LINE_CHARS = 16;

/** 대본을 문장으로 — 줄바꿈과 문장 부호 뒤 공백에서 끊는다 */
export function scriptSentences(script: string): string[] {
  return script
    .split("\n")
    .flatMap((l) => l.split(/(?<=[.!?。？！])\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 한 줄 LINE_CHARS 자 안팎으로 단어 단위 줄바꿈 */
function wrap(s: string): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of s.split(/\s+/)) {
    if (cur && (cur + " " + word).length > LINE_CHARS) {
      lines.push(cur);
      cur = word;
    } else cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * 문장 수와 말소리 구간 수를 맞추고(구간이 많으면 가장 짧은 틈부터 합치고, 적으면 가장 긴 구간을 반으로 나눈다),
 * 문장 하나를 maxLines 줄 묶음으로 나눠 그 구간 안에서 글자 수 비례로 시간을 나눈다.
 */
export function placeScript(script: string, segments: readonly SpeechSegment[], maxLines: number): { cues: { from: Ms; to: Ms; text: string }[]; warnings: string[] } {
  const sentences = scriptSentences(script);
  const segs = [...segments].sort((a, b) => a.from - b.from).map((s) => ({ ...s }));
  const warnings: string[] = [];
  if (!segs.length) throw new ReelsOpError("INVALID_ARGUMENT", "음성에서 말소리 구간을 찾지 못했다", "op.audioClipId");
  if (segs.length !== sentences.length) warnings.push(`subtitle/segments: 대본 ${sentences.length}문장 · 무음 경계 구간 ${segs.length}개 — 가까운 쪽으로 맞춤`);
  while (segs.length > sentences.length) {
    let best = 0;
    for (let i = 1; i < segs.length - 1; i += 1) if (segs[i + 1]!.from - segs[i]!.to < segs[best + 1]!.from - segs[best]!.to) best = i;
    segs.splice(best, 2, { from: segs[best]!.from, to: segs[best + 1]!.to });
  }
  while (segs.length < sentences.length) {
    let best = 0;
    for (let i = 1; i < segs.length; i += 1) if (segs[i]!.to - segs[i]!.from > segs[best]!.to - segs[best]!.from) best = i;
    const s = segs[best]!;
    const mid = Math.round((s.from + s.to) / 2);
    segs.splice(best, 1, { from: s.from, to: mid }, { from: mid, to: s.to });
  }
  const cues: { from: Ms; to: Ms; text: string }[] = [];
  sentences.forEach((sentence, i) => {
    const seg = segs[i]!;
    const lines = wrap(sentence);
    const chunks: string[][] = [];
    for (let j = 0; j < lines.length; j += maxLines) chunks.push(lines.slice(j, j + maxLines));
    const weights = chunks.map((c) => c.join("").length || 1);
    const total = weights.reduce((a, b) => a + b, 0);
    let t = seg.from;
    chunks.forEach((c, j) => {
      const to = j === chunks.length - 1 ? seg.to : t + Math.round(((seg.to - seg.from) * weights[j]!) / total);
      if (to - t >= REELS_MIN_CLIP_MS) cues.push({ from: t, to, text: c.join("\n") });
      t = to;
    });
  });
  return { cues, warnings };
}
