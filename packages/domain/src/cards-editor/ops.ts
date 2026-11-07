// [cards] 카드 덱 편집 명령(op) — 사람(편집 화면)·AI(에이전트) 가 같은 JSON 명령으로 덱을 고친다. 계약: docs/13-cards-ops-schema.md.
// 릴스 ops(docs/12) 와 같은 모양 — { op: "<이름>", ... }, 실패는 코드·HTTP·path 를 가진 CardOpError, 성공은 { deck, effects }.
// 순수 함수. 적용 뒤 parseDeck 으로 덱 전체를 다시 검사해 범위·형식 위반을 INVALID_DECK 로 돌려준다(전부 아니면 전무).
import {
  CARD_PRESETS,
  DECK_LIMITS,
  addCard,
  addLayer,
  defaultWatermark,
  duplicateCard,
  duplicateLayer,
  imageLayer,
  isCardPreset,
  moveCardTo,
  moveLayer,
  moveLayerToEdge,
  overlayLayer,
  parseDeck,
  removeCard,
  removeLayer,
  stickerLayer,
  textLayer,
  updateCard,
  updateLayer,
  type CardDeck,
  type CardLayer,
  type DeckCard,
} from "./deck";
import { isStickerId } from "./sticker-library";

export type CardOpCode =
  | "BAD_REQUEST"
  | "UNKNOWN_OP"
  | "INVALID_ARGUMENT"
  | "DECK_NOT_FOUND"
  | "CARD_NOT_FOUND"
  | "LAYER_NOT_FOUND"
  | "REVISION_CONFLICT"
  | "ID_EXISTS"
  | "NOTHING_TO_UNDO"
  | "NOTHING_TO_REDO"
  | "LIMIT_EXCEEDED"
  | "INVALID_DECK"
  | "BATCH_FAILED"
  | "TOO_LARGE";

const STATUS: Record<CardOpCode, number> = {
  BAD_REQUEST: 400,
  UNKNOWN_OP: 400,
  INVALID_ARGUMENT: 400,
  DECK_NOT_FOUND: 404,
  CARD_NOT_FOUND: 404,
  LAYER_NOT_FOUND: 404,
  REVISION_CONFLICT: 409,
  ID_EXISTS: 409,
  NOTHING_TO_UNDO: 409,
  NOTHING_TO_REDO: 409,
  LIMIT_EXCEEDED: 422,
  INVALID_DECK: 422,
  BATCH_FAILED: 422,
  TOO_LARGE: 413,
};

export class CardOpError extends Error {
  readonly status: number;
  constructor(
    readonly code: CardOpCode,
    message: string,
    readonly path?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.status = STATUS[code];
  }
  toBody(): Record<string, unknown> {
    return { code: this.code, message: this.message, ...(this.path ? { path: this.path } : {}), ...(this.details ? { details: this.details } : {}) };
  }
}

/** 장 지정 — 번호(0부터) 또는 장 id */
export type CardRef = number | string;
export type LayerPatch = Partial<Omit<CardLayer, "id" | "kind">> & Record<string, unknown>;
export type NewLayer =
  | ({ kind: "text" } & LayerPatch)
  | ({ kind: "overlay" } & LayerPatch)
  | ({ kind: "image"; src: string; aspect?: number; cx?: number; cy?: number; scale?: number } & LayerPatch)
  | ({ kind: "sticker"; sticker: string; cx?: number; cy?: number } & LayerPatch);

export type CardOp =
  | { op: "set_deck"; title?: string; preset?: string; watermark?: Record<string, unknown> | null }
  | { op: "add_card"; after?: CardRef; id?: string; background?: string }
  | { op: "duplicate_card"; card: CardRef; id?: string }
  | { op: "remove_card"; card: CardRef }
  | { op: "move_card"; card: CardRef; to: number }
  | { op: "set_card"; card: CardRef; background: string }
  | { op: "add_layer"; card: CardRef; layer: NewLayer; id?: string; index?: number }
  | { op: "update_layer"; card: CardRef; layerId: string; patch: LayerPatch }
  | { op: "remove_layer"; card: CardRef; layerId: string }
  | { op: "duplicate_layer"; card: CardRef; layerId: string; id?: string }
  | { op: "reorder_layer"; card: CardRef; layerId: string; to: "front" | "back" | "forward" | "backward" | number }
  | { op: "batch"; ops: CardOp[]; label?: string }
  | { op: "undo" }
  | { op: "redo" };

