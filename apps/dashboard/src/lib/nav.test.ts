import { describe, expect, it } from "vitest";
import { pieceHref, tabFor } from "./nav";

describe("편 열기 규칙", () => {
  it("게이트가 탭을 정한다", () => {
    expect(tabFor({ status: "drafted" }, "G2")).toBe("sources");
    expect(tabFor({ status: "in_review" }, "G3")).toBe("review");
    expect(tabFor({ status: "drafted" }, "G1")).toBe("write");
    expect(tabFor({ status: "published" }, null)).toBe("write");
  });

  it("자료 대기는 게이트와 상관없이 작성부터", () => {
    expect(tabFor({ status: "evidence_wait" }, "G2")).toBe("write");
  });

  it("링크는 편 id 와 탭을 담는다", () => {
    expect(pieceHref({ piece: { id: "P-1" } as never, gate: "G3" })).toBe("/content/P-1?tab=review");
  });
});
