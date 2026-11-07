import { describe, expect, it } from "vitest";
import { recentCards } from "./recent-cards";

describe("최근 카드뉴스", () => {
  it("덱·렌더본을 최신순으로 합치고, 렌더 전 편은 뺀다", () => {
    const r = recentCards(
      [{ id: "d1", updatedAt: "2026-11-07T10:00:00Z" }, { id: "d2", updatedAt: "2026-11-01T10:00:00Z" }],
      [{ piece: "p1", at: "2026-11-05T00:00:00+09:00", cards: 8 }, { piece: "p0", at: "2026-11-09T00:00:00+09:00", cards: 0 }],
    );
    expect(r.map((x) => (x.kind === "deck" ? x.deck.id : x.piece))).toEqual(["d1", "p1", "d2"]);
  });
  it("개수 상한", () => {
    expect(recentCards([{ updatedAt: "2026-01-01" }, { updatedAt: "2026-01-02" }], [], 1)).toHaveLength(1);
  });
});