export const CARD_OP_NAMES = ["set_deck", "add_card", "duplicate_card", "remove_card", "move_card", "set_card", "add_layer", "update_layer", "remove_layer", "duplicate_layer", "reorder_layer", "batch", "undo", "redo"] as const;
export const CARD_BATCH_MAX = 200;

export interface CardOpEffects {
  created: string[];
  updated: string[];
  removed: string[];
}

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const bad = (message: string, path: string) => new CardOpError("INVALID_ARGUMENT", message, path);

function cardIndex(deck: CardDeck, ref: unknown, path: string): number {
  if (typeof ref === "number") {
    if (!Number.isInteger(ref) || ref < 0 || ref >= deck.cards.length) throw new CardOpError("CARD_NOT_FOUND", `${ref}번째 장 없음(0~${deck.cards.length - 1})`, path);
    return ref;
  }
  if (typeof ref === "string") {
    const i = deck.cards.findIndex((c) => c.id === ref);
    if (i < 0) throw new CardOpError("CARD_NOT_FOUND", `장 ${ref} 없음`, path);
    return i;
  }
  throw bad("card 는 번호(0부터) 또는 장 id", path);
}

function allIds(deck: CardDeck): Set<string> {
  const s = new Set<string>();
  for (const c of deck.cards) {
    s.add(c.id);
    for (const l of c.layers) s.add(l.id);
  }
  return s;
}

function freshId(deck: CardDeck, given: unknown, newId: () => string, path: string): string {
  if (given === undefined) return newId();
  if (typeof given !== "string" || !ID.test(given)) throw bad("id 는 영숫자·_·- 1~40자", path);
  if (allIds(deck).has(given)) throw new CardOpError("ID_EXISTS", `id ${given} 이미 있음`, path);
  return given;
}

function layerOf(card: DeckCard, id: unknown, path: string): CardLayer {
  const l = typeof id === "string" ? card.layers.find((x) => x.id === id) : undefined;
  if (!l) throw new CardOpError("LAYER_NOT_FOUND", `레이어 ${String(id)} 없음`, path);
  return l;
}

