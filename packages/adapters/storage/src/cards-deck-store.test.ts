// [cards] 덱 저장 어댑터 — 레인 전용 테이블 규칙·왕복·낙관적 동시성·손상 행.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { addCard, createDeck, textLayer, updateCard, addLayer } from "@yunseo/domain";
import { createSqliteCardDeckStore } from "./cards-deck-store";
import { MIGRATIONS, migrate } from "./migrations";

const dbs: DatabaseSync[] = [];
const dirs: string[] = [];
afterEach(() => {
  while (dbs.length) dbs.pop()!.close();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});
const mem = () => {
  const db = new DatabaseSync(":memory:");
  dbs.push(db);
  return db;
};
const deck = () => updateCard(addCard(createDeck("d1", "덱", "4:5", "c1"), "c2"), 0, (c) => addLayer(c, textLayer("t1", "4:5", { text: "안녕" })));

describe("SQLite 덱 저장(cards_decks)", () => {
  it("레인 테이블은 cards_ 접두사이고 공용 마이그레이션 목록에 없다", () => {
    const db = mem();
    migrate(db);
    createSqliteCardDeckStore({ db });
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'cards%'").all() as { name: string }[]).map((r) => r.name);
    expect(tables).toEqual(["cards_decks"]);
    expect(MIGRATIONS.some((m) => (m.sql ?? "").includes("cards_"))).toBe(false);
    // 두 번 열어도(IF NOT EXISTS) 문제없다
    expect(() => createSqliteCardDeckStore({ db })).not.toThrow();
  });

  it("저장 → 불러오기 왕복, 목록은 최근 수정 순", async () => {
    const store = createSqliteCardDeckStore({ db: mem() });
    await store.insert(deck(), "2026-11-07T10:00:00Z");
    await store.insert(createDeck("d2", "둘째", "1:1", "x"), "2026-11-07T11:00:00Z");
    const got = await store.get("d1");
    expect(got).toEqual({ deck: deck(), revision: 1, createdAt: "2026-11-07T10:00:00Z", updatedAt: "2026-11-07T10:00:00Z" });
    expect((await store.list()).map((s) => [s.id, s.cardCount, s.preset])).toEqual([["d2", 1, "1:1"], ["d1", 2, "4:5"]]);
    expect(await store.get("nope")).toBeNull();
  });

  it("낙관적 동시성 — 읽은 버전이 낡으면 conflict, 없는 덱은 missing", async () => {
    const store = createSqliteCardDeckStore({ db: mem() });
    await store.insert(deck(), "t0");
    const ok = await store.update({ ...deck(), title: "새 제목" }, 1, "t1");
    expect(ok).toMatchObject({ ok: true, record: { revision: 2, updatedAt: "t1", deck: { title: "새 제목" } } });
    expect(await store.update(deck(), 1, "t2")).toEqual({ ok: false, reason: "conflict", revision: 2 });
    expect(await store.update({ ...deck(), id: "zz" }, 1, "t2")).toEqual({ ok: false, reason: "missing" });
    expect((await store.list())[0]!.title).toBe("새 제목");
  });

  it("손상된 문서는 없는 것으로 본다", async () => {
    const db = mem();
    const store = createSqliteCardDeckStore({ db });
    await store.insert(deck(), "t0");
    db.prepare("UPDATE cards_decks SET doc = ? WHERE id = 'd1'").run('{"id":"d1"}');
    expect(await store.get("d1")).toBeNull();
  });

  it("파일 DB — 다시 열어도 남고, 삭제된다", async () => {
    const dir = mkdtempSync(join(tmpdir(), "yunseo-cards-"));
    dirs.push(dir);
    const path = join(dir, "s.db");
    await createSqliteCardDeckStore({ path }).insert(deck(), "t0");
    const again = createSqliteCardDeckStore({ path });
    expect((await again.get("d1"))?.deck.cards).toHaveLength(2);
    expect(await again.remove("d1")).toBe(true);
    expect(await again.remove("d1")).toBe(false);
  });
});
