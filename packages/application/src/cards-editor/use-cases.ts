// [cards] 카드뉴스 편집기 유스케이스 — 덱 목록·열기·새로 만들기·저장(검증 + 낙관적 동시성)·삭제.
import { DEFAULT_CARD_PRESET, createDeck, isCardPreset, parseDeck, type CardPresetId } from "@yunseo/domain";
import type { CardDeckRecord, CardDeckStore, CardDeckSummary } from "./ports";

export type CardDeckSave =
  | { ok: true; record: CardDeckRecord }
  | { ok: false; status: 400; errors: string[] }
  | { ok: false; status: 404 }
  | { ok: false; status: 409; revision?: number };

export interface CardDeckUseCases {
  list(): Promise<CardDeckSummary[]>;
  open(id: string): Promise<CardDeckRecord | null>;
  create(input: { title?: unknown; preset?: unknown }): Promise<CardDeckRecord>;
  /** 본문(unknown)을 검증해 저장한다. 경로의 id 와 본문의 id 가 달라도 400 */
  save(id: string, body: unknown, expectedRevision: unknown): Promise<CardDeckSave>;
  remove(id: string): Promise<boolean>;
}

export function createCardDeckUseCases(deps: { store: CardDeckStore; now: () => string; newId: () => string }): CardDeckUseCases {
  const { store, now, newId } = deps;
  return {
    list: () => store.list(),
    open: (id) => store.get(id),
    async create(input) {
      const preset: CardPresetId = isCardPreset(input.preset) ? input.preset : DEFAULT_CARD_PRESET;
      const title = typeof input.title === "string" ? input.title : "";
      return store.insert(createDeck(newId(), title, preset, newId()), now());
    },
    async save(id, body, expectedRevision) {
      if (typeof expectedRevision !== "number" || !Number.isInteger(expectedRevision) || expectedRevision < 1) return { ok: false, status: 400, errors: ["revision"] };
      const parsed = parseDeck(body);
      if (!parsed.ok) return { ok: false, status: 400, errors: parsed.errors };
      if (parsed.deck.id !== id) return { ok: false, status: 400, errors: ["id 가 주소와 다름"] };
      const r = await store.update(parsed.deck, expectedRevision, now());
      if (r.ok) return r;
      return r.reason === "missing" ? { ok: false, status: 404 } : { ok: false, status: 409, ...(r.revision !== undefined ? { revision: r.revision } : {}) };
    },
    remove: (id) => store.remove(id),
  };
}
