// [릴스 편집기] 읽은 프로젝트를 v2 로 맞춘다 — 엔진이 읽을 때 v1→v2 변환을 넣기 전(문서 §6)에도 화면이 열리게 하는 방어 층.
// 서버가 이미 v2 를 주면 그대로 통과한다. 표시용 변환일 뿐 저장하지 않는다(저장은 ops 만).
import type { Clip, Component, ReelsProjectV2, Track, TrackKind } from "./types";
import { DEFAULT_TEXT_MS } from "./types";

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);

const V1_KIND: Record<string, TrackKind> = { video: "video", text: "text", audio: "audio", subtitle: "subtitle", component: "overlay", overlay: "overlay" };

function track(t: Raw): Track {
  const kind = V1_KIND[str(t.kind)] ?? "video";
  return {
    id: str(t.id),
    kind,
    name: str(t.name, kind),
    ...(t.muted === true ? { muted: true } : {}),
    ...(t.hidden === true ? { hidden: true } : {}),
    ...(t.locked === true ? { locked: true } : {}),
    ...(typeof t.volumeDb === "number" ? { volumeDb: t.volumeDb } : {}),
  };
}

function clipV1(c: Raw, kind: TrackKind | undefined): Clip {
  const duration = num(c.duration, DEFAULT_TEXT_MS);
  const offset = num(c.offset, 0);
  const text = typeof c.text === "string" ? c.text : undefined;
  const base: Clip = { id: str(c.id), trackId: str(c.trackId), start: num(c.start, 0), in: offset, out: offset + duration, speed: 1 };
  if (typeof c.sourceId === "string") base.sourceId = c.sourceId;
  if (c.sourceKind === "video" || c.sourceKind === "image" || c.sourceKind === "audio") base.sourceKind = c.sourceKind;
  if (typeof c.sourceMs === "number") base.sourceMs = c.sourceMs;
  if (typeof c.component === "string") {
    base.component = { type: c.component as "title" | "badge" | "cta", text: text ?? "" } as Component;
  } else if (text !== undefined) {
    base.text = { value: text, style: kind === "subtitle" ? "subtitle-default" : "text-default" };
    base.in = 0;
    base.out = duration;
  }
  return base;
}

/** 모양이 v1·v2 어느 쪽이든 v2 로. 알아볼 수 없으면 null */
export function toV2(raw: unknown): ReelsProjectV2 | null {
  if (!isObj(raw) || !Array.isArray(raw.tracks) || !Array.isArray(raw.clips)) return null;
  const tracks = (raw.tracks as unknown[]).filter(isObj).map(track);
  const kinds = new Map(tracks.map((t) => [t.id, t.kind]));
  const v2 = raw.version === 2;
  const clips = (raw.clips as unknown[]).filter(isObj).map((c) => (v2 ? ({ speed: 1, ...c } as unknown as Clip) : clipV1(c, kinds.get(str(c.trackId)))));
  return { version: 2, title: str(raw.title, "새 릴스"), canvas: { width: 1080, height: 1920, fps: 30 }, tracks, clips };
}
