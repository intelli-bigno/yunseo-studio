"use client";
// [릴스 편집기] 부품 — 9:16 미리보기(ReelsStage) · 다중 트랙 타임라인(ReelsTimeline) · 위 미리보기/아래 유동 패널(ReelsWorkspace) · 슬라이더(ReelsRange).
// 편집 규칙·시간 계산은 화면(앱) 쪽이 갖는다. 여기서는 그리기와 포인터 → 비율(0~1) 변환, 미디어 요소 동기화, 패널 크기 조절만 한다.
// 위치·폭은 비율(%)로만 넣는다(px 없음). 클라이언트 전용이라 barrel 이 아닌 "@yunseo/ui/reels" 입구로만 연다.
import { useEffect, useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cx } from "./poly";

// ── 미리보기 ───────────────────────────────────────────
/** 그림 자리 — 중심점(0~1)·배율(캔버스를 꽉 채운 크기 대비)·회전(도)·불투명도 */
export interface ReelsBox {
  cx: number;
  cy: number;
  scale: number;
  rotation: number;
  opacity: number;
}

export type ReelsItem =
  | {
      key: string;
      type: "media";
      kind: "video" | "image" | "audio";
      src: string;
      /** 원본 안 시각(초) */
      time: number;
      muted?: boolean;
      /** 0~1 */
      volume?: number;
      fit?: "cover" | "contain";
      box?: ReelsBox;
      /** CSS filter 근사(색감) */
      filter?: string;
      /** 전환 슬라이드 이동(자기 크기 대비 %) */
      shift?: { x: number; y: number };
    }
  | { key: string; type: "text"; kind: "text" | "subtitle" | "title" | "badge" | "cta"; text: string; preset?: string; box?: { cx: number; cy: number; w: number }; opacity?: number }
  | { key: string; type: "tag"; label: string; box?: ReelsBox };

/** 재생 중 이만큼(초) 어긋나면 위치를 다시 맞춘다 */
const DRIFT = 0.25;

function syncMedia(el: HTMLMediaElement, time: number, playing: boolean, volume: number) {
  if (!playing || Math.abs(el.currentTime - time) > DRIFT) {
    if (Math.abs(el.currentTime - time) > 0.01) el.currentTime = time;
  }
  if (Math.abs(el.volume - volume) > 0.001) el.volume = volume;
  if (playing && el.paused) void el.play().catch(() => undefined);
  if (!playing && !el.paused) el.pause();
}

function boxStyle(b: ReelsBox, shift?: { x: number; y: number }): CSSProperties {
  const move = shift ? `translate(${shift.x}%, ${shift.y}%) ` : "";
  return { left: `${b.cx * 100}%`, top: `${b.cy * 100}%`, opacity: b.opacity, transform: `${move}translate(-50%, -50%) scale(${b.scale}) rotate(${b.rotation}deg)` };
}

