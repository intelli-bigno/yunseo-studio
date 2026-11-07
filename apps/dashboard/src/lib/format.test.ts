import { describe, expect, it } from "vitest";
import { fmtDay, fmtSlot } from "./format";

describe("표시 형식", () => {
  it("슬롯·날짜", () => {
    expect(fmtSlot("2026-11-04T21:00")).toBe("11.04 수 21:00");
    expect(fmtDay("2026-11-04")).toBe("11.04 수");
  });
});
