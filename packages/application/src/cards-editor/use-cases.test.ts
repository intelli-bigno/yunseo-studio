import { describe, expect, it } from "vitest";
import { createDeck, imageLayer, type CardDeck } from "@yunseo/domain";
import type { CardDeckRecord, CardDeckStore, CardDeckUpdate } from "./ports";
import { createCardDeckUseCases } from "./use-cases";

class FakeDeckStore implements CardDeckStore {
  rows = new Map<string, CardDeckRecord>();
  async list() {
    return [...this.rows.values()].map((r) => ({ id: r.deck.id, title: r.deck.title, preset: r.deck.preset, cardCount: r.deck.cards.length, revision: r.revision, updatedAt: r.updatedAt }));
  }
  async get(id: string) {
    return this.rows.get(id) ?? null;
  }
  async insert(deck: CardDeck, at: string) {
    const r = { deck, revision: 1, createdAt: at, updatedAt: at };
    this.rows.set(deck.id, r);
    return r;
  }
  async update(deck: CardDeck, expected: number, at: string): Promise<CardDeckUpdate> {
    const cur = this.rows.get(deck.id);
    if (!cur) return { ok: false, reason: "missing" };
    if (cur.revision !== expected) return { ok: false, reason: "conflict", revision: cur.revision };
    const r = { ...cur, deck, revision: cur.revision + 1, updatedAt: at };
    this.rows.set(deck.id, r);
    return { ok: true, record: r };
  }
  async remove(id: string) {
    return this.rows.delete(id);
  }
}

const setup = () => {
  let n = 0;
  const store = new FakeDeckStore();
  return { store, uc: createCardDeckUseCases({ store, now: () => "2026-11-07T00:00:00Z", newId: () => `n${++n}` }) };
};

describe("카드 덱 유스케이스", () => {
  it("새 덱 — 모르는 규격이면 기본 4:5, 빈 장 하나", async () => {
    const { uc } = setup();
    const r = await uc.create({ title: "덱", preset: "2:3" });
    expect(r.deck).toMatchObject({ id: "n1", title: "덱", preset: "4:5", cards: [{ id: "n2", layers: [] }] });
    expect((await uc.create({ preset: "9:16" })).deck.preset).toBe("9:16");
  });

  it("저장 — 검증 실패 400, 주소·본문 id 불일치 400, 버전 낡음 409, 없음 404", async () => {
    const { uc } = setup();
    const { deck } = await uc.create({ title: "덱" });
    expect(await uc.save(deck.id, deck, "1")).toMatchObject({ ok: false, status: 400, errors: ["revision"] });
    const bad = { ...deck, cards: [{ ...deck.cards[0]!, layers: [{ ...imageLayer("i", "4:5", "/api/a.png"), src: "http://x/a.png" }] }] };
    expect(await uc.save(deck.id, bad, 1)).toMatchObject({ ok: false, status: 400 });
    expect(await uc.save("other", deck, 1)).toMatchObject({ ok: false, status: 400 });
    expect(await uc.save(deck.id, { ...deck, title: "바뀜" }, 1)).toMatchObject({ ok: true, record: { revision: 2 } });
    expect(await uc.save(deck.id, deck, 1)).toEqual({ ok: false, status: 409, revision: 2 });
    const ghost = createDeck("ghost", "", "4:5", "c");
    expect(await uc.save("ghost", ghost, 1)).toEqual({ ok: false, status: 404 });
  });
});
