// 레퍼런스 칸·비교는 그림을 자르지 않는다 — 마크업 클래스와 CSS 규칙을 본다(브라우저 없이).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Tile, TileGrid } from "@yunseo/ui";

const css = readFileSync(resolve(__dirname, "../../../../packages/ui/src/styles.css"), "utf8");
const rule = (selector: string) => css.split("\n").find((l) => l.startsWith(selector + " {")) ?? "";
const tile = (aspect?: "natural" | "fit" | "square") => renderToStaticMarkup(createElement(Tile, { as: "a", href: "/x", src: "/a.jpg", alt: "a", title: "t", ...(aspect ? { aspect } : {}) }));

describe("레퍼런스 칸 — 자르지 않음", () => {
  it("masonry 그리드는 is-masonry 를 단다(기본은 아님)", () => {
    expect(renderToStaticMarkup(createElement(TileGrid, { masonry: true, children: null }))).toContain("ui-tiles is-masonry");
    expect(renderToStaticMarkup(createElement(TileGrid, { children: null }))).not.toContain("is-masonry");
  });

  it("natural·fit 틀은 고정 비율 클래스(is-portrait 등)를 쓰지 않는다", () => {
    expect(tile("natural")).toContain("ui-tile-frame is-natural");
    expect(tile("fit")).toContain("ui-tile-frame is-fit");
    expect(tile()).toContain("is-portrait"); // 기본 동작(/shorts 등)은 그대로
  });

  it("natural·fit 그림은 contain + 높이 자동이고 cover 가 아니다", () => {
    for (const k of ["is-natural", "is-fit"]) {
      const r = rule(`.ui-tile-frame.${k} .ui-tile-img`);
      expect(r, k).toContain("object-fit: contain");
      expect(r, k).toContain("height: auto");
      expect(r, k).not.toContain("cover");
    }
    expect(rule(".ui-tile-frame.is-fit .ui-tile-img")).toContain("max-height: 80vh");
  });

  it("natural·fit 은 마우스를 올려도 확대하지 않는다(가장자리가 잘림)", () => {
    expect(css).toContain(".ui-tile:hover .ui-tile-frame.is-natural .ui-tile-img");
    expect(css).toMatch(/\.ui-tile:hover \.ui-tile-frame\.is-fit \.ui-tile-img \{ transform: none; \}/);
  });

  it("메이슨리는 칸을 쪼개지 않는다", () => {
    expect(rule(".ui-tiles.is-masonry > .ui-tile")).toContain("break-inside: avoid");
  });
});
