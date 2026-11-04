import { describe, expect, it } from "vitest";
import { choreography, color, component, duration, contrastPairs, contrastRatio, cssText, cssVariables, grid, layout, radius, space, type, typeSteps } from "./index";

describe("디자인 토큰 (Club Green)", () => {
  it.each(contrastPairs.map((p) => [p.fg, p.bg, p.min] as const))("%s / %s 대비가 %s 이상", (fg, bg, min) => {
    expect(contrastRatio(color[fg], color[bg])).toBeGreaterThanOrEqual(min);
  });

  it("색은 모두 #rrggbb 이다", () => {
    for (const v of Object.values(color)) expect(v).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it("간격은 4 배수 한 줄 스케일이고 오름차순이다", () => {
    const vs = Object.values(space);
    for (const v of vs) expect(v % 4).toBe(0);
    expect([...vs].sort((a, b) => a - b)).toEqual(vs);
    expect(grid.gutter % 8).toBe(0);
  });

  it("글자는 6단계로 고정되고 크기가 커지는 순서다", () => {
    expect(typeSteps).toEqual(["label", "body", "title", "heading", "metric", "hero"]);
    const sizes = typeSteps.map((k) => type[k].size);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
    for (const k of typeSteps) expect(type[k].line % 4).toBe(0);
  });

  it("레이아웃·컴포넌트 치수는 4 배수다", () => {
    for (const v of Object.values(layout)) expect(v % 8).toBe(0);
    for (const v of Object.values(radius)) if (v !== 999) expect(v % 8).toBe(0);
    for (const spec of Object.values(component)) for (const v of Object.values(spec)) if (typeof v === "number" && v > 2) expect(v % 4).toBe(0);
  });

  it("CSS 변수로 바뀐다", () => {
    const vars = cssVariables();
    expect(vars["--c-bg"]).toBe(color.bg);
    expect(vars["--fs-metric"]).toBe("40px");
    expect(vars["--ff-heading"]).toBe("var(--ff-head)");
    expect(vars["--sp-5"]).toBe("24px");
    expect(vars["--chip-height"]).toBe("24px");
    expect(cssText()).toMatch(/^:root \{\n/);
  });

  it("모션 길이는 짧은 것부터 오름차순이고 화면 전환 전체가 상한 안이다", () => {
    const ds = Object.values(duration);
    expect([...ds].sort((a, b) => a - b)).toEqual(ds);
    // 마지막 조각이 출발(inDelay + 스태거 × (조각 수 − 1))해서 도착(scene × 1.1 여유)할 때까지
    const total = choreography.inDelay + choreography.stagger * (choreography.pieces - 1) + duration.scene * 1.1;
    expect(total).toBeLessThanOrEqual(choreography.budget);
  });

  it("모션 토큰이 CSS 변수로 바뀐다", () => {
    const vars = cssVariables();
    expect(vars["--m-scene"]).toBe(`${duration.scene}ms`);
    expect(vars["--m-ease-out"]).toMatch(/^cubic-bezier\(/);
    expect(vars["--m-lift"]).toBe("-2px");
  });
});
