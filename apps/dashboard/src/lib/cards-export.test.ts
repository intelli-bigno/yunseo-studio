import { describe, expect, it } from "vitest";
import { addLayer, blankCard, defaultWatermark, imageLayer, overlayLayer, stickerLayer, textLayer } from "@yunseo/domain";
import { drawCard, exportName, fitImage, type Ctx2D } from "./cards-export";

function recorder() {
  const calls: string[] = [];
  const ctx: Ctx2D = {
    fillStyle: "",
    globalAlpha: 1,
    font: "",
    textAlign: "left",
    textBaseline: "top",
    fillRect: (x, y, w, h) => void calls.push(`fillRect ${ctx.fillStyle} a=${ctx.globalAlpha} ${x},${y},${w},${h}`),
    save: () => void calls.push("save"),
    restore: () => void calls.push("restore"),
    beginPath: () => {},
    rect: () => {},
    clip: () => {},
    drawImage: (_i, ...n) => void calls.push(`drawImage ${n.map((v) => Math.round(v)).join(",")}`),
    fillText: (t, x, y) => void calls.push(`fillText ${t} ${x},${y} ${ctx.font} ${ctx.textAlign}`),
    measureText: (t) => ({ width: [...t].length * 10 }),
    translate: (x, y) => void calls.push(`translate ${x},${y}`),
    rotate: (r) => void calls.push(`rotate ${r.toFixed(2)}`),
  };
  return { ctx, calls };
}

describe("PNG 내보내기 — 카드 그리기", () => {
  it("바탕 → 레이어 아래부터, 숨긴 레이어는 건너뛴다", async () => {
    let card = blankCard("c");
    card = addLayer(card, imageLayer("i", "1:1", "/api/a.png", { aspect: 1 }));
    card = addLayer(card, { ...overlayLayer("o", "1:1", 0.5), hidden: true });
    card = addLayer(card, overlayLayer("o2", "1:1", 0.3));
    card = addLayer(card, textLayer("t", "1:1", { x: 100, y: 100, w: 50, size: 20, lineHeight: 1.5, text: "가나다라마", align: "center", font: "serif", weight: 600 }));
    const { ctx, calls } = recorder();
    await drawCard(ctx, card, "1:1", { load: async () => ({ img: {}, width: 200, height: 100 }), family: (f) => (f === "serif" ? "Serif" : "Sans") });
    expect(calls).toEqual([
      "fillRect #111111 a=1 0,0,1080,1080",
      "save",
      "drawImage 50,0,100,100,0,0,1080,1080", // 가로로 긴 그림을 정사각 상자에 cover — 가운데를 자른다
      "restore",
      "save",
      "fillRect #000000 a=0.3 0,0,1080,1080",
      "restore",
      "save",
      "fillText 가나다라마 125,105 600 20px Serif center",
      "restore",
    ]);
  });

  it("긴 글은 상자 폭에서 줄을 바꾼다", async () => {
    const card = addLayer(blankCard("c"), textLayer("t", "4:5", { x: 0, y: 0, w: 30, size: 10, lineHeight: 2, text: "가나다라" }));
    const { ctx, calls } = recorder();
    await drawCard(ctx, card, "4:5", { load: async () => null, family: () => "Sans" });
    expect(calls.filter((c) => c.startsWith("fillText"))).toEqual(["fillText 가나다 0,5 700 10px Sans left", "fillText 라 0,25 700 10px Sans left"]);
  });

  it("세로 가운데·여백·배경 상자", async () => {
    const card = addLayer(blankCard("c"), textLayer("t", "1:1", { x: 0, y: 0, w: 100, h: 100, size: 10, lineHeight: 2, text: "가", vAlign: "middle", margin: 10, padding: 5, boxOpacity: 0.5, boxColor: "#ff0000" }));
    const { ctx, calls } = recorder();
    await drawCard(ctx, card, "1:1", { load: async () => null, family: () => "Sans" });
    expect(calls).toContain("fillRect rgba(255, 0, 0, 0.5) a=1 10,10,80,80");
    expect(calls.filter((c) => c.startsWith("fillText"))).toEqual(["fillText 가 15,45 700 10px Sans left"]); // 안쪽 15..85, 줄 높이 20 → 가운데 40 + 반 줄 여백 5
  });

  it("회전·스티커·반복 워터마크", async () => {
    const card = addLayer(blankCard("c"), { ...stickerLayer("s", "1:1", "star"), rotation: 90 });
    const { ctx, calls } = recorder();
    const loads: string[] = [];
    await drawCard(ctx, card, "1:1", { load: async (s) => (loads.push(s), { img: {}, width: 10, height: 10 }), family: () => "Sans" }, { ...defaultWatermark(), tile: true, gap: 540 });
    expect(calls).toContain("rotate 1.57");
    expect(loads[0]).toMatch(/^data:image\/svg\+xml/);
    expect(calls.filter((c) => c.startsWith("fillText @yunseo")).length).toBeGreaterThan(3);
  });

  it("contain 은 상자 안 가운데", () => {
    expect(fitImage(200, 100, { x: 0, y: 0, w: 100, h: 100, fit: "contain" })).toMatchObject({ dx: 0, dy: 25, dw: 100, dh: 50 });
  });

  it("파일 이름", () => {
    expect(exportName("FOMC 정리 / 1편", 0)).toBe("FOMC-정리-1편-01.png");
    expect(exportName("  ", 11)).toBe("deck-12.png");
  });
});
