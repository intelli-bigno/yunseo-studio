// [W3 릴스] 타임라인 편집 모델 — 트랙·클립과 편집 연산(추가·자르기·다듬기·이동·삭제), 재생 위치 계산.
// 순수 함수만 둔다(화면·저장 없음). 시간은 전부 밀리초 정수. 모든 연산은 새 프로젝트를 돌려준다(원본 불변).
// 규칙: 한 트랙 안에서 클립은 겹치지 않는다 — 겹치는 자리로 옮기면 그 뒤 첫 빈자리로 밀린다.

export const REELS_TRACK_KINDS = ["video", "text", "audio", "subtitle", "component"] as const;
export type ReelsTrackKind = (typeof REELS_TRACK_KINDS)[number];
export const REELS_COMPONENTS = ["title", "badge", "cta"] as const;
export type ReelsComponent = (typeof REELS_COMPONENTS)[number];

/** 클립 최소 길이 */
export const REELS_MIN_CLIP_MS = 100;
/** 프로젝트 최대 길이(릴스 상한 3분) */
export const REELS_MAX_MS = 180_000;
export const REELS_DEFAULT_MS = { video: 5000, image: 3000, audio: 5000, text: 3000 } as const;

export type ReelsSourceKind = "video" | "image" | "audio";
/** 편집에 쓰는 자산(기존 쇼츠·생성 카드) — 서버가 목록을 준다 */
export interface ReelsSource {
  id: string;
  kind: ReelsSourceKind;
  label: string;
  src: string;
  poster?: string;
  /** 알면 넣는다(재생 메타데이터로 채워질 수도 있다). 이미지는 없음 */
  durationMs?: number;
}

export interface ReelsTrack {
  id: string;
  kind: ReelsTrackKind;
  name: string;
  muted?: boolean;
}

export interface ReelsClip {
  id: string;
  trackId: string;
  /** 타임라인 시작 */
  start: number;
  duration: number;
  /** 원본 안 시작점(영상·음성 자르기) */
  offset: number;
  sourceId?: string;
  /** 영상 트랙 클립이 쓰는 원본 종류(이미지는 길이 제한 없음) */
  sourceKind?: ReelsSourceKind;
  /** 원본 길이 — 다듬기 상한 */
  sourceMs?: number;
  text?: string;
  component?: ReelsComponent;
}

export interface ReelsProject {
  version: 1;
  title: string;
  tracks: ReelsTrack[];
  clips: ReelsClip[];
}

const KIND_NAMES: Record<ReelsTrackKind, string> = { video: "영상", text: "텍스트", audio: "음성", subtitle: "자막", component: "컴포넌트" };

export const end = (c: Pick<ReelsClip, "start" | "duration">) => c.start + c.duration;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v);

export function emptyProject(title = "새 릴스"): ReelsProject {
  return {
    version: 1,
    title,
    tracks: [
      { id: "t-video", kind: "video", name: "영상 1" },
      { id: "t-text", kind: "text", name: "텍스트 1" },
      { id: "t-audio", kind: "audio", name: "음성 1" },
      { id: "t-subtitle", kind: "subtitle", name: "자막 1" },
    ],
    clips: [],
  };
}

export function addTrack(p: ReelsProject, kind: ReelsTrackKind, id: string): ReelsProject {
  const n = p.tracks.filter((t) => t.kind === kind).length + 1;
  return { ...p, tracks: [...p.tracks, { id, kind, name: `${KIND_NAMES[kind]} ${n}` }] };
}

export function removeTrack(p: ReelsProject, trackId: string): ReelsProject {
  return { ...p, tracks: p.tracks.filter((t) => t.id !== trackId), clips: p.clips.filter((c) => c.trackId !== trackId) };
}

export function toggleMute(p: ReelsProject, trackId: string): ReelsProject {
  return { ...p, tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)) };
}

