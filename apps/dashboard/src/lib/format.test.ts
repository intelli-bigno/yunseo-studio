import { describe, expect, it } from "vitest";
import { clipCodePoints, fmtDay, fmtSlot, stripLoneSurrogates } from "./format";

describe("표시 형식", () => {
  it("슬롯·날짜", () => {
    expect(fmtSlot("2026-11-04T21:00")).toBe("11.04 수 21:00");
    expect(fmtDay("2026-11-04")).toBe("11.04 수");
  });
});

describe("이모지가 잘리지 않게 다루기", () => {
  it("짝 없는 서로게이트만 지우고 온전한 이모지는 둔다", () => {
    expect(stripLoneSurrogates("입틀막 \ud83e")).toBe("입틀막 ");
    expect(stripLoneSurrogates("\udd2f 앞")).toBe(" 앞");
    expect(stripLoneSurrogates("좋아요 🤯 끝")).toBe("좋아요 🤯 끝");
  });

  it("코드포인트 단위로 자른다 — 이모지를 반으로 가르지 않는다", () => {
    expect(clipCodePoints("ab🤯cd", 3)).toBe("ab🤯");
    expect(clipCodePoints("ab🤯cd", 2)).toBe("ab");
    expect(clipCodePoints("ab 🤯cd", 3)).toBe("ab");
    expect(clipCodePoints("짧은 글", 10)).toBe("짧은 글");
    expect("ab🤯cd".slice(0, 3)).not.toBe("ab🤯"); // UTF-16 자르기는 반쪽을 남긴다
  });
});
