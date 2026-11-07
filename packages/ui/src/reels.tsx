"use client";
// [W3 릴스] 타임라인 편집기 부품 — 9:16 미리보기(ReelsStage)와 다중 트랙 타임라인(ReelsTimeline).
// 편집 규칙·시간 계산은 화면(앱) 쪽이 갖는다. 여기서는 그리기와 포인터 → 비율(0~1) 변환, 미디어 요소 동기화만 한다.
// 위치·폭은 비율(%)로만 넣는다(px 없음). 클라이언트 전용이라 barrel 이 아닌 "@yunseo/ui/reels" 입구로만 연다.
import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cx } from "./poly";

// ── 미리보기 ───────────────────────────────────────────
export interface ReelsLayer {
  key: string;
  kind: "video" | "image" | "audio";
  src: string;
  /** 원본 안 시각(초) */
  time: number;
  muted?: boolean;
}
export interface ReelsOverlay {
  key: string;
  kind: "text" | "subtitle" | "component";
  text: string;
  variant?: "title" | "badge" | "cta";
}

/** 재생 중 이만큼(초) 어긋나면 위치를 다시 맞춘다 */
const DRIFT = 0.25;

function syncMedia(el: HTMLMediaElement, time: number, playing: boolean) {
  if (!playing || Math.abs(el.currentTime - time) > DRIFT) {
    if (Math.abs(el.currentTime - time) > 0.01) el.currentTime = time;
  }
  if (playing && el.paused) void el.play().catch(() => undefined);
  if (!playing && !el.paused) el.pause();
}

export function ReelsStage({
  layers,
  overlays,
  playing,
  label,
  empty,
  onDuration,
}: {
  layers: ReelsLayer[];
  overlays: ReelsOverlay[];
  playing: boolean;
  label: string;
  empty?: ReactNode;
  /** 원본 길이(밀리초)를 알게 됐을 때 */
  onDuration?: (src: string, ms: number) => void;
}) {
  const media = useRef(new Map<string, HTMLMediaElement>());
  useEffect(() => {
    for (const l of layers) {
      const el = media.current.get(l.key);
      if (el) syncMedia(el, l.time, playing);
    }
  });
  const bind = (key: string) => (el: HTMLMediaElement | null) => {
    if (el) media.current.set(key, el);
    else media.current.delete(key);
  };
  const meta = (src: string) => (e: { currentTarget: HTMLMediaElement }) => {
    const d = e.currentTarget.duration;
    if (Number.isFinite(d) && d > 0) onDuration?.(src, Math.round(d * 1000));
  };
  const visual = layers.filter((l) => l.kind !== "audio");
  return (
    <div className="ui-reels-stage" role="img" aria-label={label}>
      {visual.length === 0 && overlays.length === 0 && <span className="ui-reels-empty">{empty}</span>}
      {layers.map((l) =>
        l.kind === "image" ? (
          <img key={l.key} className="ui-reels-media" src={l.src} alt="" />
        ) : l.kind === "video" ? (
          <video key={l.key} ref={bind(l.key)} className="ui-reels-media" src={l.src} muted={l.muted} playsInline preload="auto" onLoadedMetadata={meta(l.src)} />
        ) : (
          <audio key={l.key} ref={bind(l.key)} src={l.src} muted={l.muted} preload="auto" onLoadedMetadata={meta(l.src)} />
        ),
      )}
      {overlays.map((o) => (
        <span key={o.key} className={cx("ui-reels-overlay", `is-${o.kind}`, o.variant && `is-${o.variant}`)}>
          {o.text}
        </span>
      ))}
    </div>
  );
}

// ── 타임라인 ───────────────────────────────────────────
export type ReelsTrackTone = "video" | "text" | "audio" | "subtitle" | "component";
export interface ReelsTimelineClip {
  id: string;
  /** 0~100 */
  left: number;
  width: number;
  label: string;
  selected?: boolean;
}
export interface ReelsTimelineTrack {
  id: string;
  name: string;
  tone: ReelsTrackTone;
  muted?: boolean;
  actions?: ReactNode;
  clips: ReelsTimelineClip[];
}
export interface ReelsPointer {
  phase: "down" | "move" | "up";
  /** 타임라인 가로 위치 0~1 */
  frac: number;
  /** 포인터 아래 트랙 순번(-1 = 눈금자) */
  track: number;
  clip?: string;
  handle?: "start" | "end" | "body";
  shift: boolean;
}

export function ReelsTimeline({
  tracks,
  playhead,
  ticks,
  label,
  onPointer,
}: {
  tracks: ReelsTimelineTrack[];
  /** 0~100 */
  playhead: number;
  ticks: { at: number; label: string }[];
  label: string;
  onPointer: (e: ReelsPointer) => void;
}) {
  const lanes = useRef<HTMLDivElement>(null);
  const target = useRef<Pick<ReelsPointer, "clip" | "handle">>({});

  const locate = (e: ReactPointerEvent): { frac: number; track: number } => {
    const root = lanes.current;
    if (!root) return { frac: 0, track: -1 };
    const rows = [...root.querySelectorAll<HTMLElement>("[data-lane]")];
    const box = (rows[0] ?? root).getBoundingClientRect();
    const frac = box.width > 0 ? Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)) : 0;
    const track = rows.findIndex((r) => {
      const b = r.getBoundingClientRect();
      return e.clientY >= b.top && e.clientY < b.bottom;
    });
    return { frac, track };
  };

  const emit = (phase: ReelsPointer["phase"], e: ReactPointerEvent) => onPointer({ phase, ...locate(e), ...target.current, shift: e.shiftKey });

  return (
    <div
      ref={lanes}
      className="ui-reels-timeline"
      role="group"
      aria-label={label}
      onPointerDown={(e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>("[data-clip],[data-ruler],[data-lane]");
        if (!el || (e.target as HTMLElement).closest("[data-track-head]")) return;
        target.current = el.dataset.clip ? { clip: el.dataset.clip, handle: ((e.target as HTMLElement).dataset.handle as ReelsPointer["handle"]) ?? "body" } : {};
        e.currentTarget.setPointerCapture(e.pointerId);
        emit("down", e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) emit("move", e);
      }}
      onPointerUp={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        emit("up", e);
        target.current = {};
      }}
    >
      <div className="ui-reels-row">
        <span className="ui-reels-head" data-track-head />
        <div className="ui-reels-ruler" data-ruler>
          {ticks.map((t) => (
            <span key={t.at} className="ui-reels-tick" style={{ left: `${t.at}%` }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
      {tracks.map((t) => (
        <div key={t.id} className={cx("ui-reels-row", t.muted && "is-muted")}>
          <span className="ui-reels-head" data-track-head>
            <span className="ui-reels-name">{t.name}</span>
            {t.actions}
          </span>
          <div className={cx("ui-reels-lane", `is-${t.tone}`)} data-lane>
            {t.clips.map((c) => (
              <span key={c.id} className={cx("ui-reels-clip", c.selected && "is-selected")} data-clip={c.id} style={{ left: `${c.left}%`, width: `${c.width}%` }} title={c.label}>
                <span className="ui-reels-handle is-start" data-handle="start" />
                <span className="ui-reels-clip-label">{c.label}</span>
                <span className="ui-reels-handle is-end" data-handle="end" />
              </span>
            ))}
          </div>
        </div>
      ))}
      <div className="ui-reels-row is-overlay" aria-hidden>
        <span className="ui-reels-head" />
        <div className="ui-reels-playzone">
          <span className="ui-reels-playhead" style={{ left: `${playhead}%` }} />
        </div>
      </div>
    </div>
  );
}
