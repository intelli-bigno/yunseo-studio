// [cards] 카드 편집기 부품 — 덱 줄·캔버스·레이어·핸들·자산 칸·레이어 패널.
// 위치·크기는 카드 원본 픽셀을 받아 %(그리고 글자는 컨테이너 폭 단위 cqw)로 그린다 — 화면 폭이 달라도 같은 비율.
// 화면(dashboard)은 style 을 못 쓰므로 계산된 기하 값은 여기서만 style 로 넣는다. 꾸밈(색·간격·선)은 styles.css 토큰만.
import type { DragEvent, PointerEvent, ReactNode } from "react";
import { cx } from "./poly";

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

/**
 * 편집기 세 칸 — 왼쪽 패널(스티커) · 가운데(캔버스 + 아래 가로 장 목록) · 오른쪽 패널(자산 + 속성).
 * 양쪽 패널은 접을 수 있고(접으면 얇은 띠만 남는다), 화면 높이에 붙어 따로 스크롤된다. 좁으면 위아래로 쌓인다.
 */
export function EditorLayout({ left, stage, strip, right, leftOpen, rightOpen, onToggleLeft, onToggleRight, leftLabel, rightLabel }: {
  left: ReactNode;
  stage: ReactNode;
  strip: ReactNode;
  right: ReactNode;
  leftOpen: boolean;
  rightOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <div className={cx("ui-editor", !leftOpen && "is-left-closed", !rightOpen && "is-right-closed")}>
      <aside className={cx("ui-editor-side is-left", !leftOpen && "is-closed")} aria-label={leftLabel}>
        <button type="button" className="ui-editor-toggle" aria-expanded={leftOpen} onClick={onToggleLeft} title={leftOpen ? `${leftLabel} 접기` : `${leftLabel} 펼치기`}>
          <span aria-hidden>{leftOpen ? "‹" : "›"}</span>
          <span className="ui-editor-toggle-label">{leftLabel}</span>
        </button>
        {leftOpen && <div className="ui-editor-side-body">{left}</div>}
      </aside>
      <div className="ui-editor-center">
        <div className="ui-editor-stage">{stage}</div>
        <div className="ui-editor-strip">{strip}</div>
      </div>
      <aside className={cx("ui-editor-side is-right", !rightOpen && "is-closed")} aria-label={rightLabel}>
        <button type="button" className="ui-editor-toggle" aria-expanded={rightOpen} onClick={onToggleRight} title={rightOpen ? `${rightLabel} 접기` : `${rightLabel} 펼치기`}>
          <span aria-hidden>{rightOpen ? "›" : "‹"}</span>
          <span className="ui-editor-toggle-label">{rightLabel}</span>
        </button>
        {rightOpen && <div className="ui-editor-side-body">{right}</div>}
      </aside>
    </div>
  );
}

/** 접히는 패널 섹션 — 머리를 누르면 펼치고 접는다(스크롤 대신 접기) */
export function PanelSection({ title, open, onToggle, meta, children }: { title: string; open: boolean; onToggle: () => void; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className={cx("ui-psec", open && "is-open")}>
      <button type="button" className="ui-psec-head" aria-expanded={open} onClick={onToggle}>
        <span className="ui-psec-chev" aria-hidden>{open ? "▾" : "▸"}</span>
        <span className="ui-psec-title">{title}</span>
        {meta !== undefined && <span className="ui-psec-meta ui-t-label ui-tone-mute">{meta}</span>}
      </button>
      {open && <div className="ui-psec-body">{children}</div>}
    </section>
  );
}