/** 이 트랙에 이 원본을 놓을 수 있나 — 영상 트랙은 영상·이미지, 음성 트랙은 음성·영상(소리만) */
export function accepts(kind: ReelsTrackKind, source: ReelsSourceKind | "text" | "component"): boolean {
  if (kind === "video") return source === "video" || source === "image";
  if (kind === "audio") return source === "audio" || source === "video";
  if (kind === "component") return source === "component";
  return source === "text";
}

const trackClips = (p: ReelsProject, trackId: string, ignore?: string) =>
  p.clips.filter((c) => c.trackId === trackId && c.id !== ignore).sort((a, b) => a.start - b.start);

/** start 이후에 duration 이 들어가는 첫 빈자리(겹치지 않게) */
export function firstFreeStart(p: ReelsProject, trackId: string, start: number, duration: number, ignore?: string): number {
  let at = Math.max(0, round(start));
  for (const c of trackClips(p, trackId, ignore)) {
    if (end(c) <= at) continue;
    if (c.start >= at + duration) break;
    at = end(c);
  }
  return at;
}

/** 트랙 끝(마지막 클립 끝) */
export const trackEnd = (p: ReelsProject, trackId: string) => trackClips(p, trackId).reduce((m, c) => Math.max(m, end(c)), 0);

export function projectDuration(p: ReelsProject): number {
  return p.clips.reduce((m, c) => Math.max(m, end(c)), 0);
}

export type NewClip = Omit<ReelsClip, "start" | "offset" | "trackId"> & { start?: number; offset?: number };

/** 클립 추가 — start 를 안 주면 트랙 끝에 붙인다. 겹치면 뒤 빈자리로 */
export function addClip(p: ReelsProject, trackId: string, clip: NewClip): ReelsProject {
  const track = p.tracks.find((t) => t.id === trackId);
  if (!track) throw new Error(`트랙이 없다: ${trackId}`);
  const kind = clip.component ? "component" : clip.sourceKind ?? "text";
  if (!accepts(track.kind, kind)) throw new Error(`${KIND_NAMES[track.kind]} 트랙에 놓을 수 없다`);
  const duration = Math.max(REELS_MIN_CLIP_MS, round(clip.duration));
  const start = firstFreeStart(p, trackId, clip.start ?? trackEnd(p, trackId), duration);
  return { ...p, clips: [...p.clips, { ...clip, trackId, start, duration, offset: clip.offset ?? 0 }] };
}

export function removeClip(p: ReelsProject, clipId: string): ReelsProject {
  return { ...p, clips: p.clips.filter((c) => c.id !== clipId) };
}

export function updateClip(p: ReelsProject, clipId: string, patch: Partial<Pick<ReelsClip, "text" | "component">>): ReelsProject {
  return { ...p, clips: p.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) };
}

/** 이동 — 다른 트랙으로 옮기면 그 트랙이 받아야 한다(아니면 그대로). 겹치면 뒤 빈자리로 */
export function moveClip(p: ReelsProject, clipId: string, start: number, trackId?: string): ReelsProject {
  const c = p.clips.find((x) => x.id === clipId);
  if (!c) return p;
  let target = trackId ?? c.trackId;
  const track = p.tracks.find((t) => t.id === target);
  const kind = c.component ? "component" : c.sourceKind ?? "text";
  if (!track || !accepts(track.kind, kind)) target = c.trackId;
  const at = firstFreeStart(p, target, clamp(start, 0, REELS_MAX_MS - c.duration), c.duration, c.id);
  return { ...p, clips: p.clips.map((x) => (x.id === clipId ? { ...x, trackId: target, start: at } : x)) };
}

/** 자르기 — at 에서 둘로 나눈다. 양쪽이 최소 길이보다 짧아지면 그대로 */
export function splitClip(p: ReelsProject, clipId: string, at: number, newId: string): ReelsProject {
  const c = p.clips.find((x) => x.id === clipId);
  if (!c) return p;
  const cut = round(at);
  if (cut - c.start < REELS_MIN_CLIP_MS || end(c) - cut < REELS_MIN_CLIP_MS) return p;
  const left: ReelsClip = { ...c, duration: cut - c.start };
  const right: ReelsClip = { ...c, id: newId, start: cut, duration: end(c) - cut, offset: c.offset + (cut - c.start) };
  return { ...p, clips: p.clips.flatMap((x) => (x.id === clipId ? [left, right] : [x])) };
}

