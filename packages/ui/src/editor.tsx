// [cards] 카드 편집기 부품 — 덱 줄·캔버스·레이어·핸들·자산 칸·레이어 패널.
// 위치·크기는 카드 원본 픽셀을 받아 %(그리고 글자는 컨테이너 폭 단위 cqw)로 그린다 — 화면 폭이 달라도 같은 비율.
// 화면(dashboard)은 style 을 못 쓰므로 계산된 기하 값은 여기서만 style 로 넣는다. 꾸밈(색·간격·선)은 styles.css 토큰만.
import type { DragEvent, PointerEvent, ReactNode } from "react";
import { cx } from "./poly";

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

/** 편집기 세 칸 — 왼쪽 덱(장 목록) · 가운데 캔버스 · 오른쪽 패널. 좁으면 위아래로 쌓인다 */
export function EditorLayout({ deck, stage, panel }: { deck: ReactNode; stage: ReactNode; panel: ReactNode }) {
  return (
    <div className="ui-editor">
      <div className="ui-editor-deck">{deck}</div>
      <div className="ui-editor-stage">{stage}</div>
      <div className="ui-editor-panel">{panel}</div>
    </div>
  );
}

/** 카드 한 장의 바탕 — width·height 는 원본 픽셀(비율만 쓴다). 덱 줄 미리보기도 같은 부품을 작게 쓴다 */
export function CanvasStage({
  width,
  height,
  background,
  label,
  mini = false,
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
  children?: ReactNode;
  onPointerDown?: ((e: PointerEvent<HTMLDivElement>) => void) | undefined;
  onDragOver?: ((e: DragEvent<HTMLDivElement>) => void) | undefined;
  onDrop?: ((e: DragEvent<HTMLDivElement>) => void) | undefined;
}) {
  return (
    <div
      className={cx("ui-canvas", mini && "is-mini")}
      data-canvas-stage=""
      role={mini ? undefined : "region"}
      aria-label={label}
      style={{ aspectRatio: `${width} / ${height}`, background }}
      onPointerDown={onPointerDown}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
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
export function CanvasLayer({ box, cw, ch, selected = false, label, children, onPointerDown }: { box: CanvasBox; cw: number; ch: number; selected?: boolean; label: string; children: ReactNode; onPointerDown?: ((e: PointerEvent<HTMLDivElement>) => void) | undefined }) {
  return (
    <div
      className={cx("ui-canvas-layer", selected && "is-selected", onPointerDown && "is-editable")}
      aria-label={label}
      style={{ left: pct(box.x, cw), top: pct(box.y, ch), width: pct(box.w, cw), height: pct(box.h, ch) }}
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

export function CanvasImage({ src, fit, alt = "" }: { src: string; fit: "cover" | "contain"; alt?: string }) {
  return <img className="ui-canvas-img" src={src} alt={alt} draggable={false} style={{ objectFit: fit }} />;
}

/** 글자 — size 는 원본 픽셀, cw 는 카드 폭. 화면에서는 컨테이너 폭 비율(cqw)로 줄어든다 */
export function CanvasText({ text, family, size, cw, weight, color, align, lineHeight }: { text: string; family: string; size: number; cw: number; weight: number; color: string; align: "left" | "center" | "right"; lineHeight: number }) {
  return (
    <div className="ui-canvas-text" style={{ fontFamily: family, fontSize: `${(size / cw) * 100}cqw`, fontWeight: weight, color, textAlign: align, lineHeight }}>
      {text}
    </div>
  );
}

export function CanvasOverlay({ opacity }: { opacity: number }) {
  return <div className="ui-canvas-overlay" style={{ opacity }} />;
}

/** 덱 줄 — 장 미리보기 목록(넓으면 세로, 좁으면 가로로 흐른다) */
export function DeckStrip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ui-deck-strip" role="list" aria-label={label}>
      {children}
    </div>
  );
}

export function DeckThumb({ index, current, label, onClick, children }: { index: number; current: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <div className="ui-deck-thumb-wrap" role="listitem">
      <button type="button" className={cx("ui-deck-thumb", current && "is-current")} aria-current={current ? "true" : undefined} aria-label={label} onClick={onClick}>
        {children}
      </button>
      <span className="ui-t-label ui-tone-mute ui-mono">{String(index + 1).padStart(2, "0")}</span>
    </div>
  );
}

/** 자산 칸 — 끌어서 캔버스에 놓거나(넓은 화면), 눌러서 가운데에 넣는다(터치) */
export function AssetGrid({ children }: { children: ReactNode }) {
  return <div className="ui-asset-grid">{children}</div>;
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