/** 카드 한 장의 바탕 — width·height 는 원본 픽셀(비율만 쓴다). 덱 줄 미리보기도 같은 부품을 작게 쓴다 */
export function CanvasStage({
  width,
  height,
  background,
  label,
  mini = false,
  hint,
  children,
  onPointerDown,
  onDragOver,
  onDrop,
}: {
  width: number;
  height: number;
  background: string;
  label: string;
  mini?: boolean;
  /** 빈 카드 안내(레이어 0장일 때만 준다). 화면에만 겹치고 내보내는 PNG 에는 들어가지 않는다 */
  hint?: string | undefined;
  children?: ReactNode;
  onPointerDown?: ((e: PointerEvent<HTMLDivElement>) => void) | undefined;
  onDragOver?: ((e: DragEvent<HTMLDivElement>) => void) | undefined;
  onDrop?: ((e: DragEvent<HTMLDivElement>) => void) | undefined;
}) {
  return (
    <div
      className={cx("ui-canvas", mini && "is-mini", hint && "is-empty")}
      data-canvas-stage=""
      role={mini ? undefined : "region"}
      aria-label={label}
      style={{ aspectRatio: `${width} / ${height}`, background }}
      onPointerDown={onPointerDown}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {hint && (
        <div className="ui-canvas-empty" aria-hidden={mini ? "true" : undefined}>
          <span className="ui-canvas-empty-text">{hint}</span>
        </div>
      )}
      {children}
    </div>
  );
}

export interface CanvasBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 레이어 자리 — 상자는 원본 픽셀, 카드 크기(cw·ch)로 % 를 낸다 */
export function CanvasLayer({ box, cw, ch, selected = false, locked = false, rotation = 0, opacity = 1, blend, label, children, onPointerDown }: { box: CanvasBox; cw: number; ch: number; selected?: boolean; locked?: boolean; rotation?: number; opacity?: number; blend?: string | undefined; label: string; children: ReactNode; onPointerDown?: ((e: PointerEvent<HTMLDivElement>) => void) | undefined }) {
  return (
    <div
      className={cx("ui-canvas-layer", selected && "is-selected", onPointerDown && !locked && "is-editable", locked && "is-locked")}
      aria-label={label}
      style={{ left: pct(box.x, cw), top: pct(box.y, ch), width: pct(box.w, cw), height: pct(box.h, ch), transform: rotation ? `rotate(${rotation}deg)` : undefined, opacity: opacity < 1 ? opacity : undefined, mixBlendMode: blend && blend !== "normal" ? (blend as "multiply") : undefined }}
      onPointerDown={onPointerDown}
    >
      {children}
    </div>
  );
}

