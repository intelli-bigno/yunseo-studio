"use client";
// 타임라인 탭 — 다중 트랙. 클립 끌기(이동·트랙 옮기기)와 가장자리 끌기(다듬기)는 놓을 때 op(move·trim) 한 개로 보낸다.
// 끄는 동안은 임시 위치(ghost)만 그린다 — 저장·검사는 서버(POST /api/reels/:id/ops)가 한다.
import { useRef, useState } from "react";
import { ReelsTimeline, ReelsToggle, type ReelsPointer, type ReelsTimelineTrack } from "@yunseo/ui/reels";
import type { Editor } from "../_lib/use-editor";
import { clampTrim, clamp, clipEnd, clipLen, fmtTime, fracToMs, moveTarget, projectEnd, snapMs, timelineSpan, trimGhost, type Ghost } from "../_lib/timeline";
import type { Clip, SourceRef } from "../_lib/types";

export interface TimelinePanelProps {
  ed: Editor;
  sources: SourceRef[];
  clipId: string | null;
  trackId: string | null;
  onClip: (id: string | null) => void;
  onTrack: (id: string | null) => void;
  time: number;
  onTime: (ms: number) => void;
  zoom: number;
  marks: { in: number | null; out: number | null };
  playing: boolean;
}

type Drag = { kind: "scrub" } | { kind: "clip"; clip: Clip; handle: "start" | "end" | "body"; grab: number; moved: boolean };
type Pending = { clipId: string; ghost: Ghost; edge?: "start" | "end"; to?: number };

const tickStep = (visible: number) => (visible <= 8000 ? 1000 : visible <= 20_000 ? 2000 : visible <= 60_000 ? 5000 : 15_000);

