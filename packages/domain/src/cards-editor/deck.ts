// [cards] 카드뉴스 편집기 — 덱(여러 장)·카드·레이어 모델과 순수 연산.
// 좌표·크기는 전부 카드 원본 픽셀(프리셋 폭·높이 기준)이다. 화면은 비율로 줄여 그리고, PNG 내보내기는 원본 크기로 그린다.
// 레이어 배열은 아래 → 위 순서(0 이 맨 아래). 연산은 입력을 바꾸지 않고 새 값을 돌려준다.
import { STICKER_DEFS, isStickerId, stickerDef } from "./sticker-library";

/** 카드 규격 — 기존 카드 판형(1080×1350, 4:5)이 기본. 릴스 표지·정사각은 같은 폭 1080 */
export const CARD_PRESETS = {
  "4:5": { width: 1080, height: 1350, label: "4:5 피드" },
  "1:1": { width: 1080, height: 1080, label: "1:1 정사각" },
  "9:16": { width: 1080, height: 1920, label: "9:16 스토리" },
} as const;
export type CardPresetId = keyof typeof CARD_PRESETS;
export const DEFAULT_CARD_PRESET: CardPresetId = "4:5";
export const isCardPreset = (v: unknown): v is CardPresetId => typeof v === "string" && Object.hasOwn(CARD_PRESETS, v);

export const CARD_FONTS = ["sans", "serif", "mono"] as const;
export type CardFont = (typeof CARD_FONTS)[number];
export const CARD_WEIGHTS = [300, 400, 500, 600, 700, 800, 900] as const;
export type CardWeight = (typeof CARD_WEIGHTS)[number];
export const CARD_ALIGNS = ["left", "center", "right"] as const;
export type CardAlign = (typeof CARD_ALIGNS)[number];
export const CARD_VALIGNS = ["top", "middle", "bottom"] as const;
export type CardVAlign = (typeof CARD_VALIGNS)[number];
export const STICKER_SHAPES = ["rect", "circle", "arrow", "bubble", "badge", "star", "emoji"] as const;
export type StickerShape = (typeof STICKER_SHAPES)[number];
export const OVERLAY_GRADIENTS = ["none", "to-top", "to-bottom", "to-left", "to-right", "radial"] as const;
export type OverlayGradient = (typeof OVERLAY_GRADIENTS)[number];
export const BLEND_MODES = ["normal", "multiply", "screen", "overlay", "soft-light", "darken", "lighten", "color"] as const;
export type BlendMode = (typeof BLEND_MODES)[number];
export const WATERMARK_POSITIONS = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"] as const;
export type WatermarkPosition = (typeof WATERMARK_POSITIONS)[number];

