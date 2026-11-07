// [릴스 편집기] 미리보기 계산 — 프로젝트 + 시각 t → 그릴 것(ReelsItem[]). 키프레임 보간 · 색감 → CSS filter 근사 · 페이드 · 전환.
// 미리보기는 근사다: 최종 렌더는 서버 합성기(ffmpeg)가 하고, 여기서는 사용자가 결과를 짐작할 만큼만 맞춘다(LUT 는 그리지 않는다).
import type { ReelsBox, ReelsItem } from "@yunseo/ui/reels";
import { activeClips, clamp, clipEnd, clipLen, sortedClips, sourceSeconds } from "./timeline";
import type { Clip, Color, KeyProp, Keyframe, ReelsProjectV2, SourceRef, Track, Transform } from "./types";
import { DEFAULT_AUDIO, DEFAULT_TRANSFORM } from "./types";

// ── 키프레임 ──
const ease = (kind: Keyframe["ease"], p: number) => (kind === "ease-in-out" ? p * p * (3 - 2 * p) : p);

/** 클립 안 시각 local(ms)의 prop 값 — 키프레임이 없으면 fallback */
export function valueAt(keys: Keyframe[] | undefined, prop: KeyProp, local: number, fallback: number): number {
  const ks = (keys ?? []).filter((k) => k.prop === prop).sort((a, b) => a.at - b.at);
  const first = ks[0];
  const last = ks[ks.length - 1];
  if (!first || !last) return fallback;
  if (local <= first.at) return first.value;
  if (local >= last.at) return last.value;
  for (let i = 1; i < ks.length; i += 1) {
    const b = ks[i]!;
    if (local > b.at) continue;
    const a = ks[i - 1]!;
    if (a.ease === "hold") return a.value;
    return a.value + (b.value - a.value) * ease(a.ease, (local - a.at) / Math.max(1, b.at - a.at));
  }
  return last.value;
}

export function transformAt(clip: Clip, t: number): Transform {
  const base = { ...DEFAULT_TRANSFORM, ...clip.transform };
  const local = t - clip.start;
  return {
    cx: valueAt(clip.keyframes, "cx", local, base.cx),
    cy: valueAt(clip.keyframes, "cy", local, base.cy),
    scale: valueAt(clip.keyframes, "scale", local, base.scale),
    rotation: valueAt(clip.keyframes, "rotation", local, base.rotation),
    opacity: clamp(valueAt(clip.keyframes, "opacity", local, base.opacity), 0, 1),
  };
}

// ── 색감 → CSS filter 근사 ──
const num = (v: number) => Math.round(v * 1000) / 1000;

export function colorFilter(color: Color | undefined): string | undefined {
  if (!color) return undefined;
  const parts: string[] = [];
  if (color.brightness) parts.push(`brightness(${num(1 + color.brightness)})`);
  if (color.contrast) parts.push(`contrast(${num(1 + color.contrast)})`);
  if (color.saturation) parts.push(`saturate(${num(Math.max(0, 1 + color.saturation))})`);
  if (color.temperature > 0) parts.push(`sepia(${num(color.temperature * 0.35)}) hue-rotate(${num(-color.temperature * 8)}deg)`);
  else if (color.temperature < 0) parts.push(`hue-rotate(${num(-color.temperature * 18)}deg)`);
  return parts.length ? parts.join(" ") : undefined;
}

// ── 소리 ──
export const dbToGain = (db: number) => (db <= -60 ? 0 : 10 ** (db / 20));

/** 페이드 인·아웃 곱(0~1) */
export function fadeGain(clip: Clip, t: number): number {
  const a = { ...DEFAULT_AUDIO, ...clip.audio };
  const len = clipLen(clip);
  const local = clamp(t - clip.start, 0, len);
  const curve = (p: number) => (a.fadeCurve === "ease" ? p * p * (3 - 2 * p) : p);
  const inG = a.fadeInMs > 0 ? curve(clamp(local / a.fadeInMs, 0, 1)) : 1;
  const outG = a.fadeOutMs > 0 ? curve(clamp((len - local) / a.fadeOutMs, 0, 1)) : 1;
  return inG * outG;
}

/** 미디어 요소 volume(0~1) — 트랙 볼륨 + 클립 볼륨(+키프레임) dB 를 합쳐 게인으로. 0 dB 초과는 요소가 못 키우므로 1 로 자른다 */
export function clipVolume(track: Track, clip: Clip, t: number): number {
  const db = valueAt(clip.keyframes, "volumeDb", t - clip.start, clip.audio?.volumeDb ?? 0) + (track.volumeDb ?? 0);
  return clamp(dbToGain(db) * fadeGain(clip, t), 0, 1);
}

// ── 전환 ──
const SLIDE: Record<string, { x: number; y: number }> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };

/** 이 클립의 전환 때문에 생기는 불투명도 곱·슬라이드 이동(자기 크기 대비 %) — 들어오는 쪽(clip.transition)과 나가는 쪽(다음 클립의 전환) */
export function transitionFx(p: ReelsProjectV2, clip: Clip, t: number): { opacity: number; shift?: { x: number; y: number } } {
  let opacity = 1;
  let shift: { x: number; y: number } | undefined;
  const tr = clip.transition;
  if (tr && tr.kind !== "cut" && tr.durationMs > 0 && t < clip.start + tr.durationMs) {
    const q = clamp((t - clip.start) / tr.durationMs, 0, 1);
    if (tr.kind === "crossfade") opacity *= q;
    else if (tr.kind === "dip") opacity *= q < 0.5 ? 0 : (q - 0.5) * 2;
    else {
      const d = SLIDE[tr.direction ?? "left"]!;
      shift = { x: -d.x * (1 - q) * 100, y: -d.y * (1 - q) * 100 };
    }
  }
  const next = sortedClips(p, clip.trackId).find((c) => c.start > clip.start && c.start <= t && t < clipEnd(clip) && c.transition && c.transition.kind === "dip");
  if (next?.transition) {
    const q = clamp((t - next.start) / Math.max(1, next.transition.durationMs), 0, 1);
    opacity *= q < 0.5 ? 1 - q * 2 : 0;
  }
  return shift ? { opacity, shift } : { opacity };
}

// ── 미리보기 구성 ──
export interface PreviewOptions {
  playing: boolean;
  sources: Map<string, SourceRef>;
  /** 미리보기에서 임시로 덮어쓸 클립(슬라이더 드래그 중) */
  draft?: Map<string, Clip>;
}

const boxOf = (t: Transform): ReelsBox => ({ cx: t.cx, cy: t.cy, scale: t.scale, rotation: t.rotation, opacity: t.opacity });
const TEXT_KINDS = new Set(["title", "badge", "cta"]);

/** 시각 t 에 보일 것들 — 아래 트랙부터 위로 */
export function buildPreview(p: ReelsProjectV2, t: number, o: PreviewOptions): ReelsItem[] {
  const items: ReelsItem[] = [];
  for (const { track, clip: base } of activeClips(p, t)) {
    const clip = o.draft?.get(base.id) ?? base;
    const src = clip.sourceId ? o.sources.get(clip.sourceId) : undefined;
    const fx = transitionFx(p, clip, t);
    if (track.kind === "audio") {
      if (src) items.push({ key: clip.id, type: "media", kind: "audio", src: src.src, time: sourceSeconds(clip, t), muted: !!track.muted || !o.playing, volume: clipVolume(track, clip, t) });
      continue;
    }
    if (track.hidden) continue;
    if (track.kind === "video" || (track.kind === "overlay" && clip.component === undefined)) {
      if (!src) continue;
      const tr = transformAt(clip, t);
      const kind = src.kind === "image" ? "image" : "video";
      const filter = colorFilter(clip.color);
      items.push({
        key: clip.id,
        type: "media",
        kind,
        src: src.src,
        time: sourceSeconds(clip, t),
        muted: !!track.muted || !o.playing,
        volume: clipVolume(track, clip, t),
        fit: track.kind === "overlay" ? "contain" : "cover",
        box: boxOf({ ...tr, opacity: tr.opacity * fx.opacity }),
        ...(filter ? { filter } : {}),
        ...(fx.shift ? { shift: fx.shift } : {}),
      });
      continue;
    }
    if (track.kind === "text" || track.kind === "subtitle") {
      if (!clip.text) continue;
      const tr = transformAt(clip, t);
      items.push({ key: clip.id, type: "text", kind: track.kind, text: clip.text.value, preset: clip.text.style, ...(clip.text.box ? { box: clip.text.box } : {}), opacity: tr.opacity });
      continue;
    }
    const c = clip.component;
    if (!c) continue;
    const tr = transformAt(clip, t);
    const box = boxOf({ ...tr, opacity: tr.opacity * fx.opacity });
    if (TEXT_KINDS.has(c.type) && "text" in c) {
      items.push({ key: clip.id, type: "text", kind: c.type as "title" | "badge" | "cta", text: c.text, opacity: box.opacity });
    } else if (c.type === "card") {
      const s = o.sources.get(c.sourceId);
      if (s) items.push({ key: clip.id, type: "media", kind: "image", src: s.src, time: 0, fit: "contain", box });
    } else if (c.type === "sticker" || c.type === "watermark") {
      items.push({ key: clip.id, type: "tag", label: c.assetId, box: c.type === "watermark" ? watermarkBox(c.corner, box) : box });
    }
  }
  return items;
}

/** 워터마크 모서리 → 중심점(근사: 가로 12%·세로 6% 안쪽) */
export function watermarkBox(corner: "tl" | "tr" | "bl" | "br", base: ReelsBox): ReelsBox {
  const m = 0.12;
  return { ...base, cx: corner.endsWith("l") ? m : 1 - m, cy: corner.startsWith("t") ? m / 2 : 1 - m / 2 };
}
