// [릴스 편집기] 타임라인 읽기 계산 — 길이·끝·빈자리·붙이기·드래그 한계. 순수 함수(저장·화면 없음).
// 편집 자체는 여기서 하지 않는다 — 계산 결과를 op 인자로 만들어 POST /api/reels/:id/ops 로 보낼 뿐이다(서버가 같은 규칙으로 다시 검사한다).
import type { Clip, ReelsProjectV2, Track } from "./types";
import { MAX_MS, MIN_CLIP_MS } from "./types";

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const round = (v: number) => Math.round(v);

/** 타임라인 길이 = round((out − in) / speed) */
export const clipLen = (c: Pick<Clip, "in" | "out" | "speed">) => Math.max(1, round((c.out - c.in) / (c.speed || 1)));
export const clipEnd = (c: Pick<Clip, "start" | "in" | "out" | "speed">) => c.start + clipLen(c);

export const sortedClips = (p: ReelsProjectV2, trackId: string, ignore?: string) =>
  p.clips.filter((c) => c.trackId === trackId && c.id !== ignore).sort((a, b) => a.start - b.start);

export const projectEnd = (p: ReelsProjectV2) => p.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
export const trackEndMs = (p: ReelsProjectV2, trackId: string) => sortedClips(p, trackId).reduce((m, c) => Math.max(m, clipEnd(c)), 0);

/** start 이후에 len 이 들어가는 첫 빈자리(전환 겹침은 보지 않는다 — 서버가 최종 판정) */
export function firstFreeStart(p: ReelsProjectV2, trackId: string, start: number, len: number, ignore?: string): number {
  let at = Math.max(0, round(start));
  for (const c of sortedClips(p, trackId, ignore)) {
    if (clipEnd(c) <= at) continue;
    if (c.start >= at + len) break;
    at = clipEnd(c);
  }
  return at;
}

/** 이 트랙이 이 클립을 받을 수 있나(문서 I2) */
export function trackAccepts(track: Track, clip: Pick<Clip, "sourceKind" | "text" | "component">): boolean {
  const kind = clip.component && !clip.sourceKind ? "component" : clip.sourceKind ?? "text";
  switch (track.kind) {
    case "video":
      return kind === "video" || kind === "image";
    case "audio":
      return kind === "audio";
    case "overlay":
      return kind === "component" || kind === "image";
    default:
      return kind === "text";
  }
}

/** 시각 t 에 걸린 클립 — 트랙 배열 순서(아래→위), 전환 겹침이면 한 트랙에 둘 */
export function activeClips(p: ReelsProjectV2, t: number): { track: Track; clip: Clip }[] {
  const out: { track: Track; clip: Clip }[] = [];
  for (const track of p.tracks) for (const clip of sortedClips(p, track.id)) if (clip.start <= t && t < clipEnd(clip)) out.push({ track, clip });
  return out;
}

/** 클립 안 원본 시각(초) — 미디어 요소 currentTime 에 넣는다 */
export const sourceSeconds = (c: Clip, t: number) => (c.in + clamp(t - c.start, 0, clipLen(c)) * c.speed) / 1000;

/** 타임라인에 보일 길이 — 내용보다 조금 길게, 최소 15초 */
export const timelineSpan = (p: ReelsProjectV2) => Math.min(MAX_MS, Math.max(15_000, Math.ceil((projectEnd(p) * 1.25) / 5000) * 5000));

/** 가장 가까운 클립 가장자리·기준점으로 붙이기(거리 tolerance 이내) */
export function snapMs(p: ReelsProjectV2, t: number, tolerance: number, ignore?: string, extra: number[] = []): number {
  let best = t;
  let dist = tolerance;
  const points = [0, ...extra, ...p.clips.filter((c) => c.id !== ignore).flatMap((c) => [c.start, clipEnd(c)])];
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

/** 화면 비율(0~1) → 시각 */
export const fracToMs = (frac: number, span: number) => round(clamp(frac, 0, 1) * span);

const hasLimit = (c: Clip) => c.sourceMs !== undefined && (c.sourceKind === "video" || c.sourceKind === "audio");

/** 다듬기 가장자리를 이웃 클립·원본 길이·최소 길이 안으로 */
export function clampTrim(p: ReelsProjectV2, clip: Clip, edge: "start" | "end", to: number): number {
  const sib = sortedClips(p, clip.trackId, clip.id);
  const end = clipEnd(clip);
  if (edge === "start") {
    const prevEnd = sib.filter((s) => clipEnd(s) <= clip.start).reduce((m, s) => Math.max(m, clipEnd(s)), 0);
    const media = hasLimit(clip) ? clip.start - Math.floor(clip.in / clip.speed) : 0;
    return clamp(round(to), Math.max(prevEnd, media), end - MIN_CLIP_MS);
  }
  const nextStart = sib.filter((s) => s.start >= end).reduce((m, s) => Math.min(m, s.start), MAX_MS);
  const media = hasLimit(clip) ? clip.start + Math.floor(((clip.sourceMs ?? 0) - clip.in) / clip.speed) : MAX_MS;
  return clamp(round(to), clip.start + MIN_CLIP_MS, Math.min(nextStart, media, MAX_MS));
}

/** 드래그 중 화면에 그릴 임시 위치 */
export interface Ghost {
  start: number;
  len: number;
  trackId: string;
}

export function trimGhost(clip: Clip, edge: "start" | "end", to: number): Ghost {
  const end = clipEnd(clip);
  return edge === "start" ? { start: to, len: end - to, trackId: clip.trackId } : { start: clip.start, len: to - clip.start, trackId: clip.trackId };
}

/** 이동 — 받는 트랙이 맞으면 그 트랙, 아니면 제자리 트랙. 겹치면 뒤 빈자리로. 3분을 넘으면 null */
export function moveTarget(p: ReelsProjectV2, clip: Clip, start: number, trackId?: string): { start: number; trackId: string } | null {
  const want = trackId ? p.tracks.find((t) => t.id === trackId) : undefined;
  const target = want && !want.locked && trackAccepts(want, clip) ? want.id : clip.trackId;
  const len = clipLen(clip);
  const at = firstFreeStart(p, target, clamp(round(start), 0, MAX_MS - len), len, clip.id);
  return at + len > MAX_MS ? null : { start: at, trackId: target };
}

/** 분할할 클립 — 고른 클립이 있으면 그것, 없으면 재생 위치에 걸린 잠기지 않은 트랙의 클립들. 가장자리 100ms 안은 뺀다 */
export function splitTargets(p: ReelsProjectV2, selected: Clip | null, t: number): Clip[] {
  const pool = selected ? [selected] : activeClips(p, t).filter((x) => !x.track.locked).map((x) => x.clip);
  return pool.filter((c) => t - c.start >= MIN_CLIP_MS && clipEnd(c) - t >= MIN_CLIP_MS);
}
