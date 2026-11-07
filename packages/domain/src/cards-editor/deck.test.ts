import { describe, expect, it } from "vitest";
import {
  CARD_PRESETS,
  addCard,
  addLayer,
  createDeck,
  dragBox,
  duplicateCard,
  imageLayer,
  moveCard,
  moveLayer,
  overlayLayer,
  parseDeck,
  removeCard,
  removeLayer,
  textLayer,
  toggleLayerHidden,
  updateLayer,
  type CardDeck,
} from "./deck";
import { wrapText } from "./wrap";

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

const base = (): CardDeck => {
  const deck = createDeck("d1", "  첫 덱  ", "4:5", "c1");
  return { ...deck, cards: [{ ...deck.cards[0]!, layers: [overlayLayer("o1", "4:5"), textLayer("t1", "4:5")] }] };
};

describe("덱 — 장 연산", () => {
  it("만들 때 제목을 다듬고 빈 장 하나로 시작한다", () => {
    const d = createDeck("d", "   ", "1:1", "c");
    expect(d.title).toBe("제목 없는 덱");
    expect(d.cards).toHaveLength(1);
  });

  it("추가·복제·삭제·순서", () => {
    const next = ids();
    let d = addCard(base(), "c2");
    expect(d.cards.map((c) => c.id)).toEqual(["c1", "c2"]);
    d = duplicateCard(d, 0, next);
    expect(d.cards.map((c) => c.id)).toEqual(["c1", "id1", "c2"]);
    // 복제본 레이어는 새 id, 내용은 같다
    expect(d.cards[1]!.layers.map((l) => l.id)).toEqual(["id2", "id3"]);
    expect(d.cards[1]!.layers[1]).toMatchObject({ kind: "text", text: "제목을 입력하세요" });
    d = moveCard(d, 2, -2);
    expect(d.cards.map((c) => c.id)).toEqual(["c2", "c1", "id1"]);
    expect(moveCard(d, 0, -1)).toBe(d); // 범위 밖은 그대로
    d = removeCard(d, 0);
    expect(d.cards.map((c) => c.id)).toEqual(["c1", "id1"]);
  });

  it("마지막 한 장은 지우지 않는다", () => {
    const d = base();
    expect(removeCard(d, 0)).toBe(d);
  });

  it("입력을 바꾸지 않는다", () => {
    const d = base();
    const snapshot = JSON.stringify(d);
    addCard(d, "x");
    moveLayer(d.cards[0]!, "o1", 1);
    expect(JSON.stringify(d)).toBe(snapshot);
  });
});

describe("레이어 연산", () => {
  it("올리기·내리기·숨김·삭제·수정", () => {
    let c = base().cards[0]!;
    c = addLayer(c, imageLayer("i1", "4:5", "/api/cards/01.png"));
    expect(c.layers.map((l) => l.id)).toEqual(["o1", "t1", "i1"]); // 새 레이어는 맨 위
    c = moveLayer(c, "i1", -2);
    expect(c.layers.map((l) => l.id)).toEqual(["i1", "o1", "t1"]);
    expect(moveLayer(c, "t1", 1)).toBe(c);
    c = toggleLayerHidden(c, "o1");
    expect(c.layers[1]!.hidden).toBe(true);
    c = updateLayer(c, "t1", { text: "바뀜", kind: "overlay" } as never);
    expect(c.layers[2]).toMatchObject({ kind: "text", text: "바뀜" }); // kind 는 못 바꾼다
    c = removeLayer(c, "o1");
    expect(c.layers.map((l) => l.id)).toEqual(["i1", "t1"]);
  });

  it("이미지는 비율을 지키며 카드 안에 들어간다", () => {
    const tall = imageLayer("i", "4:5", "/api/x.png", { aspect: 0.25 });
    expect(tall.h).toBe(CARD_PRESETS["4:5"].height);
    expect(tall.w).toBe(Math.round(1350 * 0.25));
    const wide = imageLayer("i", "4:5", "/api/x.png", { aspect: 2, cx: 540, cy: 675 });
    expect(wide).toMatchObject({ w: 1080, h: 540, x: 0, y: 405 });
  });
});