/** 원본 길이 상한이 있는 클립인가(영상·음성) */
const bounded = (c: ReelsClip) => c.sourceMs !== undefined && c.sourceKind !== "image";

/** 다듬기 — 시작 또는 끝 가장자리를 t 로 옮긴다. 이웃 클립·원본 길이·최소 길이에서 멈춘다 */
export function trimClip(p: ReelsProject, clipId: string, edge: "start" | "end", t: number): ReelsProject {
  const c = p.clips.find((x) => x.id === clipId);
  if (!c) return p;
  const siblings = trackClips(p, c.trackId, c.id);
  const prevEnd = siblings.filter((s) => end(s) <= c.start).reduce((m, s) => Math.max(m, end(s)), 0);
  const nextStart = siblings.filter((s) => s.start >= end(c)).reduce((m, s) => Math.min(m, s.start), REELS_MAX_MS);
  let next: ReelsClip;
  if (edge === "start") {
    // 원본 앞쪽은 offset 만큼만 되살릴 수 있다(이미지·글자는 제한 없음)
    const media = c.sourceKind === "video" || c.sourceKind === "audio";
    const lo = Math.max(prevEnd, media ? c.start - c.offset : 0);
    const s = clamp(round(t), lo, end(c) - REELS_MIN_CLIP_MS);
    next = { ...c, start: s, duration: end(c) - s, offset: Math.max(0, c.offset + (s - c.start)) };
  } else {
    const hi = Math.min(nextStart, bounded(c) ? c.start + (c.sourceMs! - c.offset) : REELS_MAX_MS);
    const e = clamp(round(t), c.start + REELS_MIN_CLIP_MS, hi);
    next = { ...c, duration: e - c.start };
  }
  return { ...p, clips: p.clips.map((x) => (x.id === clipId ? next : x)) };
}

/** 원본 길이를 알게 됐을 때(재생 메타데이터) — 그 원본을 쓰는 클립에 상한을 적고 넘친 길이는 줄인다 */
export function applySourceDuration(p: ReelsProject, sourceId: string, ms: number): ReelsProject {
  const total = round(ms);
  if (!(total > 0)) return p;
  let changed = false;
  const clips = p.clips.map((c) => {
    if (c.sourceId !== sourceId || c.sourceKind === "image" || c.sourceMs === total) return c;
    changed = true;
    const duration = clamp(c.duration, REELS_MIN_CLIP_MS, Math.max(REELS_MIN_CLIP_MS, total - c.offset));
    return { ...c, sourceMs: total, duration };
  });
  return changed ? { ...p, clips } : p;
}

/** 재생 위치 t 에 걸린 클립 — 트랙 순서대로, 트랙마다 하나 */
export function activeAt(p: ReelsProject, t: number): { track: ReelsTrack; clip: ReelsClip }[] {
  const out: { track: ReelsTrack; clip: ReelsClip }[] = [];
  for (const track of p.tracks) {
    const clip = p.clips.find((c) => c.trackId === track.id && c.start <= t && t < end(c));
    if (clip) out.push({ track, clip });
  }
  return out;
}

/** 클립 안 원본 시각(초) — 미디어 요소 currentTime 에 넣는다 */
export const sourceSeconds = (c: ReelsClip, t: number) => (c.offset + clamp(t - c.start, 0, c.duration)) / 1000;

/** 화면 비율(0~1) → 시각. 타임라인 보이는 길이(span) 기준 */
export const fracToMs = (frac: number, span: number) => round(clamp(frac, 0, 1) * span);

/** 타임라인에 보일 길이 — 내용보다 조금 길게, 최소 15초 */
export const timelineSpan = (p: ReelsProject) => Math.min(REELS_MAX_MS, Math.max(15_000, Math.ceil((projectDuration(p) * 1.25) / 5000) * 5000));

