// 오른쪽 패널 폭 비율 — 범위 자르기와 포인터 위치 → 비율 변환
import { describe, expect, it } from "vitest";
import { RIGHT_RATIO_MAX, RIGHT_RATIO_MIN, clampRightRatio, rightRatioFromPointer } from "./editor";

describe("오른쪽 패널 폭 비율", () => {
  it("0.2~0.7 로 자르고, 숫자가 아니면 최솟값", () => {
    expect(clampRightRatio(0.4)).toBe(0.4);
    expect(clampRightRatio(0)).toBe(RIGHT_RATIO_MIN);
    expect(clampRightRatio(0.95)).toBe(RIGHT_RATIO_MAX);
    expect(clampRightRatio(Number.NaN)).toBe(RIGHT_RATIO_MIN);
  });

  it("포인터가 왼쪽으로 갈수록 패널이 넓어진다", () => {
    const box = { right: 1200, width: 1000 }; // 편집기 x: 200~1200
    expect(rightRatioFromPointer(800, box)).toBeCloseTo(0.4);
    expect(rightRatioFromPointer(600, box)).toBeCloseTo(0.6);
    expect(rightRatioFromPointer(1190, box)).toBe(RIGHT_RATIO_MIN);
    expect(rightRatioFromPointer(100, box)).toBe(RIGHT_RATIO_MAX);
  });

  it("폭이 0 인 상자는 최솟값", () => {
    expect(rightRatioFromPointer(10, { right: 0, width: 0 })).toBe(RIGHT_RATIO_MIN);
  });
});
