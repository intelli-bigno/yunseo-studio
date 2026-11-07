import { describe, expect, it } from "vitest";
import { createDeck, parseDeck, type CardDeck } from "./deck";
import { CardOpError, applyCardOp } from "./ops";
import { STICKER_DEFS, STICKER_GROUPS, librarySvg } from "./sticker-library";
import { stickerDataUrl } from "./sticker-svg";

const ids = () => {
  let n = 0;
  return () => `n${++n}`;
};
const deck = (): CardDeck => createDeck("d1", "덱", "4:5", "c1");
const err = (fn: () => unknown): CardOpError => {
  try {
    fn();
  } catch (e) {
    if (e instanceof CardOpError) return e;
    throw e;
  }
  throw new Error("오류가 나지 않음");
};

describe("카드 ops — 장", () => {
  it("add_card(id 지정)·duplicate·move·remove", () => {
    const nid = ids();
    let d = applyCardOp(deck(), { op: "add_card", id: "c2", background: "#FF0000" }, nid).deck;
    expect(d.cards.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(d.cards[1]!.background).toBe("#ff0000");
    const r = applyCardOp(d, { op: "duplicate_card", card: "c1", id: "c1b" }, nid);
    expect(r.deck.cards.map((c) => c.id)).toEqual(["c1", "c1b", "c2"]);
    expect(r.effects.created).toContain("c1b");
    d = applyCardOp(r.deck, { op: "move_card", card: "c2", to: 0 }, nid).deck;
    expect(d.cards.map((c) => c.id)).toEqual(["c2", "c1", "c1b"]);
    d = applyCardOp(d, { op: "remove_card", card: 0 }, nid).deck;
    expect(d.cards.map((c) => c.id)).toEqual(["c1", "c1b"]);
  });

  it("마지막 장 삭제·없는 장·중복 id 는 거절", () => {
    expect(err(() => applyCardOp(deck(), { op: "remove_card", card: 0 }, ids())).code).toBe("LIMIT_EXCEEDED");
    expect(err(() => applyCardOp(deck(), { op: "set_card", card: 3, background: "#000000" }, ids())).code).toBe("CARD_NOT_FOUND");
    expect(err(() => applyCardOp(deck(), { op: "add_card", id: "c1" }, ids())).code).toBe("ID_EXISTS");
    expect(err(() => applyCardOp(deck(), { op: "fly" }, ids())).code).toBe("UNKNOWN_OP");
  });
});

describe("카드 ops — 레이어", () => {
  it("batch 로 장 만들고 텍스트·덮개·스티커를 같은 명령으로 놓는다", () => {
    const r = applyCardOp(
      deck(),
      {
        op: "batch",
        ops: [
          { op: "add_card", id: "c2" },
          { op: "add_layer", card: "c2", id: "o1", layer: { kind: "overlay", gradient: "to-top", gradFrom: 0, gradTo: 0.6, opacity: 0.8, blend: "multiply" } },
          { op: "add_layer", card: "c2", id: "t1", layer: { kind: "text", text: "FOMC 정리", size: 96, align: "center" } },
          { op: "add_layer", card: "c2", id: "s1", layer: { kind: "sticker", sticker: "num-up", label: "+3.1%", cx: 540, cy: 200 } },
          { op: "update_layer", card: "c2", layerId: "t1", patch: { color: "#FFE14D", id: "hack" } },
          { op: "reorder_layer", card: "c2", layerId: "s1", to: "back" },
        ],
      },
      ids(),
    );
    const c = r.deck.cards[1]!;
    expect(c.layers.map((l) => l.id)).toEqual(["s1", "o1", "t1"]);
    expect(c.layers[2]).toMatchObject({ kind: "text", color: "#ffe14d", size: 96 });
    expect(c.layers[1]).toMatchObject({ kind: "overlay", gradient: "to-top", blend: "multiply" });
    expect(c.layers[0]).toMatchObject({ kind: "sticker", sticker: "num-up", label: "+3.1%" });
    expect(r.effects.created).toEqual(expect.arrayContaining(["c2", "o1", "t1", "s1"]));
    // 처음 장은 그대로(장마다 독립)
    expect(r.deck.cards[0]!.layers).toEqual([]);
  });

  it("범위 밖 값은 덱 검사(INVALID_DECK)로, batch 실패는 몇 번째인지 알린다", () => {
    const d = applyCardOp(deck(), { op: "add_layer", card: 0, id: "t1", layer: { kind: "text" } }, ids()).deck;
    expect(err(() => applyCardOp(d, { op: "update_layer", card: 0, layerId: "t1", patch: { size: 9999 } }, ids())).code).toBe("INVALID_DECK");
    const e = err(() => applyCardOp(d, { op: "batch", ops: [{ op: "set_card", card: 0, background: "#000000" }, { op: "remove_layer", card: 0, layerId: "nope" }] }, ids()));
    expect(e.code).toBe("BATCH_FAILED");
    expect(e.details).toMatchObject({ index: 1 });
    expect(err(() => applyCardOp(d, { op: "add_layer", card: 0, layer: { kind: "sticker", sticker: "없음" } }, ids())).code).toBe("INVALID_ARGUMENT");
    expect(err(() => applyCardOp(d, { op: "add_layer", card: 0, layer: { kind: "image", src: "https://x/y.png" } }, ids())).code).toBe("INVALID_DECK");
  });

  it("set_deck — 제목·규격·워터마크", () => {
    const d = applyCardOp(deck(), { op: "set_deck", title: "새 제목", preset: "1:1", watermark: { text: "@ys", tile: true } }, ids()).deck;
    expect(d).toMatchObject({ title: "새 제목", preset: "1:1", watermark: { text: "@ys", tile: true } });
  });
});

describe("스티커 라이브러리", () => {
  it("40종 이상, 갈래마다 하나 이상, id 는 겹치지 않는다", () => {
    expect(STICKER_DEFS.length).toBeGreaterThanOrEqual(40);
    for (const g of STICKER_GROUPS) expect(STICKER_DEFS.some((s) => s.group === g)).toBe(true);
    expect(new Set(STICKER_DEFS.map((s) => s.id)).size).toBe(STICKER_DEFS.length);
  });

  it("모든 스티커가 기본값·조정값(테두리·모서리·그림자)으로 올바른 SVG 를 낸다", () => {
    for (const s of STICKER_DEFS) {
      for (const look of [s.look, { ...s.look, strokeWidth: 6, radius: 1, shadow: 0.6, label: s.hasLabel ? "두 줄\n<글자>" : "" }]) {
        const svg = librarySvg(s.id, { ...look, w: 400, h: Math.round(400 / s.aspect) });
        expect(svg, s.id).toMatch(/^<svg [^>]*viewBox="0 0 400 \d+">.*<\/svg>$/s);
        expect(svg, s.id).not.toMatch(/NaN|undefined|Infinity/);
        expect(svg, s.id).not.toContain("<글자>");
      }
    }
  });

  it("레이어 그림은 라이브러리 id 가 있으면 새 그림, 없으면 예전 도형", () => {
    expect(decodeURIComponent(stickerDataUrl({ sticker: "stamp-round", shape: "rect", fill: "none", label: "OK", labelColor: "#d64545", w: 200, h: 200 }))).toContain("OK");
    expect(decodeURIComponent(stickerDataUrl({ shape: "star", fill: "#ff0000", label: "", labelColor: "#ffffff", w: 100, h: 100 }))).toContain("polygon");
  });

  it("새 칸(스티커·덮개·이미지)이 저장 왕복된다", () => {
    const d = applyCardOp(deck(), { op: "batch", ops: [{ op: "add_layer", card: 0, id: "s", layer: { kind: "sticker", sticker: "tag-pill", shadow: 0.4, radius: 0.5 } }, { op: "add_layer", card: 0, id: "i", layer: { kind: "image", src: "/api/cards/a.png", zoom: 2, blur: 4 } }] }, ids()).deck;
    const r = parseDeck(JSON.parse(JSON.stringify(d)));
    expect(r.ok && r.deck).toEqual(d);
  });
});
