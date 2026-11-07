// [cards] 카드 편집기 부품 — 덱 줄·캔버스·레이어·핸들·자산 칸·레이어 패널.
// 위치·크기는 카드 원본 픽셀을 받아 %(그리고 글자는 컨테이너 폭 단위 cqw)로 그린다 — 화면 폭이 달라도 같은 비율.
// 화면(dashboard)은 style 을 못 쓰므로 계산된 기하 값은 여기서만 style 로 넣는다. 꾸밈(색·간격·선)은 styles.css 토큰만.
import { Children } from "react";
import type { ComponentPropsWithoutRef, CSSProperties, DragEvent, KeyboardEvent, PointerEvent, ReactNode } from "react";
import { cx, vars, type Tone } from "./poly";

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

/**
 * 편집 도구줄 — 한 줄(높이 약 50). 덱 제목(바로 고친다)·규격·상태는 왼쪽, 실행취소·메뉴·저장은 오른쪽.
 * 자주 안 쓰는 것(내보내기·덱 열기/삭제·단축키 안내)은 메뉴/도움말로 넣어 높이를 아낀다. 쌓이는 폭(1184 이하)에서는 줄바꿈한다.
 */
export function Toolbar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ui-toolbar" role="toolbar" aria-label={label}>
      {children}
    </div>
  );
}

/** 도구줄 안 묶음 — 오른쪽 끝으로 밀린다(앞의 상태 칸이 남는 폭을 가진다) */
export function ToolbarGroup({ children }: { children: ReactNode }) {
  return <div className="ui-toolbar-group">{children}</div>;
}

export function ToolbarSep() {
  return <span className="ui-toolbar-sep" role="separator" aria-orientation="vertical" />;
}

/** 덱 제목 — 테두리 없는 글자처럼 보이다가 올리면 입력 칸이 된다 */
export function ToolbarTitle(props: Omit<ComponentPropsWithoutRef<"input">, "className" | "style">) {
  return <input className="ui-input ui-toolbar-title" {...props} />;
}

/** 도구줄 상태 글자(장 수·저장 안 됨) — 줄어들지 않는다 */
export function ToolbarStatus({ tone, children }: { tone?: Tone | undefined; children: ReactNode }) {
  return <span className={cx("ui-toolbar-status ui-t-label", tone && tone !== "default" ? `ui-tone-${tone}` : "ui-tone-mute")}>{children}</span>;
}

/** 도구줄 알림(저장했습니다·실패) — 남는 폭만 쓰고 넘치면 …, 전체 글은 마우스를 올리면 */
export function ToolbarNote({ tone, children }: { tone: "alert" | "accent"; children: string }) {
  return (
    <span className={cx("ui-toolbar-note ui-t-label ui-truncate", `ui-tone-${tone}`)} role={tone === "alert" ? "alert" : "status"} title={children}>
      {children}
    </span>
  );
}

/** 눈에는 안 보이고 보조기기에만 읽히는 화면 제목 — 화면에 같은 이름이 이미 있을 때(덱 제목) */
export function HiddenTitle({ children }: { children: ReactNode }) {
  return <h1 className="ui-sr-only">{children}</h1>;
}

/** 오른쪽 패널 폭 비율(편집기 폭 기준)의 범위 — 기본은 CSS 의 40%, 끌어서 바꾼 값은 이 범위로 자른다 */
export const RIGHT_RATIO_MIN = 0.2;
export const RIGHT_RATIO_MAX = 0.7;
export const RIGHT_RATIO_STEP = 0.02;
export const clampRightRatio = (r: number): number => (Number.isFinite(r) ? Math.min(RIGHT_RATIO_MAX, Math.max(RIGHT_RATIO_MIN, r)) : RIGHT_RATIO_MIN);
/** 포인터 x → 오른쪽 패널 폭 비율 (box = 편집기 전체 상자) */
export const rightRatioFromPointer = (clientX: number, box: { right: number; width: number }): number => (box.width > 0 ? clampRightRatio((box.right - clientX) / box.width) : RIGHT_RATIO_MIN);

