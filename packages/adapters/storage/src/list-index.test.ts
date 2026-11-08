// 목록 쿼리가 본문(doc·data, 수십 KB~수 MB)을 읽지 않고 인덱스만으로 최근순을 읽는다 — 실행 계획으로 고정한다.
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createSqliteCardDeckStore } from "./cards-deck-store";
import { createReelsProjectStore } from "./reels-projects";

const plan = (db: DatabaseSync, sql: string) => (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[]).map((r) => r.detail).join(" | ");

describe("목록 쿼리 실행 계획", () => {
  it("cards_decks: 인덱스만으로 읽고 정렬용 임시 B-tree 가 없다", () => {
    const db = new DatabaseSync(":memory:");
    createSqliteCardDeckStore({ db });
    const p = plan(db, "SELECT id, title, preset, card_count, revision, updated_at FROM cards_decks ORDER BY updated_at DESC, id");
    expect(p).toContain("COVERING INDEX cards_decks_list");
    expect(p).not.toContain("TEMP B-TREE");
    // 예전 단일 열 인덱스는 새 인덱스가 대신한다
    expect((db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'cards_decks_updated'").all() as unknown[]).length).toBe(0);
  });

  it("reels_projects: 인덱스만으로 읽고 정렬용 임시 B-tree 가 없다", () => {
    const db = new DatabaseSync(":memory:");
    createReelsProjectStore({ db });
    const p = plan(db, "SELECT id, title, revision, created_at, updated_at FROM reels_projects ORDER BY updated_at DESC, id");
    expect(p).toContain("COVERING INDEX reels_projects_list");
    expect(p).not.toContain("TEMP B-TREE");
  });

  it("기존 DB 에 다시 열어도(IF NOT EXISTS·DROP IF EXISTS) 오류 없이 같은 결과", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE cards_decks (id TEXT PRIMARY KEY, title TEXT NOT NULL, preset TEXT NOT NULL, card_count INTEGER NOT NULL, doc TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE INDEX cards_decks_updated ON cards_decks (updated_at)");
    createSqliteCardDeckStore({ db });
    createSqliteCardDeckStore({ db });
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'cards_decks'").all() as { name: string }[]).map((r) => r.name);
    expect(names).toContain("cards_decks_list");
    expect(names).not.toContain("cards_decks_updated");
  });
});