describe("끌기·크기 조절", () => {
  const box = { x: 100, y: 100, w: 400, h: 200 };
  it("이동은 카드 밖으로 완전히 나가지 않는다", () => {
    expect(dragBox(box, "move", 50, -20, "4:5")).toEqual({ x: 150, y: 80, w: 400, h: 200 });
    expect(dragBox(box, "move", 5000, 5000, "4:5")).toEqual({ x: 1080 - 24, y: 1350 - 24, w: 400, h: 200 });
  });
  it("모서리·변 끌기 — 반대편 모서리는 고정, 최소 크기", () => {
    expect(dragBox(box, "se", 100, 50, "4:5")).toEqual({ x: 100, y: 100, w: 500, h: 250 });
    expect(dragBox(box, "nw", 100, 50, "4:5")).toEqual({ x: 200, y: 150, w: 300, h: 150 });
    expect(dragBox(box, "w", 1000, 0, "4:5")).toEqual({ x: 476, y: 100, w: 24, h: 200 });
  });
  it("비율 유지 모서리 끌기", () => {
    expect(dragBox(box, "se", 200, 0, "4:5", true)).toEqual({ x: 100, y: 100, w: 600, h: 300 });
  });
});

describe("parseDeck — 저장 입력 검증", () => {
  it("올바른 덱은 그대로 통과한다(왕복)", () => {
    const d = base();
    const r = parseDeck(JSON.parse(JSON.stringify(d)));
    expect(r).toEqual({ ok: true, deck: { ...d, title: "첫 덱" } });
  });

  it("다른 출처 이미지·틀린 색·중복 id·규격 밖 값을 막는다", () => {
    const d = base();
    const card = d.cards[0]!;
    const bad = {
      ...d,
      preset: "3:2",
      cards: [
        {
          ...card,
          background: "red",
          layers: [{ ...imageLayer("i1", "4:5", "/api/a.png"), src: "https://evil.example/a.png" }, { ...textLayer("t2", "4:5"), color: "#fff" }, textLayer("t1", "4:5"), textLayer("t1", "4:5"), { ...overlayLayer("o", "4:5"), opacity: 2 }],
        },
      ],
    };
    const r = parseDeck(bad);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual(expect.arrayContaining(["preset", "cards[0]: background"]));
    const r2 = parseDeck({ ...bad, preset: "4:5", cards: [{ ...bad.cards[0], background: "#000000" }] });
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.errors.join("\n")).toMatch(/layers\[0\]: src/);
    expect(r2.errors.join("\n")).toMatch(/layers\[1\]: color/);
    expect(r2.errors.join("\n")).toMatch(/layers\[3\]: id 중복/);
    expect(r2.errors.join("\n")).toMatch(/layers\[4\]: opacity/);
  });

  it("경로 탈출 src 를 막는다", () => {
    const d = base();
    const r = parseDeck({ ...d, cards: [{ ...d.cards[0], layers: [imageLayer("i", "4:5", "/api/../etc/passwd")] }] });
    expect(r.ok).toBe(false);
  });

  it("장 수 0 이나 객체가 아닌 입력", () => {
    expect(parseDeck(null).ok).toBe(false);
    expect(parseDeck({ ...base(), cards: [] }).ok).toBe(false);
  });
});

describe("wrapText — 내보내기 줄바꿈", () => {
  const measure = (s: string) => [...s].length * 10; // 한 글자 10
  it("공백에서 나누고, 줄바꿈 문자를 지킨다", () => {
    expect(wrapText("가나 다라 마바", 50, measure)).toEqual(["가나 다라", "마바"]);
    expect(wrapText("한 줄\n\n둘", 100, measure)).toEqual(["한 줄", "", "둘"]);
  });
  it("공백 없는 긴 낱말은 글자 단위로 자른다", () => {
    expect(wrapText("가나다라마바사", 30, measure)).toEqual(["가나다", "라마바", "사"]);
    expect(wrapText("ab 가나다라마바", 30, measure)).toEqual(["ab", "가나다", "라마바"]);
  });
});