export function ReelsStage({
  items,
  playing,
  label,
  empty,
  onDuration,
}: {
  /** 아래→위 순서(뒤가 위) */
  items: ReelsItem[];
  playing: boolean;
  label: string;
  empty?: ReactNode;
  /** 원본 길이(밀리초)를 알게 됐을 때 */
  onDuration?: (src: string, ms: number) => void;
}) {
  const media = useRef(new Map<string, { el: HTMLMediaElement; item: Extract<ReelsItem, { type: "media" }> }>());
  useEffect(() => {
    for (const { el, item } of media.current.values()) syncMedia(el, item.time, playing, item.volume ?? 1);
  });
  const bind = (item: Extract<ReelsItem, { type: "media" }>) => (el: HTMLMediaElement | null) => {
    if (el) media.current.set(item.key, { el, item });
    else media.current.delete(item.key);
  };
  const meta = (src: string) => (e: { currentTarget: HTMLMediaElement }) => {
    const d = e.currentTarget.duration;
    if (Number.isFinite(d) && d > 0) onDuration?.(src, Math.round(d * 1000));
  };
  const visible = items.some((i) => i.type !== "media" || i.kind !== "audio");
  return (
    <div className="ui-reels-stage" role="img" aria-label={label}>
      {!visible && <span className="ui-reels-empty">{empty}</span>}
      {items.map((i) => {
        if (i.type === "text") {
          const pos: CSSProperties | undefined = i.box
            ? { left: `${i.box.cx * 100}%`, top: `${i.box.cy * 100}%`, width: `${i.box.w * 100}%`, right: "auto", bottom: "auto", transform: "translate(-50%, -50%)" }
            : undefined;
          return (
            <span key={i.key} className={cx("ui-reels-overlay", `is-${i.kind}`, i.preset && `is-style-${i.preset}`)} style={{ ...pos, ...(i.opacity !== undefined ? { opacity: i.opacity } : {}) }}>
              {i.text}
            </span>
          );
        }
        if (i.type === "tag") {
          return (
            <span key={i.key} className="ui-reels-tag" style={i.box ? boxStyle(i.box) : undefined}>
              {i.label}
            </span>
          );
        }
        const style: CSSProperties = { ...(i.box ? boxStyle(i.box, i.shift) : i.shift ? { transform: `translate(${i.shift.x}%, ${i.shift.y}%)` } : {}), ...(i.filter ? { filter: i.filter } : {}) };
        if (i.kind === "image") return <img key={i.key} className={cx("ui-reels-media", i.fit === "contain" && "is-contain")} src={i.src} alt="" style={style} />;
        if (i.kind === "video") {
          return <video key={i.key} ref={bind(i)} className={cx("ui-reels-media", i.fit === "contain" && "is-contain")} src={i.src} muted={i.muted} playsInline preload="auto" onLoadedMetadata={meta(i.src)} style={style} />;
        }
        return <audio key={i.key} ref={bind(i)} src={i.src} muted={i.muted} preload="auto" onLoadedMetadata={meta(i.src)} />;
      })}
    </div>
  );
}

