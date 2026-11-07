import { describe, expect, it } from "vitest";
import { DOT_MAX, keyDirection, showsDots, slideIndex, stepIndex } from "./carousel-math";

describe("캐러셀 위치 계산", () => {
  it("스크롤 위치에서 가장 가까운 장을 고른다", () => {
    expect(slideIndex(0, 300, 5)).toBe(0);
    expect(slideIndex(149, 300, 5)).toBe(0);
    expect(slideIndex(151, 300, 5)).toBe(1);
    expect(slideIndex(600, 300, 5)).toBe(2);
  });

  it("범위를 넘으면 처음·끝 장으로 붙는다", () => {
    expect(slideIndex(-40, 300, 5)).toBe(0);
    expect(slideIndex(99999, 300, 5)).toBe(4);
  });

  it("폭이 0 이거나 장이 없거나 값이 깨졌으면 0", () => {
    expect(slideIndex(300, 0, 5)).toBe(0);
    expect(slideIndex(300, 300, 0)).toBe(0);
    expect(slideIndex(Number.NaN, 300, 5)).toBe(0);
  });

  it("이전·다음은 끝에서 멈춘다(돌지 않는다)", () => {
    expect(stepIndex(0, -1, 4)).toBe(0);
    expect(stepIndex(0, 1, 4)).toBe(1);
    expect(stepIndex(3, 1, 4)).toBe(3);
    expect(stepIndex(3, -1, 4)).toBe(2);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });

  it("방향키는 좌우만 받는다", () => {
    expect(keyDirection("ArrowLeft")).toBe(-1);
    expect(keyDirection("ArrowRight")).toBe(1);
    expect(keyDirection("ArrowUp")).toBeNull();
    expect(keyDirection("Enter")).toBeNull();
  });

  it("점은 2장 이상 DOT_MAX 장까지만, 많으면 숫자로", () => {
    expect(showsDots(1)).toBe(false);
    expect(showsDots(2)).toBe(true);
    expect(showsDots(DOT_MAX)).toBe(true);
    expect(showsDots(DOT_MAX + 1)).toBe(false);
  });
});
