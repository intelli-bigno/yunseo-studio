import { describe, expect, it } from "vitest";
import { buildPalette } from "./palette";

describe("빠른 이동 항목", () => {
  it("화면 → 편 → 출처 순으로, 출처는 문장이 있는 편만", () => {
    const entries = buildPalette({
      pieces: [
        { id: "P-1", title: "가", kind: "pre", hasClaims: true },
        { id: "R-2", title: "나", kind: "research", hasClaims: false },
      ],
    });
    expect(entries.map((e) => e.href)).toEqual(["/content", "/cards", "/reels", "/shorts", "/references", "/content/P-1", "/content/R-2", "/content/P-1?tab=sources"]);
    expect(entries[5]).toMatchObject({ tag: "이전", hint: "P-1" });
    expect(entries[7]).toMatchObject({ label: "출처 — 가", tag: "G2" });
  });
});