// ── 타임라인 ───────────────────────────────────────────
export type ReelsTrackTone = "video" | "text" | "audio" | "subtitle" | "overlay";
export interface ReelsTimelineClip {
  id: string;
  /** 0~100 */
  left: number;
  width: number;
  label: string;
  selected?: boolean;
  /** 키프레임 자리 — 클립 안 0~100 */
  keys?: number[];
  /** 이 클립 앞 전환 길이 — 클립 폭 대비 0~100 (없으면 컷) */
  transition?: number;
  /** 드래그 중 임시 위치 */
  ghost?: boolean;
}
export interface ReelsTimelineTrack {
  id: string;
  name: string;
  tone: ReelsTrackTone;
  muted?: boolean;
  hidden?: boolean;
  locked?: boolean;
  selected?: boolean;
  actions?: ReactNode;
  onSelect?: () => void;
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
  zoom,
  marks,
  follow,
  label,
  onPointer,
}: {
  tracks: ReelsTimelineTrack[];
  /** 0~100 */
  playhead: number;
  ticks: { at: number; label: string }[];
  /** 1 = 패널 폭에 맞춤, 클수록 가로로 늘어난다 */
  zoom: number;
  /** 구간 표시 — 0~100 */
  marks?: { in: number | null; out: number | null };
  /** true 면 재생 위치가 보이게 스크롤을 따라간다 */
  follow?: boolean;
  label: string;
  onPointer: (e: ReelsPointer) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const lanes = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLSpanElement>(null);
  const target = useRef<Pick<ReelsPointer, "clip" | "handle">>({});

  useEffect(() => {
    const box = scroller.current;
    const line = lanes.current?.querySelector<HTMLElement>("[data-playhead]");
    if (!follow || zoom <= 1 || !box || !line) return;
    const view = box.getBoundingClientRect();
    const x = line.getBoundingClientRect().left;
    const pad = head.current?.getBoundingClientRect().width ?? 0;
    if (x < view.left + pad) box.scrollLeft -= view.left + pad - x;
    else if (x > view.right) box.scrollLeft += x - view.right + pad;
  }, [playhead, zoom, follow]);

  const locate = (e: ReactPointerEvent): { frac: number; track: number } => {
    const root = lanes.current;
    if (!root) return { frac: 0, track: -1 };
    const rows = [...root.querySelectorAll<HTMLElement>("[data-lane]")];
    const ruler = root.querySelector<HTMLElement>("[data-ruler]");
    const box = (rows[0] ?? ruler ?? root).getBoundingClientRect();
    const frac = box.width > 0 ? Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)) : 0;
    const track = rows.findIndex((r) => {
      const b = r.getBoundingClientRect();
      return e.clientY >= b.top && e.clientY < b.bottom;
    });
    return { frac, track };
  };

  const emit = (phase: ReelsPointer["phase"], e: ReactPointerEvent) => onPointer({ phase, ...locate(e), ...target.current, shift: e.shiftKey });

  return (
    <div ref={scroller} className="ui-reels-scroll">
      <div
        ref={lanes}
        className="ui-reels-timeline"
        role="group"
        aria-label={label}
        style={{ width: `${Math.max(1, zoom) * 100}%` }}
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
        <div className="ui-reels-row is-ruler">
          <span ref={head} className="ui-reels-head" data-track-head />
          <div className="ui-reels-ruler" data-ruler>
            {ticks.map((t) => (
              <span key={t.at} className="ui-reels-tick" style={{ left: `${t.at}%` }}>
                {t.label}
              </span>
            ))}
            {marks?.in != null && <span className="ui-reels-mark is-in" style={{ left: `${marks.in}%` }} />}
            {marks?.out != null && <span className="ui-reels-mark is-out" style={{ left: `${marks.out}%` }} />}
          </div>
        </div>
        {tracks.map((t) => (
          <div key={t.id} className={cx("ui-reels-row", t.muted && "is-muted", t.hidden && "is-hidden", t.locked && "is-locked", t.selected && "is-selected")}>
            <span className="ui-reels-head" data-track-head onClick={t.onSelect}>
              <span className="ui-reels-name">{t.name}</span>
              {t.actions}
            </span>
            <div className={cx("ui-reels-lane", `is-${t.tone}`)} data-lane>
              {t.clips.map((c) => (
                <span
                  key={c.id}
                  className={cx("ui-reels-clip", c.selected && "is-selected", c.ghost && "is-ghost")}
                  data-clip={c.id}
                  style={{ left: `${c.left}%`, width: `${c.width}%` }}
                  title={c.label}
                >
                  <span className="ui-reels-handle is-start" data-handle="start" />
                  {c.transition ? <span className="ui-reels-trans" style={{ width: `${c.transition}%` }} /> : null}
                  <span className="ui-reels-clip-label">{c.label}</span>
                  {c.keys?.map((k) => <span key={k} className="ui-reels-key" style={{ left: `${k}%` }} />)}
                  <span className="ui-reels-handle is-end" data-handle="end" />
                </span>
              ))}
            </div>
          </div>
        ))}
        <div className="ui-reels-row is-overlay" aria-hidden>
          <span className="ui-reels-head" />
          <div className="ui-reels-playzone">
            {marks?.in != null && marks.out != null && <span className="ui-reels-range" style={{ left: `${Math.min(marks.in, marks.out)}%`, width: `${Math.abs(marks.out - marks.in)}%` }} />}
            <span className="ui-reels-playhead" data-playhead style={{ left: `${playhead}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 작업 공간 — 위 미리보기 · 가운데 도구줄 · 아래 유동 패널 ─────────────────────
const DOCK_MIN = 0.16;
const DOCK_MAX = 0.8;
const DOCK_STEP = 0.04;
const clampDock = (v: number) => Math.min(DOCK_MAX, Math.max(DOCK_MIN, v));

export function ReelsWorkspace({
  top,
  stage,
  tools,
  tabs,
  dockActions,
  children,
  height,
  onHeight,
  collapsed,
  onCollapsed,
  label,
}: {
  top: ReactNode;
  stage: ReactNode;
  tools: ReactNode;
  tabs: ReactNode;
  dockActions?: ReactNode;
  children: ReactNode;
  /** 패널 높이 — 작업 공간 높이 대비 0.16~0.8 */
  height: number;
  onHeight: (v: number) => void;
  collapsed: boolean;
  onCollapsed: (v: boolean) => void;
  label: string;
}) {
  const ws = useRef<HTMLDivElement>(null);
  const resize = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = ws.current?.getBoundingClientRect();
    if (!box || box.height <= 0 || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    if (collapsed) onCollapsed(false);
    onHeight(clampDock((box.bottom - e.clientY) / box.height));
  };
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowUp") onHeight(clampDock(height + DOCK_STEP));
    else if (e.key === "ArrowDown") onHeight(clampDock(height - DOCK_STEP));
    else if (e.key === "Enter") onCollapsed(!collapsed);
    else return;
    e.preventDefault();
  };
  return (
    <div ref={ws} className="ui-reels-ws" data-collapsed={collapsed ? "" : undefined} style={{ gridTemplateRows: `auto minmax(0, 1fr) auto ${collapsed ? "auto" : `${clampDock(height) * 100}%`}` }}>
      <div className="ui-reels-top">{top}</div>
      <div className="ui-reels-preview">{stage}</div>
      <div className="ui-reels-tools">{tools}</div>
      <section className="ui-reels-dock" aria-label={label}>
        <div
          className="ui-reels-grip"
          role="separator"
          aria-orientation="horizontal"
          aria-label="패널 크기"
          aria-valuemin={Math.round(DOCK_MIN * 100)}
          aria-valuemax={Math.round(DOCK_MAX * 100)}
          aria-valuenow={Math.round(height * 100)}
          tabIndex={0}
          onKeyDown={onKey}
          onDoubleClick={() => onCollapsed(!collapsed)}
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={resize}
          onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
        />
        <div className="ui-reels-dock-bar">
          <div className="ui-reels-dock-tabs">{tabs}</div>
          <div className="ui-reels-dock-actions">
            {dockActions}
            <button type="button" className="ui-reels-fold" aria-expanded={!collapsed} aria-label={collapsed ? "패널 펴기" : "패널 접기"} onClick={() => onCollapsed(!collapsed)}>
              {collapsed ? "▴" : "▾"}
            </button>
          </div>
        </div>
        {!collapsed && <div className="ui-reels-dock-body">{children}</div>}
      </section>
    </div>
  );
}

// ── 슬라이더 — 움직이는 동안은 onChange(미리보기), 놓을 때 한 번 onCommit(op) ─────────────
export function ReelsRange({
  label,
  value,
  min,
  max,
  step,
  display,
  disabled,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const dirty = useRef(false);
  const commit = (v: number) => {
    if (!dirty.current) return;
    dirty.current = false;
    onCommit(v);
  };
  return (
    <label className="ui-field">
      <span className="ui-range-head">
        <span className="ui-t-label ui-tone-mute">{label}</span>
        <span className="ui-t-label ui-mono">{display ?? value}</span>
      </span>
      <input
        className="ui-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          dirty.current = true;
          onChange(Number(e.target.value));
        }}
        onPointerUp={(e) => commit(Number(e.currentTarget.value))}
        onKeyUp={(e) => commit(Number(e.currentTarget.value))}
        onBlur={(e) => commit(Number(e.currentTarget.value))}
      />
    </label>
  );
}

// ── 패널 안 묶음 · 작은 토글 ─────────────────────────────────
/** 패널 안 칸 묶음 — 폭이 되는 만큼 여러 열로 나란히 선다 */
export function ReelsGroups({ children }: { children: ReactNode }) {
  return <div className="ui-reels-groups">{children}</div>;
}

export function ReelsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ui-reels-group">
      <h3 className="ui-t-label ui-tone-mute ui-heading ui-reels-group-title">{title}</h3>
      {children}
    </section>
  );
}

/** 트랙 머리의 작은 켬/끔 버튼(음소거·숨김·잠금) — 글자는 한 글자 */
export function ReelsToggle({ label, pressed, disabled, onClick, children }: { label: string; pressed?: boolean; disabled?: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      className="ui-reels-toggle"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