/**
 * 편집기 세 칸 — 왼쪽 패널(스티커) · 가운데(캔버스 + 아래 가로 장 목록) · 오른쪽 패널(레퍼런스 그리드).
 * 양쪽 패널은 접을 수 있고(접으면 얇은 띠만 남는다), 화면 높이에 붙어 따로 스크롤된다. 좁으면 위아래로 쌓인다.
 * 오른쪽 패널은 기본 폭이 편집기의 40% 이고 경계선을 끌어(←→ 키도 됨) 바꾼다(rightRatio·onRightRatio — 저장은 화면이 한다).
 * sheet 는 오른쪽 패널 위에 뜨는 접이식 시트(요소를 골랐을 때의 속성) — 없으면 그리지 않는다.
 */
export function EditorLayout({ left, stage, strip, right, rightBar, leftOpen, rightOpen, onToggleLeft, onToggleRight, leftLabel, rightLabel, rightRatio, onRightRatio, sheet, sheetTitle = "", sheetOpen = true, onToggleSheet }: {
  left: ReactNode;
  stage: ReactNode;
  strip: ReactNode;
  right: ReactNode;
  /** 오른쪽 패널 위 고정 줄(PanelBar) — 스크롤 본문 밖에 두어 높이를 flex 가 계산한다(본문 ≥ 패널 50% 를 상수 없이 보장) */
  rightBar?: ReactNode;
  leftOpen: boolean;
  rightOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  leftLabel: string;
  rightLabel: string;
  /** 오른쪽 패널 폭 비율(0.2~0.7). 없으면 CSS 기본(40%) */
  rightRatio?: number | undefined;
  onRightRatio?: ((ratio: number) => void) | undefined;
  sheet?: ReactNode;
  sheetTitle?: string;
  sheetOpen?: boolean;
  onToggleSheet?: (() => void) | undefined;
}) {
  const ratio = rightRatio === undefined ? undefined : clampRightRatio(rightRatio);
  const nudge = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onRightRatio || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const now = ratio ?? 0.4;
    onRightRatio(clampRightRatio(now + (e.key === "ArrowLeft" ? RIGHT_RATIO_STEP : -RIGHT_RATIO_STEP)));
  };
  return (
    <div className={cx("ui-editor", !leftOpen && "is-left-closed", !rightOpen && "is-right-closed")} style={ratio === undefined ? undefined : ({ "--ed-right": `${(ratio * 100).toFixed(1)}%` } as CSSProperties)}>
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
        {rightOpen && (
          <div className="ui-editor-side-main">
            {rightBar}
            <div className="ui-editor-side-body is-grid">{right}</div>
            {onRightRatio && (
              <div
                className="ui-editor-split"
                role="separator"
                aria-orientation="vertical"
                aria-label={`${rightLabel} 폭`}
                aria-valuemin={Math.round(RIGHT_RATIO_MIN * 100)}
                aria-valuemax={Math.round(RIGHT_RATIO_MAX * 100)}
                aria-valuenow={Math.round((ratio ?? 0.4) * 100)}
                tabIndex={0}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                  const box = e.currentTarget.closest(".ui-editor");
                  if (box) onRightRatio(rightRatioFromPointer(e.clientX, box.getBoundingClientRect()));
                }}
                onKeyDown={nudge}
              />
            )}
            {sheet && (
              <section className={cx("ui-sheet", !sheetOpen && "is-collapsed")} aria-label={sheetTitle}>
                <button type="button" className="ui-sheet-head" aria-expanded={sheetOpen} onClick={onToggleSheet}>
                  <span className="ui-psec-chev" aria-hidden>{sheetOpen ? "▾" : "▴"}</span>
                  <span className="ui-psec-title ui-truncate">{sheetTitle}</span>
                  <span className="ui-t-label ui-tone-mute">{sheetOpen ? "접기" : "펼치기"}</span>
                </button>
                {sheetOpen && <div className="ui-sheet-body">{sheet}</div>}
              </section>
            )}
          </div>
        )}
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
      style={{ aspectRatio: `${width} / ${height}`, background, "--ar": width / height } as CSSProperties}
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

/**
 * 가운데 칸에서 캔버스가 남는 높이에 맞춰 줄어들게 하는 틀(넓은 화면). 카드 비율(--ar)을 지키면서 폭·높이 중 먼저 닿는 쪽에 맞춘다.
 * 좁은 화면(패널이 쌓이는 폭)에서는 아무 효과가 없고 캔버스가 폭 100% 로 그려진다.
 */