export interface LayerBase {
  id: string;
  name: string;
  hidden: boolean;
  /** 잠금 — 캔버스에서 끌기·크기 조절이 안 된다 */
  locked: boolean;
  /** 회전(도, -180~180) — 상자 가운데 기준 */
  rotation: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface ImageLayer extends LayerBase {
  kind: "image";
  /** 같은 출처 주소(/api/…)만 — 내보내기 캔버스가 오염(taint)되지 않게 */
  src: string;
  fit: "cover" | "contain";
  /** 보이는 자리(초점) 0~1 — cover 에서 잘릴 때 어느 쪽을 남길지 */
  posX: number;
  posY: number;
  /** 확대 1~4(상자 안에서 키운다) */
  zoom: number;
  /** 밝기·대비·채도 0~2(1 = 원본) */
  brightness: number;
  contrast: number;
  saturation: number;
  /** 흐림(원본 픽셀) 0~50 */
  blur: number;
}
export interface TextLayer extends LayerBase {
  kind: "text";
  text: string;
  font: CardFont;
  /** 원본 픽셀 기준 글자 크기 */
  size: number;
  weight: CardWeight;
  color: string;
  align: CardAlign;
  /** 줄 간격(글자 크기 배수) */
  lineHeight: number;
  /** 자간(원본 픽셀) */
  letterSpacing: number;
  /** 세로 정렬 */
  vAlign: CardVAlign;
  /** 바깥 여백 — 레이어 상자 안쪽으로 배경 상자를 들인다(원본 픽셀) */
  margin: number;
  /** 안쪽 여백 — 배경 상자와 글자 사이(원본 픽셀) */
  padding: number;
  /** 배경 상자 색·불투명도(0 이면 없음) */
  boxColor: string;
  boxOpacity: number;
}
/** 덮개 — 단색 또는 그라데이션(색 → 투명). 범위 from~to(0~1)는 그라데이션 방향 축의 구간 */
export interface OverlayLayer extends LayerBase {
  kind: "overlay";
  color: string;
  opacity: number;
  /** none = 단색, to-top = 아래가 진하고 위로 갈수록 투명 */
  gradient: OverlayGradient;
  gradFrom: number;
  gradTo: number;
  blend: BlendMode;
}
/** 스티커 — 도형·화살표·말풍선·배지·별·이모지. 글자(label)는 배지·말풍선 안 글, 이모지는 그 글자 자체 */
export interface StickerLayer extends LayerBase {
  kind: "sticker";
  /** 라이브러리 스티커 id(sticker-library) — 빈 문자열이면 예전 도형(shape)으로 그린다 */
  sticker: string;
  shape: StickerShape;
  /** 채움 색(#rrggbb) 또는 "none" */
  fill: string;
  stroke: string;
  strokeWidth: number;
  /** 모서리 0~1 */
  radius: number;
  /** 그림자 0~1 */
  shadow: number;
  label: string;
  labelColor: string;
  opacity: number;
}
export type CardLayer = ImageLayer | TextLayer | OverlayLayer | StickerLayer;
export type CardLayerKind = CardLayer["kind"];

export interface DeckCard {
  id: string;
  background: string;
  layers: CardLayer[];
}
/** 덱 전체 워터마크 — 모든 장 맨 위에 그린다. tile 이면 카드 전체에 반복 */
export interface Watermark {
  kind: "text" | "image";
  text: string;
  /** 이미지(같은 출처 /api/ 주소) */
  src: string;
  position: WatermarkPosition;
  opacity: number;
  /** 글자 크기 또는 이미지 폭(원본 픽셀) */
  size: number;
  color: string;
  tile: boolean;
  /** 반복 간격(원본 픽셀) */
  gap: number;
  /** 반복 기울기(도) */
  angle: number;
}
export interface CardDeck {
  id: string;
  title: string;
  preset: CardPresetId;
  cards: DeckCard[];
  watermark: Watermark | null;
}

export const DECK_LIMITS = { cards: 30, layers: 40, text: 2000, title: 80, name: 40, size: { min: 12, max: 400 }, minBox: 24 } as const;

const HEX = /^#[0-9a-f]{6}$/i;
const SRC = /^\/api\/[A-Za-z0-9._~\-/]+$/;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v);

// ── 만들기 ─────────────────────────────────────────────
export const blankCard = (id: string): DeckCard => ({ id, background: "#111111", layers: [] });

export function createDeck(id: string, title: string, preset: CardPresetId, cardId: string): CardDeck {
  return { id, title: title.trim().slice(0, DECK_LIMITS.title) || "제목 없는 덱", preset, cards: [blankCard(cardId)], watermark: null };
}

export function textLayer(id: string, preset: CardPresetId, patch: Partial<TextLayer> = {}): TextLayer {
  const { width, height } = CARD_PRESETS[preset];
  return { id, kind: "text", name: "텍스트", hidden: false, locked: false, rotation: 0, x: 96, y: round(height * 0.4), w: width - 192, h: 240, text: "제목을 입력하세요", font: "sans", size: 72, weight: 700, color: "#ffffff", align: "left", lineHeight: 1.3, letterSpacing: 0, vAlign: "top", margin: 0, padding: 0, boxColor: "#000000", boxOpacity: 0, ...patch };
}

