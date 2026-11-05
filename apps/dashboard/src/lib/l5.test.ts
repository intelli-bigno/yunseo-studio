import { describe, expect, it } from "vitest";
import { fmtDate, fmtMetric, fmtNum, fmtParams, fmtPct, isChannel, isPlatform } from "./l5";

describe("숫자 표기", () => {
  it("천 단위 쉼표·소수 한 자리·값 없음", () => {
    expect(fmtNum(1200)).toBe("1,200");
    expect(fmtNum(1500.55)).toBe("1,500.6");
    expect(fmtNum(0)).toBe("0");
    expect(fmtNum(undefined)).toBe("—");
    expect(fmtNum(null)).toBe("—");
  });

  it("비율은 소수 한 자리 %, 못 구하면 —", () => {
    expect(fmtPct(0.15)).toBe("15%");
    expect(fmtPct(0.04567)).toBe("4.6%");
    expect(fmtPct(null)).toBe("—");
  });

  it("지표 값: 초는 m:ss", () => {
    expect(fmtMetric("avg_view_sec", 18)).toBe("0:18");
    expect(fmtMetric("avg_view_sec", 125)).toBe("2:05");
    expect(fmtMetric("views", 1200)).toBe("1,200");
    expect(fmtMetric("views", undefined)).toBe("—");
  });

  it("날짜 MM.DD", () => {
    expect(fmtDate("2026-11-05T01:23:00.000Z")).toBe("11.05");
  });
});

describe("요청 파라미터 표기", () => {
  it("배열은 쉼표로, 긴 값은 줄이고 전체는 따로 둔다, 줄바꿈은 ⏎", () => {
    const rows = fmtParams({ children: ["<ID:item-1>", "<ID:item-2>"], caption: "본문\n\n#tag", long: "가".repeat(100), flag: true, n: 60 });
    expect(rows.find((r) => r.key === "children")).toEqual({ key: "children", value: "<ID:item-1>, <ID:item-2>", full: "<ID:item-1>, <ID:item-2>" });
    expect(rows.find((r) => r.key === "caption")?.value).toBe("본문 ⏎ #tag");
    const long = rows.find((r) => r.key === "long")!;
    expect(long.value).toHaveLength(64);
    expect(long.value.endsWith("…")).toBe(true);
    expect(long.full).toHaveLength(100);
    expect(rows.find((r) => r.key === "flag")?.value).toBe("true");
    expect(rows.find((r) => r.key === "n")?.value).toBe("60");
  });
});

describe("쿼리 값 검사", () => {
  it("채널·플랫폼만 통과", () => {
    expect(isChannel("feed") && isChannel("reels") && isChannel("story")).toBe(true);
    expect(isChannel("x")).toBe(false);
    expect(isPlatform("instagram") && isPlatform("youtube")).toBe(true);
    expect(isPlatform(undefined)).toBe(false);
  });
});
