// 빈 카드 구분 — 빈 캔버스·썸네일은 안내 한 줄과 틀(is-empty)이 붙고, 레이어가 있으면 붙지 않는다.
// 안내는 화면 전용이라 PNG 내보내기(drawCard)에는 들어가지 않는다.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { addLayer, blankCard, textLayer } from "@yunseo/domain";
import { drawCard, type Ctx2D } from "../lib/cards-export";
import { CardView, EMPTY_HINT, EMPTY_HINT_MINI } from "./CardView";

const render = (card = blankCard("c"), mini = false) => renderToStaticMarkup(createElement(CardView, { card, preset: "4:5", mini }));

describe("빈 카드 안내", () => {
  it("빈 캔버스는 가운데 안내 한 줄과 틀 클래스가 붙는다", () => {
    const html = render();
    expect(html).toContain("is-empty");
    expect(html.match(/ui-canvas-empty-text/g)).toHaveLength(1);
    expect(html).toContain(EMPTY_HINT);
    expect(EMPTY_HINT).toBe("이미지를 끌어오거나 텍스트 추가");
  });

  it("빈 썸네일(mini)은 짧은 글자만 붙고 보조기기에는 숨긴다", () => {
    const html = render(blankCard("c"), true);
    expect(html).toContain("is-mini");
    expect(html).toContain("is-empty");
    expect(html).toContain(EMPTY_HINT_MINI);
    expect(html).not.toContain(EMPTY_HINT);
    expect(html).toContain('aria-hidden="true"');
  });

  it("레이어가 있으면 안내도 틀 클래스도 없다", () => {
    const card = addLayer(blankCard("c"), textLayer("t", "4:5", { x: 0, y: 0, w: 100, size: 20, text: "가나다" }));
    const html = render(card);
    expect(html).not.toContain("is-empty");
    expect(html).not.toContain("ui-canvas-empty");
  });

  it("PNG 내보내기에는 안내 글자도 테두리도 들어가지 않는다", async () => {
    const calls: string[] = [];
    const ctx: Ctx2D = {
      fillStyle: "",
      globalAlpha: 1,
      font: "",
      textAlign: "left",
      textBaseline: "top",
      fillRect: (x, y, w, h) => void calls.push(`fillRect ${ctx.fillStyle} ${x},${y},${w},${h}`),
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      rect: () => {},
      clip: () => {},
      drawImage: () => void calls.push("drawImage"),
      fillText: (t) => void calls.push(`fillText ${t}`),
      measureText: (t) => ({ width: [...t].length * 10 }),
      translate: () => {},
      rotate: () => {},
    };
    await drawCard(ctx, blankCard("c"), "4:5", { load: async () => null, family: () => "Sans" });
    expect(calls).toEqual(["fillRect #111111 0,0,1080,1350"]); // 바탕 한 번뿐 — 글자·선·겹침 없음
  });
});
