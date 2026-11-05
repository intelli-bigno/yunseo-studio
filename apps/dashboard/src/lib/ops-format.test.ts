import { describe, expect, it } from "vitest";
import { backupStale, fmtBytes, fmtKst, fmtRelative, runTone } from "./ops-format";

describe("운영 화면 표시", () => {
  it("KST 시각", () => {
    expect(fmtKst("2026-11-04T18:30:00.000Z")).toBe("11.05 03:30");
    expect(fmtKst(null)).toBe("—");
    expect(fmtKst("bad")).toBe("—");
  });

  it("바이트", () => {
    expect([12, 2048, 3 * 1024 * 1024, 5 * 1024 ** 3].map(fmtBytes)).toEqual(["12 B", "2.0 KB", "3.0 MB", "5.00 GB"]);
  });

  it("상대 시각 — 과거·미래", () => {
    const now = "2026-11-05T03:00:00.000Z";
    expect(fmtRelative("2026-11-05T02:57:00.000Z", now)).toBe("3분 전");
    expect(fmtRelative("2026-11-04T18:30:00.000Z", now)).toBe("8시간 전");
    expect(fmtRelative("2026-11-05T18:30:00.000Z", now)).toBe("15시간 후");
    expect(fmtRelative("2026-11-01T03:00:00.000Z", now)).toBe("4일 전");
    expect(fmtRelative("2026-11-05T03:00:10.000Z", now)).toBe("방금");
  });

  it("상태 색·백업 경고", () => {
    expect(runTone("failed")).toBe("alert");
    expect(backupStale(null)).toBe(true);
    expect(backupStale(25)).toBe(false);
    expect(backupStale(27)).toBe(true);
  });
});