const omit = (o: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

/** 패치에서 바꾸면 안 되는 칸을 걷어 낸다 */
function cleanPatch(p: unknown, path: string): Record<string, unknown> {
  if (!isObj(p)) throw bad("patch 는 객체", path);
  return omit(p, ["id", "kind"]);
}

function buildLayer(deck: CardDeck, spec: unknown, id: string): CardLayer {
  if (!isObj(spec)) throw bad("layer 는 객체", "op.layer");
  const preset = deck.preset;
  const { kind, ...props } = spec;
  const patch = cleanPatch(props, "op.layer");
  switch (kind) {
    case "text":
      return { ...textLayer(id, preset), ...patch } as CardLayer;
    case "overlay":
      return { ...overlayLayer(id, preset), ...patch } as CardLayer;
    case "image": {
      if (typeof props.src !== "string") throw bad("image 는 src(같은 출처 /api/ 주소)가 필요", "op.layer.src");
      const { aspect, cx, cy, scale } = patch;
      const rest = omit(patch, ["src", "aspect", "cx", "cy", "scale"]);
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
      const base = imageLayer(id, preset, props.src, { aspect: num(aspect), ...(num(cx) !== undefined ? { cx: num(cx)! } : {}), ...(num(cy) !== undefined ? { cy: num(cy)! } : {}), ...(num(scale) !== undefined ? { scale: num(scale)! } : {}) });
      return { ...base, ...rest } as CardLayer;
    }
    case "sticker": {
      if (!isStickerId(props.sticker)) throw bad("sticker 는 라이브러리 id(GET /api/cards/:id/ops 의 stickers)", "op.layer.sticker");
      const { cx, cy } = patch;
      const rest = omit(patch, ["sticker", "cx", "cy"]);
      const at = { ...(typeof cx === "number" ? { cx } : {}), ...(typeof cy === "number" ? { cy } : {}) };
      return { ...stickerLayer(id, preset, props.sticker, at), ...rest } as CardLayer;
    }
    default:
      throw bad("layer.kind 는 text·overlay·image·sticker", "op.layer.kind");
  }
}

/** op 하나 적용(batch 는 안을 차례로, 검증은 끝에 한 번). undo·redo 는 여기서 다루지 않는다 — 기록을 가진 쪽(유스케이스)이 한다 */
export function applyCardOp(deck: CardDeck, op: unknown, newId: () => string): { deck: CardDeck; effects: CardOpEffects } {
  const effects: CardOpEffects = { created: [], updated: [], removed: [] };
  const next = step(deck, op, newId, effects, false);
  const parsed = parseDeck(next);
  if (!parsed.ok) throw new CardOpError("INVALID_DECK", `덱 검사 실패 — ${parsed.errors.slice(0, 3).join(", ")}`, undefined, { errors: parsed.errors.slice(0, 20) });
  const uniq = (a: string[]) => [...new Set(a)];
  const removed = uniq(effects.removed);
  const created = uniq(effects.created).filter((x) => !removed.includes(x));
  return { deck: parsed.deck, effects: { created, updated: uniq(effects.updated).filter((x) => !created.includes(x) && !removed.includes(x)), removed } };
}

function step(deck: CardDeck, op: unknown, newId: () => string, fx: CardOpEffects, inBatch: boolean): CardDeck {
  if (!isObj(op) || typeof op.op !== "string") throw new CardOpError("BAD_REQUEST", "op 는 { op: \"<이름>\", ... } 객체");
  const o = op as Record<string, unknown>;
  switch (o.op) {
    case "set_deck": {
      let d = deck;
      if (o.title !== undefined) {
        if (typeof o.title !== "string" || o.title.length > DECK_LIMITS.title) throw bad(`title 1~${DECK_LIMITS.title}자`, "op.title");
        d = { ...d, title: o.title.trim() || "제목 없는 덱" };
      }
      if (o.preset !== undefined) {
        if (!isCardPreset(o.preset)) throw bad(`preset 은 ${Object.keys(CARD_PRESETS).join("·")}`, "op.preset");
        d = { ...d, preset: o.preset };
      }
      if (o.watermark !== undefined) {
        if (o.watermark === null) d = { ...d, watermark: null };
        else if (isObj(o.watermark)) d = { ...d, watermark: { ...(d.watermark ?? defaultWatermark()), ...o.watermark } as CardDeck["watermark"] };
        else throw bad("watermark 는 객체 또는 null", "op.watermark");
      }
      fx.updated.push(deck.id);
      return d;
    }
    case "add_card": {
      if (deck.cards.length >= DECK_LIMITS.cards) throw new CardOpError("LIMIT_EXCEEDED", `장은 최대 ${DECK_LIMITS.cards}장`);
      const after = o.after === undefined ? deck.cards.length - 1 : cardIndex(deck, o.after, "op.after");
      const id = freshId(deck, o.id, newId, "op.id");
      let d = addCard(deck, id, after);
      if (o.background !== undefined) {
        if (typeof o.background !== "string" || !HEX.test(o.background)) throw bad("background 는 #rrggbb", "op.background");
        d = updateCard(d, after + 1, (c) => ({ ...c, background: (o.background as string).toLowerCase() }));
      }
      fx.created.push(id);
      return d;
    }
    case "duplicate_card": {
      if (deck.cards.length >= DECK_LIMITS.cards) throw new CardOpError("LIMIT_EXCEEDED", `장은 최대 ${DECK_LIMITS.cards}장`);
      const i = cardIndex(deck, o.card, "op.card");
      const first = freshId(deck, o.id, newId, "op.id");
      let used = false;
      const d = duplicateCard(deck, i, () => (used ? newId() : ((used = true), first)));
      fx.created.push(d.cards[i + 1]!.id, ...d.cards[i + 1]!.layers.map((l) => l.id));
      return d;
    }
    case "remove_card": {
      const i = cardIndex(deck, o.card, "op.card");
      if (deck.cards.length <= 1) throw new CardOpError("LIMIT_EXCEEDED", "마지막 한 장은 지울 수 없다", "op.card");
      const c = deck.cards[i]!;
      fx.removed.push(c.id, ...c.layers.map((l) => l.id));
      return removeCard(deck, i);
    }
    case "move_card": {
      const i = cardIndex(deck, o.card, "op.card");
      if (typeof o.to !== "number" || !Number.isInteger(o.to) || o.to < 0 || o.to >= deck.cards.length) throw bad(`to 는 0~${deck.cards.length - 1}`, "op.to");
      fx.updated.push(deck.cards[i]!.id);
      return moveCardTo(deck, i, o.to);
    }
    case "set_card": {
      const i = cardIndex(deck, o.card, "op.card");
      if (typeof o.background !== "string" || !HEX.test(o.background)) throw bad("background 는 #rrggbb", "op.background");
      fx.updated.push(deck.cards[i]!.id);
      return updateCard(deck, i, (c) => ({ ...c, background: (o.background as string).toLowerCase() }));
    }
    case "add_layer": {
      const i = cardIndex(deck, o.card, "op.card");
      if (deck.cards[i]!.layers.length >= DECK_LIMITS.layers) throw new CardOpError("LIMIT_EXCEEDED", `한 장에 레이어 최대 ${DECK_LIMITS.layers}개`);
      const id = freshId(deck, o.id, newId, "op.id");
      const layer = buildLayer(deck, o.layer, id);
      let d = updateCard(deck, i, (c) => addLayer(c, layer));
      if (o.index !== undefined) {
        const n = d.cards[i]!.layers.length;
        if (typeof o.index !== "number" || !Number.isInteger(o.index) || o.index < 0 || o.index >= n) throw bad(`index 는 0~${n - 1}(0 = 맨 아래)`, "op.index");
        d = updateCard(d, i, (c) => moveLayer(c, id, (o.index as number) - (n - 1)));
      }
      fx.created.push(id);
      return d;
    }
    case "update_layer": {
      const i = cardIndex(deck, o.card, "op.card");
      const l = layerOf(deck.cards[i]!, o.layerId, "op.layerId");
      const patch = cleanPatch(o.patch, "op.patch");
      fx.updated.push(l.id);
      return updateCard(deck, i, (c) => updateLayer(c, l.id, patch as Partial<CardLayer>));
    }
    case "remove_layer": {
      const i = cardIndex(deck, o.card, "op.card");
      const l = layerOf(deck.cards[i]!, o.layerId, "op.layerId");
      fx.removed.push(l.id);
      return updateCard(deck, i, (c) => removeLayer(c, l.id));
    }
    case "duplicate_layer": {
      const i = cardIndex(deck, o.card, "op.card");
      const l = layerOf(deck.cards[i]!, o.layerId, "op.layerId");
      if (deck.cards[i]!.layers.length >= DECK_LIMITS.layers) throw new CardOpError("LIMIT_EXCEEDED", `한 장에 레이어 최대 ${DECK_LIMITS.layers}개`);
      const id = freshId(deck, o.id, newId, "op.id");
      fx.created.push(id);
      return updateCard(deck, i, (c) => duplicateLayer(c, l.id, id));
    }
    case "reorder_layer": {
      const i = cardIndex(deck, o.card, "op.card");
      const card = deck.cards[i]!;
      const l = layerOf(card, o.layerId, "op.layerId");
      const to = o.to;
      fx.updated.push(l.id);
      if (to === "front" || to === "back") return updateCard(deck, i, (c) => moveLayerToEdge(c, l.id, to === "front" ? 1 : -1));
      if (to === "forward" || to === "backward") return updateCard(deck, i, (c) => moveLayer(c, l.id, to === "forward" ? 1 : -1));
      if (typeof to === "number" && Number.isInteger(to) && to >= 0 && to < card.layers.length) return updateCard(deck, i, (c) => moveLayer(c, l.id, to - c.layers.findIndex((x) => x.id === l.id)));
      throw bad(`to 는 front·back·forward·backward 또는 0~${card.layers.length - 1}`, "op.to");
    }
    case "batch": {
      if (inBatch) throw bad("batch 안에 batch 금지", "op.ops");
      if (!Array.isArray(o.ops) || o.ops.length === 0) throw bad("ops 는 op 배열(1개 이상)", "op.ops");
      if (o.ops.length > CARD_BATCH_MAX) throw new CardOpError("TOO_LARGE", `batch 는 최대 ${CARD_BATCH_MAX}개`);
      let d = deck;
      o.ops.forEach((inner, index) => {
        if (isObj(inner) && (inner.op === "undo" || inner.op === "redo")) throw new CardOpError("BATCH_FAILED", `${index}번째: batch 안 undo·redo 금지`, `op.ops[${index}]`, { index });
        try {
          d = step(d, inner, newId, fx, true);
        } catch (e) {
          if (e instanceof CardOpError) throw new CardOpError("BATCH_FAILED", `${index}번째 op 실패 — ${e.message}`, `op.ops[${index}]`, { index, cause: e.toBody() });
          throw e;
        }
      });
      return d;
    }
    case "undo":
    case "redo":
      throw new CardOpError("BAD_REQUEST", "undo·redo 는 기록이 있는 쪽(서버 유스케이스)에서만");
    default:
      throw new CardOpError("UNKNOWN_OP", `모르는 op ${String(o.op)} — ${CARD_OP_NAMES.join("·")}`, "op.op");
  }
}