export function CanvasFit({ children }: { children: ReactNode }) {
  return <div className="ui-canvas-fit">{children}</div>;
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
      <div className="ui-deck-strip" role="list" aria-label={label} style={vars({ "--deck-n": Math.max(1, Children.count(children)) })}>
        {children}
      </div>
      {actions && <div className="ui-deck-actions">{actions}</div>}
    </div>
  );
}

/** 덱 줄 동작 단추 — 넓지 않은 줄(화면 높이 고정 편집)에서는 아이콘만, 좁은 화면에서는 글자까지 보인다. 이름은 항상 label */
export function DeckAction({ label, icon, primary = false, ...rest }: Omit<ComponentPropsWithoutRef<"button">, "className" | "style" | "children" | "aria-label"> & { label: string; icon: string; primary?: boolean }) {
  return (
    <button type="button" className={cx("ui-btn", primary ? "ui-btn-primary" : "ui-btn-secondary")} aria-label={label} title={label} {...rest}>
      <span className="ui-deck-action-icon" aria-hidden>
        {icon}
      </span>
      <span className="ui-deck-action-text">{label}</span>
    </button>
  );
}

/** 장 썸네일 — 끌어서 순서를 바꾼다(onDropAt 에 놓인 자리). tools 는 현재 장 위에 겹치는 작은 버튼들. ratio(가로/세로)를 주면 화면 높이 고정 편집에서 규격이 달라도 썸네일 높이를 같게 맞춘다 */
export function DeckThumb({ index, current, label, onClick, children, tools, ratio, dragKey, onDropAt }: {
  index: number;
  current: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
  tools?: ReactNode;
  ratio?: number | undefined;
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
    <div className={cx("ui-deck-thumb-wrap", current && "is-current")} role="listitem" style={ratio ? vars({ "--ar": ratio }) : undefined} onDragOver={over} onDragLeave={leave} onDrop={drop}>
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

/** 패널 위 고정 줄 — 탭·검색 같은 조작이 스크롤돼도 남는다 */
export function PanelBar({ children }: { children: ReactNode }) {
  return <div className="ui-panel-bar">{children}</div>;
}

/** 패널 본문 — 안쪽 여백 */
export function PanelPad({ children }: { children: ReactNode }) {
  return <div className="ui-panel-pad">{children}</div>;
}

/** 레퍼런스 그리드 — 그림 비율대로 쌓는 메이슨리(열 2~4개, 패널 폭이 정한다) */
export function RefGrid({ children }: { children: ReactNode }) {
  return <div className="ui-refgrid">{children}</div>;
}

/**
 * 레퍼런스 한 칸 — 자르지 않는다(원본 비율). 그림 크기를 모르는 동안은 4:5 자리만 잡아 화면 밖 그림은 받지 않는다(지연 로딩).
 * 누르면 onClick(크게 보기), 끌면 캔버스로.
 */
export function RefTile({ src, label, action, onDragStart, onClick }: { src: string; label: string; action: string; onDragStart: (e: DragEvent<HTMLButtonElement>) => void; onClick: () => void }) {
  return (
    <button type="button" className="ui-ref" title={label} aria-label={`${label} ${action}`} draggable onDragStart={onDragStart} onClick={onClick}>
      <img className="ui-ref-img" src={src} alt="" loading="lazy" decoding="async" draggable={false} />
    </button>
  );
}

/** 크게 보기 — 화면 가운데에 그림 하나. 바깥을 누르거나 Esc 로 닫는다(닫기 버튼에 포커스가 가 있다) */
export function Lightbox({ src, label, meta, actions, onClose }: { src: string; label: string; meta?: ReactNode; actions: ReactNode; onClose: () => void }) {
  return (
    <div
      className="ui-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="ui-lightbox-panel">
        <img className="ui-lightbox-img" src={src} alt={label} draggable={false} />
        <div className="ui-lightbox-foot">
          <div className="ui-lightbox-text">
            <span className="ui-truncate">{label}</span>
            {meta && <span className="ui-t-label ui-tone-mute ui-truncate">{meta}</span>}
          </div>
          <div className="ui-lightbox-actions">{actions}</div>
        </div>
      </div>
    </div>
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
