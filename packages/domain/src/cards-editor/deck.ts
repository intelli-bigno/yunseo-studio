// [cards] 카드뉴스 편집기 — 덱(여러 장)·카드·레이어 모델과 순수 연산.
// 좌표·크기는 전부 카드 원본 픽셀(프리셋 폭·높이 기준)이다. 화면은 비율로 줄여 그리고, PNG 내보내기는 원본 크기로 그린다.
// 레이어 배열은 아래 → 위 순서(0 이 맨 아래). 연산은 입력을 바꾸지 않고 새 값을 돌려준다.

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
export const CARD_WEIGHTS = [400, 600, 700] as const;
export type CardWeight = (typeof CARD_WEIGHTS)[number];
export const CARD_ALIGNS = ["left", "center", "right"] as const;
export type CardAlign = (typeof CARD_ALIGNS)[number];

export interface LayerBase {
  id: string;
  name: string;
  hidden: boolean;
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
}
/** 검정 반투명 덮개 */
export interface OverlayLayer extends LayerBase {
  kind: "overlay";
  opacity: number;
}
export type CardLayer = ImageLayer | TextLayer | OverlayLayer;
export type CardLayerKind = CardLayer["kind"];

export interface DeckCard {
  id: string;
  background: string;
  layers: CardLayer[];
}
export interface CardDeck {
  id: string;
  title: string;
  preset: CardPresetId;
  cards: DeckCard[];
}

export const DECK_LIMITS = { cards: 30, layers: 40, text: 2000, title: 80, name: 40, size: { min: 12, max: 400 }, minBox: 24 } as const;

const HEX = /^#[0-9a-f]{6}$/i;
const SRC = /^\/api\/[A-Za-z0-9._~\-/]+$/;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v);

// ── 만들기 ─────────────────────────────────────────────
export const blankCard = (id: string): DeckCard => ({ id, background: "#111111", layers: [] });

export function createDeck(id: string, title: string, preset: CardPresetId, cardId: string): CardDeck {
  return { id, title: title.trim().slice(0, DECK_LIMITS.title) || "제목 없는 덱", preset, cards: [blankCard(cardId)] };
}

export function textLayer(id: string, preset: CardPresetId, patch: Partial<TextLayer> = {}): TextLayer {
  const { width, height } = CARD_PRESETS[preset];
  return { id, kind: "text", name: "텍스트", hidden: false, x: 96, y: round(height * 0.4), w: width - 192, h: 240, text: "제목을 입력하세요", font: "sans", size: 72, weight: 700, color: "#ffffff", align: "left", lineHeight: 1.3, ...patch };
}

export function overlayLayer(id: string, preset: CardPresetId, opacity = 0.4): OverlayLayer {
  const { width, height } = CARD_PRESETS[preset];
  return { id, kind: "overlay", name: "검정 덮개", hidden: false, x: 0, y: 0, w: width, h: height, opacity: clamp(opacity, 0, 1) };
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
  return { id, kind: "image", name: (opts.name ?? "이미지").slice(0, DECK_LIMITS.name), hidden: false, x: round(cx - w / 2), y: round(cy - h / 2), w: round(w), h: round(h), src, fit: "cover" };
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
  const base: LayerBase = { id: v.id, name: v.name, hidden: v.hidden, x: v.x as number, y: v.y as number, w: v.w as number, h: v.h as number };
  switch (v.kind) {
    case "image":
      if (!str(v.src, 500) || !SRC.test(v.src) || v.src.includes("..")) return bad("src(같은 출처 /api/ 주소만)");
      if (v.fit !== "cover" && v.fit !== "contain") return bad("fit");
      return { ...base, kind: "image", src: v.src, fit: v.fit };
    case "text":
      if (!str(v.text, DECK_LIMITS.text)) return bad("text");
      if (!CARD_FONTS.includes(v.font as CardFont)) return bad("font");
      if (!num(v.size) || v.size < DECK_LIMITS.size.min || v.size > DECK_LIMITS.size.max) return bad("size");
      if (!CARD_WEIGHTS.includes(v.weight as CardWeight)) return bad("weight");
      if (!str(v.color, 7) || !HEX.test(v.color)) return bad("color");
      if (!CARD_ALIGNS.includes(v.align as CardAlign)) return bad("align");
      if (!num(v.lineHeight) || v.lineHeight < 0.8 || v.lineHeight > 3) return bad("lineHeight");
      return { ...base, kind: "text", text: v.text, font: v.font as CardFont, size: v.size, weight: v.weight as CardWeight, color: v.color.toLowerCase(), align: v.align as CardAlign, lineHeight: v.lineHeight };
    case "overlay":
      if (!num(v.opacity) || v.opacity < 0 || v.opacity > 1) return bad("opacity");
      return { ...base, kind: "overlay", opacity: v.opacity };
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
  if (errors.length) return { ok: false, errors };
  return { ok: true, deck: { id: v.id as string, title: (v.title as string).trim() || "제목 없는 덱", preset: v.preset as CardPresetId, cards } };
}
