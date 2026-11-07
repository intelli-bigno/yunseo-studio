import { describe, expect, it } from "vitest";
import { createDeck, type CardDeck } from "@yunseo/domain";
import type { CardDeckRecord, CardDeckStore, CardDeckUpdate } from "./ports";
import { createCardOpsUseCases } from "./ops";

class Store implements CardDeckStore {
  rows = new Map<string, CardDeckRecord>();
  async list() {
    return [];
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

async function setup() {
  const store = new Store();
  await store.insert(createDeck("d1", "덱", "4:5", "c1"), "t0");
  let n = 0;
  return { store, uc: createCardOpsUseCases({ store, now: () => "t", newId: () => `x${++n}` }) };
}

describe("카드 ops 유스케이스", () => {
  it("적용·저장 → revision +1, 낡은 revision 은 409", async () => {
    const { uc, store } = await setup();
    const r = await uc.postOp("d1", { revision: 1, op: { op: "add_card", id: "c2" } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ revision: 2, opId: "op-000002", effects: { created: ["c2"] }, undo: { available: true, redo: false } });
    expect((await store.get("d1"))!.deck.cards).toHaveLength(2);
    const stale = await uc.postOp("d1", { revision: 1, op: { op: "add_card" } });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: { code: "REVISION_CONFLICT" }, revision: 2 });
  });

  it("undo·redo·dryRun·멱등 requestId", async () => {
    const { uc, store } = await setup();
    await uc.postOp("d1", { revision: 1, op: { op: "add_card", id: "c2" }, requestId: "r1" });
    const again = await uc.postOp("d1", { revision: 1, op: { op: "add_card", id: "c2" }, requestId: "r1" });
    expect(again.body.revision).toBe(2);
    const dry = await uc.postOp("d1", { revision: 2, op: { op: "remove_card", card: "c2" }, dryRun: true });
    expect(dry.body).toMatchObject({ dryRun: true, revision: 2 });
    expect((await store.get("d1"))!.deck.cards).toHaveLength(2);
    const u = await uc.postOp("d1", { revision: 2, op: { op: "undo" } });
    expect(u.body).toMatchObject({ revision: 3, undo: { available: false, redo: true } });
    expect((await store.get("d1"))!.deck.cards).toHaveLength(1);
    const rd = await uc.postOp("d1", { revision: 3, op: { op: "redo" } });
    expect(rd.status).toBe(200);
    expect((await store.get("d1"))!.deck.cards).toHaveLength(2);
    expect((await uc.postOp("d1", { revision: 4, op: { op: "redo" } })).body).toMatchObject({ error: { code: "NOTHING_TO_REDO" } });
  });

  it("없는 덱 404·모양 틀림 400·GET 은 스티커 목록을 준다", async () => {
    const { uc } = await setup();
    expect((await uc.postOp("zz", { revision: 1, op: { op: "add_card" } })).status).toBe(404);
    expect((await uc.postOp("d1", { op: {} })).status).toBe(400);
    const g = await uc.getState("d1");
    expect(g.status).toBe(200);
    expect((g.body.stickers as unknown[]).length).toBeGreaterThanOrEqual(40);
  });
});