export function overlayLayer(id: string, preset: CardPresetId, opacity = 0.4): OverlayLayer {
  const { width, height } = CARD_PRESETS[preset];
  return { id, kind: "overlay", name: "덮개", hidden: false, locked: false, rotation: 0, x: 0, y: 0, w: width, h: height, color: "#000000", opacity: clamp(opacity, 0, 1), gradient: "none", gradFrom: 0, gradTo: 1, blend: "normal" };
}

/** 스티커 레이어 — 라이브러리(sticker-library) id 로 만든다. (cx, cy) 가운데, 카드 폭 ¼(가로로 긴 것은 더 넓게) */
export function stickerLayer(id: string, preset: CardPresetId, libId: string, at: { cx?: number; cy?: number } = {}): StickerLayer {
  const { width, height } = CARD_PRESETS[preset];
  const s = stickerDef(libId) ?? STICKER_DEFS[0]!;
  const w = round(width * (s.aspect >= 3 ? 0.42 : s.aspect >= 1.6 ? 0.34 : 0.24));
  const h = round(w / s.aspect);
  const cx = at.cx ?? width / 2;
  const cy = at.cy ?? height / 2;
  return { id, kind: "sticker", name: s.name.slice(0, DECK_LIMITS.name), hidden: false, locked: false, rotation: 0, x: round(cx - w / 2), y: round(cy - h / 2), w, h, sticker: s.id, shape: "rect", ...s.look, opacity: 1 };
}

export const defaultWatermark = (): Watermark => ({ kind: "text", text: "@yunseo", src: "", position: "br", opacity: 0.5, size: 36, color: "#ffffff", tile: false, gap: 320, angle: -30 });

/**
 * 워터마크 놓을 자리(가운데 점) — 반복이면 카드 전체에 gap 간격 격자(반 칸 엇갈림), 아니면 9칸 위치에서 여백 margin 안쪽.
 * itemW·itemH 는 워터마크 한 개의 대략 크기(가장자리에서 잘리지 않게 쓴다).
 */
export function watermarkAnchors(wm: Pick<Watermark, "position" | "tile" | "gap">, preset: CardPresetId, itemW: number, itemH: number, margin = 48): { x: number; y: number }[] {
  const { width, height } = CARD_PRESETS[preset];
  if (wm.tile) {
    const gap = Math.max(40, wm.gap);
    const out: { x: number; y: number }[] = [];
    let row = 0;
    for (let y = gap / 2; y < height + gap / 2; y += gap, row++) for (let x = (row % 2 ? gap : gap / 2) - gap / 2; x < width + gap; x += gap) out.push({ x: round(x), y: round(y) });
    return out;
  }
  const [v, h] = [wm.position[0], wm.position[1]];
  const x = h === "l" ? margin + itemW / 2 : h === "r" ? width - margin - itemW / 2 : width / 2;
  const y = v === "t" ? margin + itemH / 2 : v === "b" ? height - margin - itemH / 2 : height / 2;
  return [{ x: round(x), y: round(y) }];
}

/** 이미지 레이어 — 원본 비율을 지키며 카드 폭의 `scale` 만큼, (cx, cy) 를 가운데로 둔다 */
export function imageLayer(id: string, preset: CardPresetId, src: string, opts: { name?: string; aspect?: number | undefined; cx?: number; cy?: number; scale?: number } = {}): ImageLayer {
  const { width, height } = CARD_PRESETS[preset];
  const aspect = opts.aspect && opts.aspect > 0 ? opts.aspect : width / height;
  let w = width * (opts.scale ?? 1);
  let h = w / aspect;
  if (h > height) {
    h = height;
    w = h * aspect;
  }
  const cx = opts.cx ?? width / 2;
  const cy = opts.cy ?? height / 2;
  return { id, kind: "image", name: (opts.name ?? "이미지").slice(0, DECK_LIMITS.name), hidden: false, locked: false, rotation: 0, x: round(cx - w / 2), y: round(cy - h / 2), w: round(w), h: round(h), src, fit: "cover", ...IMAGE_DEFAULTS };
}