export type HandleMode = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: HandleMode[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** 크기 조절 손잡이 8개 — 선택된 레이어 안에 둔다 */
export function CanvasHandles({ onPointerDown }: { onPointerDown: (mode: HandleMode, e: PointerEvent<HTMLSpanElement>) => void }) {
  return (
    <>
      {HANDLES.map((m) => (
        <span key={m} className={`ui-canvas-handle is-${m}`} aria-hidden onPointerDown={(e) => onPointerDown(m, e)} />
      ))}
    </>
  );
}

/** 그림 — posX·posY(0~1) 보이는 자리, zoom 확대(그 자리 기준), filter 는 CSS filter 문자열 */
export function CanvasImage({ src, fit, alt = "", posX = 0.5, posY = 0.5, zoom = 1, filter }: { src: string; fit: "cover" | "contain"; alt?: string; posX?: number; posY?: number; zoom?: number; filter?: string | undefined }) {
  const pos = `${posX * 100}% ${posY * 100}%`;
  const img = <img className="ui-canvas-img" src={src} alt={alt} draggable={false} style={{ objectFit: fit, objectPosition: pos, transform: zoom !== 1 ? `scale(${zoom})` : undefined, transformOrigin: zoom !== 1 ? pos : undefined, filter: filter || undefined }} />;
  return zoom !== 1 ? <div className="ui-canvas-img-clip">{img}</div> : img;
}

/** 글자 — size 는 원본 픽셀, cw 는 카드 폭. 화면에서는 컨테이너 폭 비율(cqw)로 줄어든다 */
const rgba = (hex: string, a: number) => `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${a})`;

export function CanvasText({
  text, family, size, cw, weight, color, align, lineHeight, letterSpacing = 0, vAlign = "top", margin = 0, padding = 0, boxColor = "#000000", boxOpacity = 0,
}: { text: string; family: string; size: number; cw: number; weight: number; color: string; align: "left" | "center" | "right"; lineHeight: number; letterSpacing?: number; vAlign?: "top" | "middle" | "bottom"; margin?: number; padding?: number; boxColor?: string; boxOpacity?: number }) {
  const u = (v: number) => `${(v / cw) * 100}cqw`;
  return (
    <div className="ui-canvas-text-frame" style={{ padding: u(margin) }}>
      <div
        className="ui-canvas-text"
        style={{
          fontFamily: family, fontSize: u(size), fontWeight: weight, color, textAlign: align, lineHeight, letterSpacing: u(letterSpacing), padding: u(padding),
          justifyContent: vAlign === "top" ? "flex-start" : vAlign === "middle" ? "center" : "flex-end",
          background: boxOpacity > 0 ? rgba(boxColor, boxOpacity) : undefined,
        }}
      >
        <span>{text}</span>
      </div>
    </div>
  );
}

/** 덮개 — gradient 가 none 이 아니면 색 → 투명 그라데이션(from~to 구간, 0~1) */
export function CanvasOverlay({ opacity, color = "#000000", gradient = "none", from = 0, to = 1 }: { opacity: number; color?: string; gradient?: string; from?: number; to?: number }) {
  const solid = rgba(color, 1);
  const clear = rgba(color, 0);
  const a = `${Math.round(from * 100)}%`;
  const b = `${Math.round(to * 100)}%`;
  const background =
    gradient === "none" ? color : gradient === "radial" ? `radial-gradient(ellipse at center, ${clear} ${a}, ${solid} ${b})` : `linear-gradient(${gradient.replace("-", " ")}, ${solid} ${a}, ${clear} ${b})`;
  return <div className="ui-canvas-overlay" style={{ opacity, background }} />;
}

/** 스냅 가이드 선 — 원본 픽셀 x(세로선)·y(가로선) */
export function CanvasGuides({ v, h, cw, ch }: { v: number[]; h: number[]; cw: number; ch: number }) {
  return (
    <>
      {v.map((x) => <span key={`v${x}`} className="ui-canvas-guide is-v" aria-hidden style={{ left: pct(x, cw) }} />)}
      {h.map((y) => <span key={`h${y}`} className="ui-canvas-guide is-h" aria-hidden style={{ top: pct(y, ch) }} />)}
    </>
  );
}

/** 워터마크 — 자리(가운데 점)마다 글자 또는 그림 하나. 누르기는 통과시킨다 */
export function CanvasWatermark({ items, cw, ch, kind, text, src, size, color, opacity, angle }: { items: { x: number; y: number }[]; cw: number; ch: number; kind: "text" | "image"; text: string; src: string; size: number; color: string; opacity: number; angle: number }) {
  return (
    <div className="ui-canvas-wm" aria-hidden style={{ opacity }}>
      {items.map((p, i) => (
        <span key={i} className="ui-canvas-wm-item" style={{ left: pct(p.x, cw), top: pct(p.y, ch), transform: `translate(-50%, -50%) rotate(${angle}deg)` }}>
          {kind === "image" && src ? <img src={src} alt="" draggable={false} style={{ width: `${(size / cw) * 100}cqw` }} /> : <span style={{ fontSize: `${(size / cw) * 100}cqw`, color }}>{text}</span>}
        </span>
      ))}
    </div>
  );
}

/** 덱 줄 — 캔버스 아래 가로 장 목록(썸네일 순서 = 장 순서). actions 는 줄 오른쪽 끝(장 추가 등) */
export function DeckStrip({ label, children, actions }: { label: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="ui-deck-bar">
      <div className="ui-deck-strip" role="list" aria-label={label}>
        {children}
      </div>
      {actions && <div className="ui-deck-actions">{actions}</div>}
    </div>
  );
}

/** 장 썸네일 — 끌어서 순서를 바꾼다(onDropAt 에 놓인 자리). tools 는 현재 장 위에 겹치는 작은 버튼들 */
export function DeckThumb({ index, current, label, onClick, children, tools, dragKey, onDropAt }: {
  index: number;
  current: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
  tools?: ReactNode;
  /** 끌기 자료형(dataTransfer type) — 주면 끌어 옮길 수 있다 */
  dragKey?: string;
  onDropAt?: (from: number, to: number) => void;
}) {
  const over = (e: DragEvent<HTMLDivElement>) => {
    if (dragKey && e.dataTransfer.types.includes(dragKey)) {
      e.preventDefault();
      e.currentTarget.classList.add("is-drop");
    }
  };
  const leave = (e: DragEvent<HTMLDivElement>) => e.currentTarget.classList.remove("is-drop");
  const drop = (e: DragEvent<HTMLDivElement>) => {
    e.currentTarget.classList.remove("is-drop");
    if (!dragKey || !onDropAt) return;
    const from = Number(e.dataTransfer.getData(dragKey));
    if (e.dataTransfer.types.includes(dragKey) && Number.isInteger(from)) {
      e.preventDefault();
      onDropAt(from, index);
    }
  };
  return (
    <div className={cx("ui-deck-thumb-wrap", current && "is-current")} role="listitem" onDragOver={over} onDragLeave={leave} onDrop={drop}>
      <button
        type="button"
        className={cx("ui-deck-thumb", current && "is-current")}
        aria-current={current ? "true" : undefined}
        aria-label={label}
        onClick={onClick}
        draggable={dragKey ? true : undefined}
        onDragStart={dragKey ? (e) => (e.dataTransfer.setData(dragKey, String(index)), (e.dataTransfer.effectAllowed = "move")) : undefined}
      >
        {children}
      </button>
      <span className="ui-deck-thumb-foot">
        <span className="ui-t-label ui-tone-mute ui-mono">{String(index + 1).padStart(2, "0")}</span>
        {tools && <span className="ui-deck-thumb-tools">{tools}</span>}
      </span>
    </div>
  );
}

/** 자산 칸 — 끌어서 캔버스에 놓거나(넓은 화면), 눌러서 가운데에 넣는다(터치) */
export function AssetGrid({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return <div className={cx("ui-asset-grid", compact && "is-compact")}>{children}</div>;
}

export function AssetTile({ src, label, onDragStart, onClick }: { src: string; label: string; onDragStart: (e: DragEvent<HTMLButtonElement>) => void; onClick: () => void }) {
  return (
    <button type="button" className="ui-asset" title={label} aria-label={`${label} 넣기`} draggable onDragStart={onDragStart} onClick={onClick}>
      <img className="ui-asset-img" src={src} alt="" loading="lazy" draggable={false} />
    </button>
  );
}

/** 레이어 패널 한 줄 — 위가 앞(맨 위 레이어가 첫 줄) */
export function LayerRow({ name, kind, selected, hidden, onSelect, actions }: { name: string; kind: string; selected: boolean; hidden: boolean; onSelect: () => void; actions: ReactNode }) {
  return (
    <div className={cx("ui-layer-row", selected && "is-current", hidden && "is-hidden")}>
      <button type="button" className="ui-layer-name" aria-current={selected ? "true" : undefined} onClick={onSelect}>
        <span className="ui-t-label ui-tone-mute ui-mono">{kind}</span>
        <span className="ui-layer-title">{name}</span>
      </button>
      <span className="ui-layer-actions">{actions}</span>
    </div>
  );
}

/** 슬라이더(0~1 등) — 값 표시는 옆 글자로 */
export function Range({ label, value, min, max, step, onChange, display }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; display?: string }) {
  return (
    <label className="ui-field">
      <span className="ui-range-head">
        <span className="ui-t-label ui-tone-mute">{label}</span>
        <span className="ui-t-label ui-mono">{display ?? value}</span>
      </span>
      <input className="ui-range" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="ui-field">
      <span className="ui-t-label ui-tone-mute">{label}</span>
      <span className="ui-color">
        <input className="ui-color-swatch" type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <span className="ui-mono">{value}</span>
      </span>
    </label>
  );
}

/** 스티커 라이브러리 칸 — 끌어 놓거나 눌러 넣는다 */
export function StickerGrid({ children }: { children: ReactNode }) {
  return <div className="ui-sticker-grid">{children}</div>;
}

export function StickerTile({ src, label, onDragStart, onClick }: { src: string; label: string; onDragStart: (e: DragEvent<HTMLButtonElement>) => void; onClick: () => void }) {
  return (
    <button type="button" className="ui-sticker-tile" title={label} aria-label={`스티커 ${label} 넣기`} draggable onDragStart={onDragStart} onClick={onClick}>
      <img src={src} alt="" draggable={false} />
      <span className="ui-sticker-name">{label}</span>
    </button>
  );
}
