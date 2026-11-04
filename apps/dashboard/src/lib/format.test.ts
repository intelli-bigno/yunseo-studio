import { describe, expect, it } from "vitest";
import { fmtDay, fmtSlot, fmtWeekRange } from "./format";

describe("표시 형식", () => {
  it("슬롯·날짜", () => {
    expect(fmtSlot("2026-11-04T21:00")).toBe("11.04 수 21:00");
    expect(fmtDay("2026-11-04")).toBe("11.04 수");
  });

  it("주 범위 — 달이 넘어가면 양쪽 달", () => {
    expect(fmtWeekRange("2026-11-02", "2026-11-08")).toBe("11월 2일 — 8일");
    expect(fmtWeekRange("2026-10-26", "2026-11-01")).toBe("10월 26일 — 11월 1일");
  });
});
