// [cards] 카드뉴스 편집기 덱 저장 — 레인 전용 테이블(cards_ 접두사). migrations.ts 목록에 넣지 않고 이 모듈이 IF NOT EXISTS 로 만든다.
// 덱 한 벌 = 행 하나(문서 JSON). 읽을 때 도메인 검증(parseDeck)을 다시 거쳐 손상된 행은 없는 것으로 본다.
import { DatabaseSync } from "node:sqlite";
import { parseDeck, type CardDeck } from "@yunseo/domain";
import type { CardDeckRecord, CardDeckStore, CardDeckSummary, CardDeckUpdate } from "@yunseo/application";

export const CARDS_SCHEMA = `
CREATE TABLE IF NOT EXISTS cards_decks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  preset TEXT NOT NULL,
  card_count INTEGER NOT NULL,
  doc TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- 덱 목록(GET /api/cards-decks·/cards 첫 화면)이 문서(doc, 최대 수 MB)를 읽지 않고 인덱스만으로 최근순을 읽게 한다(covering·정렬 포함)
CREATE INDEX IF NOT EXISTS cards_decks_list ON cards_decks (updated_at DESC, id, title, preset, card_count, revision);
DROP INDEX IF EXISTS cards_decks_updated;
`;

type Row = Record<string, unknown>;

export interface SqliteCardDeckStoreOptions {
  /** SQLite 파일. 없으면 메모리(프로세스가 끝나면 사라짐) */
  path?: string;
  /** 이미 열린 연결을 함께 쓸 때 */
  db?: DatabaseSync;
}

export function createSqliteCardDeckStore(options: SqliteCardDeckStoreOptions = {}): CardDeckStore {
  const db = options.db ?? new DatabaseSync(options.path ?? ":memory:");
  if (!options.db) {
    db.exec("PRAGMA busy_timeout = 5000");
    if (options.path && options.path !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  }
  db.exec(CARDS_SCHEMA);
  const q = {
    list: db.prepare("SELECT id, title, preset, card_count, revision, updated_at FROM cards_decks ORDER BY updated_at DESC, id"),
    get: db.prepare("SELECT doc, revision, created_at, updated_at FROM cards_decks WHERE id = ?"),
    insert: db.prepare("INSERT INTO cards_decks (id, title, preset, card_count, doc, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)"),
    update: db.prepare("UPDATE cards_decks SET title = ?, preset = ?, card_count = ?, doc = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?"),
    rev: db.prepare("SELECT revision FROM cards_decks WHERE id = ?"),
    remove: db.prepare("DELETE FROM cards_decks WHERE id = ?"),
  };

  const read = (id: string): CardDeckRecord | null => {
    const row = q.get.get(id) as Row | undefined;
    if (!row) return null;
    let doc: unknown;
    try {
      doc = JSON.parse(String(row.doc));
    } catch {
      return null;
    }
    const parsed = parseDeck(doc);
    if (!parsed.ok) return null;
    return { deck: parsed.deck, revision: Number(row.revision), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
  };

  return {
    async list(): Promise<CardDeckSummary[]> {
      return (q.list.all() as Row[]).map((r) => ({ id: String(r.id), title: String(r.title), preset: String(r.preset) as CardDeckSummary["preset"], cardCount: Number(r.card_count), revision: Number(r.revision), updatedAt: String(r.updated_at) }));
    },
    async get(id) {
      return read(id);
    },
    async insert(deck: CardDeck, at: string) {
      q.insert.run(deck.id, deck.title, deck.preset, deck.cards.length, JSON.stringify(deck), at, at);
      return { deck, revision: 1, createdAt: at, updatedAt: at };
    },
    async update(deck: CardDeck, expectedRevision: number, at: string): Promise<CardDeckUpdate> {
      const r = q.update.run(deck.title, deck.preset, deck.cards.length, JSON.stringify(deck), at, deck.id, expectedRevision);
      if (Number(r.changes) === 1) return { ok: true, record: read(deck.id)! };
      const now = q.rev.get(deck.id) as Row | undefined;
      return now ? { ok: false, reason: "conflict", revision: Number(now.revision) } : { ok: false, reason: "missing" };
    },
    async remove(id: string) {
      return Number(q.remove.run(id).changes) === 1;
    },
  };
}