export const IMAGE_DEFAULTS = { posX: 0.5, posY: 0.5, zoom: 1, brightness: 1, contrast: 1, saturation: 1, blur: 0 } as const;

/** 이미지 보정 → CSS·캔버스 filter 문자열(기본값이면 ""). unit 은 흐림 길이 단위 변환(화면은 cqw, 캔버스는 px) */
export function imageFilter(l: Pick<ImageLayer, "brightness" | "contrast" | "saturation" | "blur">, unit: (px: number) => string = (px) => `${px}px`): string {
  const out: string[] = [];
  if (l.brightness !== 1) out.push(`brightness(${l.brightness})`);
  if (l.contrast !== 1) out.push(`contrast(${l.contrast})`);
  if (l.saturation !== 1) out.push(`saturate(${l.saturation})`);
  if (l.blur > 0) out.push(`blur(${unit(l.blur)})`);
  return out.join(" ");
}

// ── 카드(장) 연산 ───────────────────────────────────────
const at = <T>(list: readonly T[], i: number) => i >= 0 && i < list.length;

/** index 다음에 새 장(없으면 맨 뒤) */
export function addCard(deck: CardDeck, cardId: string, afterIndex = deck.cards.length - 1): CardDeck {
  if (deck.cards.length >= DECK_LIMITS.cards) return deck;
  const cards = [...deck.cards];
  cards.splice(clamp(afterIndex + 1, 0, cards.length), 0, { ...blankCard(cardId), background: deck.cards[afterIndex]?.background ?? "#111111" });
  return { ...deck, cards };
}

/** 장 복제 — 바로 뒤에 넣는다. 레이어 id 는 새로 받는다 */
export function duplicateCard(deck: CardDeck, index: number, newId: () => string): CardDeck {
  if (!at(deck.cards, index) || deck.cards.length >= DECK_LIMITS.cards) return deck;
  const src = deck.cards[index]!;
  const copy: DeckCard = { ...src, id: newId(), layers: src.layers.map((l) => ({ ...l, id: newId() })) };
  const cards = [...deck.cards];
  cards.splice(index + 1, 0, copy);
  return { ...deck, cards };
}

/** 장 삭제 — 마지막 한 장은 지우지 않는다 */
export function removeCard(deck: CardDeck, index: number): CardDeck {
  if (!at(deck.cards, index) || deck.cards.length <= 1) return deck;
  return { ...deck, cards: deck.cards.filter((_, i) => i !== index) };
}

/** 장 순서 — delta -1 앞으로, +1 뒤로 */
export function moveCard(deck: CardDeck, index: number, delta: number): CardDeck {
  const to = index + delta;
  if (!at(deck.cards, index) || !at(deck.cards, to)) return deck;
  const cards = [...deck.cards];
  const [c] = cards.splice(index, 1);
  cards.splice(to, 0, c!);
  return { ...deck, cards };
}

/** 장을 from 자리에서 to 자리로(끌어서 순서 바꾸기) */
export function moveCardTo(deck: CardDeck, from: number, to: number): CardDeck {
  if (!at(deck.cards, from) || !at(deck.cards, to) || from === to) return deck;
  const cards = [...deck.cards];
  const [c] = cards.splice(from, 1);
  cards.splice(to, 0, c!);
  return { ...deck, cards };
}

export function updateCard(deck: CardDeck, index: number, fn: (card: DeckCard) => DeckCard): CardDeck {
  if (!at(deck.cards, index)) return deck;
  return { ...deck, cards: deck.cards.map((c, i) => (i === index ? fn(c) : c)) };
}

// ── 레이어 연산(카드 하나) ──────────────────────────────
export function addLayer(card: DeckCard, layer: CardLayer): DeckCard {
  if (card.layers.length >= DECK_LIMITS.layers) return card;
  return { ...card, layers: [...card.layers, layer] };
}

