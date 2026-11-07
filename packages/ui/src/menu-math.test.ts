// 메뉴 방향키 이동 — 돌아 이어지기·처음/끝 키·해당 없는 키
import { describe, expect, it } from "vitest";
import { menuStep } from "./menu-math";

describe("menuStep", () => {
  it("아래·위 키는 한 칸씩 가고 처음·끝에서 돌아 이어진다", () => {
    expect(menuStep(0, 3, "ArrowDown")).toBe(1);
    expect(menuStep(2, 3, "ArrowDown")).toBe(0);
    expect(menuStep(1, 3, "ArrowUp")).toBe(0);
    expect(menuStep(0, 3, "ArrowUp")).toBe(2);
  });

  it("고른 칸이 없으면(-1) 아래는 첫 칸, 위는 마지막 칸", () => {
    expect(menuStep(-1, 4, "ArrowDown")).toBe(0);
    expect(menuStep(-1, 4, "ArrowUp")).toBe(3);
  });

  it("Home·End 는 처음·끝", () => {
    expect(menuStep(2, 5, "Home")).toBe(0);
    expect(menuStep(2, 5, "End")).toBe(4);
  });

  it("다른 키나 빈 메뉴는 null", () => {
    expect(menuStep(0, 3, "Enter")).toBeNull();
    expect(menuStep(0, 3, "a")).toBeNull();
    expect(menuStep(0, 0, "ArrowDown")).toBeNull();
  });
});
