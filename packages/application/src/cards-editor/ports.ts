// [cards] 카드뉴스 편집기 저장 포트 — 덱 한 벌을 문서 하나로 저장한다(낙관적 동시성: revision).
import type { CardDeck, CardPresetId } from "@yunseo/domain";

export interface CardDeckRecord {
  deck: CardDeck;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface CardDeckSummary {
  id: string;
  title: string;
  preset: CardPresetId;
  cardCount: number;
  revision: number;
  updatedAt: string;
}

export type CardDeckUpdate = { ok: true; record: CardDeckRecord } | { ok: false; reason: "missing" | "conflict"; revision?: number };

export interface CardDeckStore {
  /** 최근 수정 순 */
  list(): Promise<CardDeckSummary[]>;
  get(id: string): Promise<CardDeckRecord | null>;
  insert(deck: CardDeck, at: string): Promise<CardDeckRecord>;
  /** expectedRevision 이 지금 값과 다르면 conflict — 다른 창에서 먼저 저장했다 */
  update(deck: CardDeck, expectedRevision: number, at: string): Promise<CardDeckUpdate>;
  remove(id: string): Promise<boolean>;
}