export function updateLayer(card: DeckCard, id: string, patch: Partial<CardLayer>): DeckCard {
  return { ...card, layers: card.layers.map((l) => (l.id === id ? ({ ...l, ...patch, id: l.id, kind: l.kind } as CardLayer) : l)) };
}

export function removeLayer(card: DeckCard, id: string): DeckCard {
  return { ...card, layers: card.layers.filter((l) => l.id !== id) };
}

export function toggleLayerLocked(card: DeckCard, id: string): DeckCard {
  return { ...card, layers: card.layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)) };
}

/** 레이어 복제 — 바로 위에, 조금 비켜 놓는다 */
export function duplicateLayer(card: DeckCard, id: string, newId: string): DeckCard {
  const i = card.layers.findIndex((l) => l.id === id);
  if (i < 0 || card.layers.length >= DECK_LIMITS.layers) return card;
  const src = card.layers[i]!;
  const layers = [...card.layers];
  layers.splice(i + 1, 0, { ...src, id: newId, name: `${src.name} 복사`.slice(0, DECK_LIMITS.name), x: src.x + 24, y: src.y + 24, locked: false });
  return { ...card, layers };
}

/** 맨 앞(+1)·맨 뒤(-1)로 */
export function moveLayerToEdge(card: DeckCard, id: string, edge: 1 | -1): DeckCard {
  const l = card.layers.find((x) => x.id === id);
  if (!l) return card;
  const rest = card.layers.filter((x) => x.id !== id);
  return { ...card, layers: edge === 1 ? [...rest, l] : [l, ...rest] };
}

export function toggleLayerHidden(card: DeckCard, id: string): DeckCard {
  return { ...card, layers: card.layers.map((l) => (l.id === id ? { ...l, hidden: !l.hidden } : l)) };
}

/** 레이어 순서 — delta +1 한 칸 위로(앞으로), -1 한 칸 아래로 */
export function moveLayer(card: DeckCard, id: string, delta: number): DeckCard {
  const i = card.layers.findIndex((l) => l.id === id);
  const to = i + delta;
  if (i < 0 || !at(card.layers, to)) return card;
  const layers = [...card.layers];
  const [l] = layers.splice(i, 1);
  layers.splice(to, 0, l!);
  return { ...card, layers };
}

// ── 끌기·크기 조절 ──────────────────────────────────────
export type DragMode = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/**
 * 끌기 결과 — 시작 상자(start)에 원본 픽셀 이동량(dx, dy)을 더한다. 상자는 최소 크기를 지키고,
 * 이동은 카드 밖으로 완전히 나가지 않게(최소 크기만큼은 카드 안에 남게) 묶는다. keepAspect 면 모서리 끌기에서 비율 유지.
 */
export function dragBox(start: Pick<LayerBase, "x" | "y" | "w" | "h">, mode: DragMode, dx: number, dy: number, preset: CardPresetId, keepAspect = false): Pick<LayerBase, "x" | "y" | "w" | "h"> {
  const { width, height } = CARD_PRESETS[preset];
  const min = DECK_LIMITS.minBox;
  if (mode === "move") {
    return { x: round(clamp(start.x + dx, min - start.w, width - min)), y: round(clamp(start.y + dy, min - start.h, height - min)), w: start.w, h: start.h };
  }
  let { x, y, w, h } = start;
  if (mode.includes("e")) w = start.w + dx;
  if (mode.includes("w")) w = start.w - dx;
  if (mode.includes("s")) h = start.h + dy;
  if (mode.includes("n")) h = start.h - dy;
  w = Math.max(min, w);
  h = Math.max(min, h);
  if (keepAspect && mode.length === 2 && start.h > 0) {
    const ratio = start.w / start.h;
    if (w / h > ratio) h = w / ratio;
    else w = h * ratio;
  }
  if (mode.includes("w")) x = start.x + start.w - w;
  if (mode.includes("n")) y = start.y + start.h - h;
  return { x: round(x), y: round(y), w: round(w), h: round(h) };
}