export function TimelinePanel({ ed, sources, clipId, trackId, onClip, onTrack, time, onTime, zoom, marks, playing }: TimelinePanelProps) {
  const { project, send } = ed;
  const span = timelineSpan(project);
  const end = projectEnd(project);
  const drag = useRef<Drag | null>(null);
  const pending = useRef<Pending | null>(null);
  const [ghost, setGhost] = useState<{ clipId: string; ghost: Ghost } | null>(null);
  const srcById = new Map(sources.map((s) => [s.id, s]));

  const pct = (ms: number) => (ms / span) * 100;
  const step = tickStep(span / zoom);
  const ticks = Array.from({ length: Math.floor(span / step) }, (_, i) => ({ at: pct(i * step), label: fmtTime(i * step).replace(/\.0$/, "") }));

  const label = (c: Clip) => {
    const s = c.sourceId ? srcById.get(c.sourceId) : undefined;
    if (s) return s.label;
    if (c.text) return c.text.value.replace(/\n/g, " ");
    const k = c.component;
    if (k) return k.type === "card" ? "카드" : "assetId" in k ? `${k.type} · ${k.assetId}` : `${k.type} · ${k.text}`;
    return c.id;
  };

  // 위쪽 트랙이 화면 위에 그려지므로 목록은 뒤 트랙부터 보인다
  const rows = [...project.tracks].reverse();
  const tracks: ReelsTimelineTrack[] = rows.map((t) => ({
    id: t.id,
    name: t.name,
    tone: t.kind,
    muted: !!t.muted,
    hidden: !!t.hidden,
    locked: !!t.locked,
    selected: t.id === trackId && !clipId,
    onSelect: () => {
      onClip(null);
      onTrack(t.id);
    },
    actions: (
      <>
        {(t.kind === "video" || t.kind === "audio") && (
          <ReelsToggle label={`${t.name} 음소거`} pressed={!!t.muted} onClick={() => void send({ op: "set_track", trackId: t.id, muted: !t.muted })}>
            음
          </ReelsToggle>
        )}
        {t.kind !== "audio" && (
          <ReelsToggle label={`${t.name} 숨김`} pressed={!!t.hidden} onClick={() => void send({ op: "set_track", trackId: t.id, hidden: !t.hidden })}>
            숨
          </ReelsToggle>
        )}
        <ReelsToggle label={`${t.name} 잠금`} pressed={!!t.locked} onClick={() => void send({ op: "set_track", trackId: t.id, locked: !t.locked })}>
          잠
        </ReelsToggle>
      </>
    ),
    clips: project.clips
      .map((c) => {
        const g = ghost && ghost.clipId === c.id ? ghost.ghost : null;
        return { c, g, track: g ? g.trackId : c.trackId, start: g ? g.start : c.start, len: g ? g.len : clipLen(c) };
      })
      .filter((x) => x.track === t.id)
      .map(({ c, g, start, len }) => ({
        id: c.id,
        left: pct(start),
        width: pct(len),
        label: label(c),
        selected: c.id === clipId,
        ...(g ? { ghost: true } : {}),
        ...(c.keyframes?.length ? { keys: [...new Set(c.keyframes.map((k) => clamp((k.at / Math.max(1, clipLen(c))) * 100, 0, 100)))] } : {}),
        ...(c.transition && c.transition.kind !== "cut" ? { transition: clamp((c.transition.durationMs / Math.max(1, len)) * 100, 0, 100) } : {}),
      })),
  }));

  const tolerance = span / 100 / zoom;
  const finish = () => {
    const d = drag.current;
    const p = pending.current;
    drag.current = null;
    pending.current = null;
    if (!d || d.kind !== "clip" || !d.moved || !p) return setGhost(null);
    const c = d.clip;
    const op =
      d.handle === "body"
        ? p.ghost.start !== c.start || p.ghost.trackId !== c.trackId
          ? ({ op: "move", clipId: c.id, start: p.ghost.start, ...(p.ghost.trackId !== c.trackId ? { trackId: p.ghost.trackId } : {}) } as const)
          : null
        : p.edge && p.to !== undefined && p.to !== (p.edge === "start" ? c.start : clipEnd(c))
          ? ({ op: "trim", clipId: c.id, edge: p.edge, to: p.to } as const)
          : null;
    if (!op) return setGhost(null);
    void send(op).finally(() => setGhost(null));
  };

  const onPointer = (e: ReelsPointer) => {
    const t = fracToMs(e.frac, span);
    if (e.phase === "down") {
      if (e.clip) {
        const c = project.clips.find((x) => x.id === e.clip);
        if (!c) return;
        onClip(c.id);
        onTrack(c.trackId);
        const locked = project.tracks.find((x) => x.id === c.trackId)?.locked;
        drag.current = locked ? null : { kind: "clip", clip: c, handle: e.handle ?? "body", grab: t - c.start, moved: false };
      } else {
        drag.current = { kind: "scrub" };
        if (e.track >= 0) {
          onClip(null);
          onTrack(rows[e.track]?.id ?? null);
        }
        onTime(Math.min(t, Math.max(end, 0)));
      }
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (d.kind === "scrub") {
      onTime(Math.min(t, end));
    } else {
      d.moved = true;
      const c = d.clip;
      const at = (v: number) => (e.shift ? v : snapMs(project, v, tolerance, c.id, [time]));
      if (d.handle === "body") {
        const len = clipLen(c);
        const s = at(t - d.grab);
        const f = at(t - d.grab + len);
        const raw = Math.abs(f - (t - d.grab + len)) < Math.abs(s - (t - d.grab)) ? f - len : s;
        const to = moveTarget(project, c, raw, rows[e.track]?.id);
        if (to) {
          const g = { start: to.start, len, trackId: to.trackId };
          pending.current = { clipId: c.id, ghost: g };
          setGhost({ clipId: c.id, ghost: g });
        }
      } else {
        const to = clampTrim(project, c, d.handle, at(t));
        const g = trimGhost(c, d.handle, to);
        pending.current = { clipId: c.id, ghost: g, edge: d.handle, to };
        setGhost({ clipId: c.id, ghost: g });
      }
    }
    if (e.phase === "up") finish();
  };

  return (
    <ReelsTimeline
      tracks={tracks}
      playhead={pct(time)}
      ticks={ticks}
      zoom={zoom}
      follow={playing}
      marks={{ in: marks.in === null ? null : pct(marks.in), out: marks.out === null ? null : pct(marks.out) }}
      label="릴스 타임라인"
      onPointer={onPointer}
    />
  );
}
