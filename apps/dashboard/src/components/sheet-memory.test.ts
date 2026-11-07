import { describe, expect, it } from "vitest";
import { loadSheetOpen, saveSheetOpen, SHEET_KEY } from "./sheet-memory";

const fake = () => {
  const m = new Map<string, string>();
  return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } };
};

describe("속성 시트 접힘 기억", () => {
  it("저장된 값이 없으면 펼친 채 시작한다", () => {
    expect(loadSheetOpen(fake().s)).toBe(true);
  });

  it("접고 나면 다음에도 접힌 채 시작하고, 다시 펼치면 펼친 채 시작한다", () => {
    const { m, s } = fake();
    saveSheetOpen(s, false);
    expect(m.get(SHEET_KEY)).toBe("0");
    expect(loadSheetOpen(s)).toBe(false);
    saveSheetOpen(s, true);
    expect(loadSheetOpen(s)).toBe(true);
  });

  it("저장소가 없거나 읽기·쓰기가 막혀도 던지지 않고 펼침으로 돌아간다", () => {
    const boom = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadSheetOpen(null)).toBe(true);
    expect(loadSheetOpen(boom)).toBe(true);
    expect(() => saveSheetOpen(boom, false)).not.toThrow();
    expect(() => saveSheetOpen(null, false)).not.toThrow();
  });
});