// ── 스냅 가이드 ─────────────────────────────────────────
export interface SnapResult {
  box: Pick<LayerBase, "x" | "y" | "w" | "h">;
  /** 맞춘 세로선 x·가로선 y(원본 픽셀) */
  guides: { v: number[]; h: number[] };
}

/**
 * 옮기는 상자의 왼쪽·가운데·오른쪽(위·가운데·아래)을 카드 가장자리·가운데와 다른 레이어의 같은 선에 threshold 안이면 붙인다.
 */
export function snapBox(box: Pick<LayerBase, "x" | "y" | "w" | "h">, others: readonly Pick<LayerBase, "x" | "y" | "w" | "h">[], preset: CardPresetId, threshold = 12): SnapResult {
  const { width, height } = CARD_PRESETS[preset];
  const vs = [0, width / 2, width, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
  const hs = [0, height / 2, height, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
  const pick = (start: number, size: number, lines: number[]) => {
    let best: { d: number; line: number; off: number } | null = null;
    for (const off of [0, size / 2, size]) for (const line of lines) {
      const d = Math.abs(start + off - line);
      if (d <= threshold && (!best || d < best.d)) best = { d, line, off };
    }
    return best;
  };
  const bx = pick(box.x, box.w, vs);
  const by = pick(box.y, box.h, hs);
  return {
    box: { x: bx ? round(bx.line - bx.off) : box.x, y: by ? round(by.line - by.off) : box.y, w: box.w, h: box.h },
    guides: { v: bx ? [round(bx.line)] : [], h: by ? [round(by.line)] : [] },
  };
}

// ── 검증(저장·불러오기 입력) ─────────────────────────────
export type DeckParse = { ok: true; deck: CardDeck } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const ID = /^[A-Za-z0-9_-]{1,40}$/;

function parseLayer(v: unknown, where: string, errors: string[]): CardLayer | null {
  if (!isObj(v)) return errors.push(`${where}: 객체가 아님`), null;
  const bad = (m: string) => (errors.push(`${where}: ${m}`), null);
  if (!str(v.id, 40) || !ID.test(v.id)) return bad("id");
  if (!str(v.name, DECK_LIMITS.name)) return bad("name");
  if (typeof v.hidden !== "boolean") return bad("hidden");
  for (const k of ["x", "y", "w", "h"] as const) if (!num(v[k]) || Math.abs(v[k]) > 100_000) return bad(k);
  if ((v.w as number) <= 0 || (v.h as number) <= 0) return bad("크기");
  // 예전 문서(잠금·회전·새 글자 속성 없음)는 기본값으로 읽는다
  const opt = <T>(k: string, ok: (x: unknown) => boolean, d: T): T | null => (v[k] === undefined ? d : ok(v[k]) ? (v[k] as T) : (bad(k), null));
  const locked = opt("locked", (x) => typeof x === "boolean", false);
  const rotation = opt("rotation", (x) => num(x) && Math.abs(x) <= 360, 0);
  if (locked === null || rotation === null) return null;
  const base: LayerBase = { id: v.id, name: v.name, hidden: v.hidden, locked, rotation, x: v.x as number, y: v.y as number, w: v.w as number, h: v.h as number };
  const hex = (x: unknown) => str(x, 7) && HEX.test(x);
  const unit = (x: unknown) => num(x) && x >= 0 && x <= 1;
  switch (v.kind) {
    case "image":
      if (!str(v.src, 500) || !SRC.test(v.src) || v.src.includes("..")) return bad("src(같은 출처 /api/ 주소만)");
      if (v.fit !== "cover" && v.fit !== "contain") return bad("fit");
      {
        const r = (k: string, lo: number, hi: number, d: number) => opt(k, (x) => num(x) && x >= lo && x <= hi, d);
        const posX = r("posX", 0, 1, 0.5), posY = r("posY", 0, 1, 0.5), zoom = r("zoom", 1, 4, 1);
        const brightness = r("brightness", 0, 2, 1), contrast = r("contrast", 0, 2, 1), saturation = r("saturation", 0, 2, 1), blur = r("blur", 0, 50, 0);
        if ([posX, posY, zoom, brightness, contrast, saturation, blur].some((x) => x === null)) return null;
        return { ...base, kind: "image", src: v.src, fit: v.fit, posX: posX!, posY: posY!, zoom: zoom!, brightness: brightness!, contrast: contrast!, saturation: saturation!, blur: blur! };
      }
    case "text":
      if (!str(v.text, DECK_LIMITS.text)) return bad("text");
      if (!CARD_FONTS.includes(v.font as CardFont)) return bad("font");
      if (!num(v.size) || v.size < DECK_LIMITS.size.min || v.size > DECK_LIMITS.size.max) return bad("size");
      if (!CARD_WEIGHTS.includes(v.weight as CardWeight)) return bad("weight");
      if (!str(v.color, 7) || !HEX.test(v.color)) return bad("color");
      if (!CARD_ALIGNS.includes(v.align as CardAlign)) return bad("align");
      if (!num(v.lineHeight) || v.lineHeight < 0.8 || v.lineHeight > 3) return bad("lineHeight");
      {
        const letterSpacing = opt("letterSpacing", (x) => num(x) && x >= -50 && x <= 200, 0);
        const vAlign = opt<CardVAlign>("vAlign", (x) => CARD_VALIGNS.includes(x as CardVAlign), "top");
        const margin = opt("margin", (x) => num(x) && x >= 0 && x <= 1000, 0);
        const padding = opt("padding", (x) => num(x) && x >= 0 && x <= 1000, 0);
        const boxColor = opt("boxColor", hex, "#000000");
        const boxOpacity = opt("boxOpacity", unit, 0);
        if (letterSpacing === null || vAlign === null || margin === null || padding === null || boxColor === null || boxOpacity === null) return null;
        return { ...base, kind: "text", text: v.text, font: v.font as CardFont, size: v.size, weight: v.weight as CardWeight, color: v.color.toLowerCase(), align: v.align as CardAlign, lineHeight: v.lineHeight, letterSpacing, vAlign, margin, padding, boxColor: boxColor.toLowerCase(), boxOpacity };
      }
    case "overlay": {
      if (!unit(v.opacity)) return bad("opacity");
      const color = opt("color", hex, "#000000");
      const gradient = opt<OverlayGradient>("gradient", (x) => OVERLAY_GRADIENTS.includes(x as OverlayGradient), "none");
      const gradFrom = opt("gradFrom", unit, 0);
      const gradTo = opt("gradTo", unit, 1);
      const blend = opt<BlendMode>("blend", (x) => BLEND_MODES.includes(x as BlendMode), "normal");
      if (color === null || gradient === null || gradFrom === null || gradTo === null || blend === null) return null;
      if (gradFrom >= gradTo) return bad("gradFrom < gradTo");
      return { ...base, kind: "overlay", color: color.toLowerCase(), opacity: v.opacity as number, gradient, gradFrom, gradTo, blend };
    }
    case "sticker": {
      if (!STICKER_SHAPES.includes(v.shape as StickerShape)) return bad("shape");
      if (!(hex(v.fill) || v.fill === "none") || !hex(v.labelColor)) return bad("fill");
      if (!str(v.label, 80)) return bad("label");
      if (!unit(v.opacity)) return bad("opacity");
      const sticker = opt("sticker", (x) => x === "" || isStickerId(x), "");
      const stroke = opt("stroke", hex, "#111111");
      const strokeWidth = opt("strokeWidth", (x) => num(x) && x >= 0 && x <= 60, 0);
      const radius = opt("radius", unit, 0);
      const shadow = opt("shadow", unit, 0);
      if (sticker === null || stroke === null || strokeWidth === null || radius === null || shadow === null) return null;
      return { ...base, kind: "sticker", sticker, shape: v.shape as StickerShape, fill: (v.fill as string).toLowerCase(), stroke: stroke.toLowerCase(), strokeWidth, radius, shadow, label: v.label, labelColor: (v.labelColor as string).toLowerCase(), opacity: v.opacity as number };
    }
    default:
      return bad("kind");
  }
}

/** 바깥 입력(요청 본문·DB 문서) → 덱. 모르는 칸은 버리고, 틀린 칸은 이유를 모은다 */
export function parseDeck(v: unknown): DeckParse {
  const errors: string[] = [];
  if (!isObj(v)) return { ok: false, errors: ["덱이 객체가 아님"] };
  if (!str(v.id, 40) || !ID.test(v.id)) errors.push("id");
  if (!str(v.title, DECK_LIMITS.title)) errors.push("title");
  if (!isCardPreset(v.preset)) errors.push("preset");
  if (!Array.isArray(v.cards) || v.cards.length < 1 || v.cards.length > DECK_LIMITS.cards) {
    errors.push(`cards(1~${DECK_LIMITS.cards}장)`);
    return { ok: false, errors };
  }
  const cards: DeckCard[] = [];
  const seen = new Set<string>();
  v.cards.forEach((c: unknown, i) => {
    const where = `cards[${i}]`;
    if (!isObj(c)) return void errors.push(`${where}: 객체가 아님`);
    if (!str(c.id, 40) || !ID.test(c.id)) return void errors.push(`${where}: id`);
    if (!str(c.background, 7) || !HEX.test(c.background)) return void errors.push(`${where}: background`);
    if (!Array.isArray(c.layers) || c.layers.length > DECK_LIMITS.layers) return void errors.push(`${where}: layers(최대 ${DECK_LIMITS.layers})`);
    const layers: CardLayer[] = [];
    c.layers.forEach((l: unknown, j) => {
      const layer = parseLayer(l, `${where}.layers[${j}]`, errors);
      if (!layer) return;
      if (seen.has(layer.id)) return void errors.push(`${where}.layers[${j}]: id 중복`);
      seen.add(layer.id);
      layers.push(layer);
    });
    cards.push({ id: c.id, background: c.background.toLowerCase(), layers });
  });
  const watermark = parseWatermark(v.watermark, errors);
  if (errors.length) return { ok: false, errors };
  return { ok: true, deck: { id: v.id as string, title: (v.title as string).trim() || "제목 없는 덱", preset: v.preset as CardPresetId, cards, watermark } };
}

function parseWatermark(v: unknown, errors: string[]): Watermark | null {
  if (v === undefined || v === null) return null;
  const bad = (m: string) => (errors.push(`watermark: ${m}`), null);
  if (!isObj(v)) return bad("객체가 아님");
  if (v.kind !== "text" && v.kind !== "image") return bad("kind");
  if (!str(v.text, 80)) return bad("text");
  if (!str(v.src, 500) || (v.src !== "" && (!SRC.test(v.src) || v.src.includes("..")))) return bad("src");
  if (!WATERMARK_POSITIONS.includes(v.position as WatermarkPosition)) return bad("position");
  if (!num(v.opacity) || v.opacity < 0 || v.opacity > 1) return bad("opacity");
  if (!num(v.size) || v.size < 8 || v.size > 1080) return bad("size");
  if (!str(v.color, 7) || !HEX.test(v.color)) return bad("color");
  if (typeof v.tile !== "boolean") return bad("tile");
  if (!num(v.gap) || v.gap < 40 || v.gap > 2000) return bad("gap");
  if (!num(v.angle) || Math.abs(v.angle) > 90) return bad("angle");
  return { kind: v.kind, text: v.text, src: v.src, position: v.position as WatermarkPosition, opacity: v.opacity, size: v.size, color: v.color.toLowerCase(), tile: v.tile, gap: v.gap, angle: v.angle };
}
