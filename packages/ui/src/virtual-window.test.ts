import { describe, expect, it } from "vitest";
import { scrollToReveal, windowRange } from "./virtual-window";

const base = { row: 48, overscan: 4 };

describe("가상 목록 창", () => {
  it("맨 위에서는 보이는 행 + 여유만 그린다", () => {
    expect(windowRange({ ...base, scrollTop: 0, viewport: 480, count: 1000 })).toEqual([0, 14]);
  });

  it("스크롤하면 앞뒤 여유를 두고 창이 따라간다", () => {
    expect(windowRange({ ...base, scrollTop: 4800, viewport: 480, count: 1000 })).toEqual([96, 114]);
  });

  it("행이 적으면 있는 만큼만, 끝에서는 count 를 넘지 않는다", () => {
    expect(windowRange({ ...base, scrollTop: 0, viewport: 480, count: 3 })).toEqual([0, 3]);
    expect(windowRange({ ...base, scrollTop: 47900, viewport: 480, count: 1000 })[1]).toBe(1000);
    expect(windowRange({ ...base, scrollTop: 0, viewport: 480, count: 0 })).toEqual([0, 0]);
  });

  it("1000행이어도 그리는 행은 상수(창 크기)에 묶인다", () => {
    const [a, b] = windowRange({ ...base, scrollTop: 20000, viewport: 480, count: 100000 });
    expect(b - a).toBeLessThanOrEqual(19); // 보이는 10행 + 걸친 1행 + 앞뒤 여유 4×2
  });

  it("선택 행이 가려지면 보이는 곳까지 스크롤한다", () => {
    expect(scrollToReveal(0, 480, 480, 48)).toBe(0); // 위로 가려짐
    expect(scrollToReveal(20, 0, 480, 48)).toBe(528); // 아래로 가려짐
    expect(scrollToReveal(3, 0, 480, 48)).toBe(0); // 이미 보임
  });
});