/** 가장 가까운 클립 가장자리·재생 위치로 붙이기(거리 tolerance 이내) */
export function snap(p: ReelsProject, t: number, tolerance: number, ignore?: string, extra: number[] = []): number {
  let best = t;
  let dist = tolerance;
  const points = [0, ...extra, ...p.clips.filter((c) => c.id !== ignore).flatMap((c) => [c.start, end(c)])];
  for (const q of points) {
    const d = Math.abs(q - t);
    if (d <= dist) {
      dist = d;
      best = q;
    }
  }
  return best;
}

/** 분:초.십분의일 */
export function fmtTime(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

// ── 저장 형식 검사(API 입력) ────────────────────────────────
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, lo = 0, hi = REELS_MAX_MS) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const isStr = (v: unknown, max = 200) => typeof v === "string" && v.length <= max;

/** 들어온 JSON 이 프로젝트 모양인지 — 문제 목록(비면 통과) */
export function projectIssues(v: unknown): string[] {
  if (!isObj(v)) return ["프로젝트가 객체가 아니다"];
  const issues: string[] = [];
  if (v.version !== 1) issues.push("version 은 1");
  if (!isStr(v.title, 80) || !(v.title as string).trim()) issues.push("title 은 1~80자");
  if (!Array.isArray(v.tracks) || v.tracks.length > 40) issues.push("tracks 는 40개 이하 배열");
  if (!Array.isArray(v.clips) || v.clips.length > 2000) issues.push("clips 는 2000개 이하 배열");
  if (issues.length) return issues;
  const trackIds = new Set<string>();
  for (const [i, t] of (v.tracks as unknown[]).entries()) {
    if (!isObj(t) || !isStr(t.id, 64) || !REELS_TRACK_KINDS.includes(t.kind as ReelsTrackKind) || !isStr(t.name, 40)) issues.push(`tracks[${i}] 모양이 틀렸다`);
    else if (trackIds.has(t.id as string)) issues.push(`tracks[${i}] id 중복`);
    else trackIds.add(t.id as string);
  }
  const clipIds = new Set<string>();
  for (const [i, c] of (v.clips as unknown[]).entries()) {
    if (!isObj(c) || !isStr(c.id, 64) || !isStr(c.trackId, 64) || !isInt(c.start) || !isInt(c.duration, REELS_MIN_CLIP_MS) || !isInt(c.offset, 0, 3_600_000)) {
      issues.push(`clips[${i}] 모양이 틀렸다`);
      continue;
    }
    if (!trackIds.has(c.trackId as string)) issues.push(`clips[${i}] 트랙이 없다`);
    if (clipIds.has(c.id as string)) issues.push(`clips[${i}] id 중복`);
    clipIds.add(c.id as string);
    if ((c.start as number) + (c.duration as number) > REELS_MAX_MS) issues.push(`clips[${i}] 3분을 넘는다`);
    if (c.text !== undefined && !isStr(c.text, 500)) issues.push(`clips[${i}] text 는 500자 이하`);
    if (c.sourceId !== undefined && !isStr(c.sourceId, 200)) issues.push(`clips[${i}] sourceId 모양`);
    if (c.component !== undefined && !REELS_COMPONENTS.includes(c.component as ReelsComponent)) issues.push(`clips[${i}] component 종류`);
  }
  return issues;
}

/** 트랙 안 겹침 — 편집 연산은 만들지 않지만 저장 전 한 번 더 본다 */
export function overlaps(p: ReelsProject): string[] {
  const out: string[] = [];
  for (const t of p.tracks) {
    const cs = trackClips(p, t.id);
    for (let i = 1; i < cs.length; i += 1) if (cs[i]!.start < end(cs[i - 1]!)) out.push(`${t.name}: ${cs[i - 1]!.id}·${cs[i]!.id} 겹침`);
  }
  return out;
}
