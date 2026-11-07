import { describe, expect, it } from "vitest";
import { cardSrc, frameKind, slidesOf } from "./thumbs";

describe("목록 썸네일 계산", () => {
  it("카드 수로 그림 자리 모양을 고른다 — 0 자리 표시 · 1 한 장 · 2+ 넘겨 보기", () => {
    expect(frameKind(0)).toBe("blank");
    expect(frameKind(1)).toBe("single");
    expect(frameKind(2)).toBe("carousel");
    expect(frameKind(8)).toBe("carousel");
  });

  it("장 주소는 1부터 센다", () => {
    expect(cardSrc("P-261105-k3x9", 1)).toBe("/api/pieces/P-261105-k3x9/cards/1");
  });

  it("카드 수만큼 장을 만들고 대체 텍스트가 비면 제목 + 번호로 채운다", () => {
    const s = slidesOf("A-1", "FOMC 전", { cards: 3, alts: ["표지", " ", ""] });
    expect(s.map((x) => x.src)).toEqual(["/api/pieces/A-1/cards/1", "/api/pieces/A-1/cards/2", "/api/pieces/A-1/cards/3"]);
    expect(s.map((x) => x.alt)).toEqual(["표지", "FOMC 전 2", "FOMC 전 3"]);
  });

  it("카드가 없으면 장도 없다", () => {
    expect(slidesOf("A-1", "t", { cards: 0, alts: [] })).toEqual([]);
  });
});
