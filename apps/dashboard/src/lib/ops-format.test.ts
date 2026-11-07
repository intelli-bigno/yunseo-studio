import { describe, expect, it } from "vitest";
import { fmtBytes, fmtKst } from "./ops-format";

describe("표시 도우미", () => {
  it("KST 시각", () => {
    expect(fmtKst("2026-11-04T18:30:00.000Z")).toBe("11.05 03:30");
    expect(fmtKst(null)).toBe("—");
    expect(fmtKst("bad")).toBe("—");
  });

  it("바이트", () => {
    expect([12, 2048, 3 * 1024 * 1024, 5 * 1024 ** 3].map(fmtBytes)).toEqual(["12 B", "2.0 KB", "3.0 MB", "5.00 GB"]);
  });
});
