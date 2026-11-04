import { describe, expect, it } from "vitest";
import { color, contrastPairs, contrastRatio, cssText, cssVariables } from "./index";

describe("디자인 토큰", () => {
  it.each(contrastPairs.map((p) => [p.fg, p.bg, p.min] as const))("%s / %s 대비가 %s 이상", (fg, bg, min) => {
    expect(contrastRatio(color[fg], color[bg])).toBeGreaterThanOrEqual(min);
  });

  it("색은 모두 #rrggbb 이다", () => {
    for (const v of Object.values(color)) expect(v).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it("CSS 변수로 바뀐다", () => {
    const vars = cssVariables();
    expect(vars["--c-bg"]).toBe(color.bg);
    expect(vars["--c-accent-ink"]).toBe(color.accentInk);
    expect(vars["--chip-height"]).toBe("20px");
    expect(cssText()).toMatch(/^:root \{\n/);
  });
});
