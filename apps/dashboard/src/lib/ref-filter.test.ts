// 레퍼런스 그리드 검색·묶음 필터
import { describe, expect, it } from "vitest";
import { filterRefs, refSets } from "./ref-filter";

const items = [
  { label: "@nova · SAENGIN 생긴", set: "사진 전면 표지", tags: ["표지", "인물", "4:5"] },
  { label: "뉴스 카드", set: "뉴스 사진 카드", tags: ["뉴스", "인물"] },
  { label: "말풍선 답", set: "질문·답 말풍선", tags: ["말풍선"] },
  { label: "표지 둘", set: "사진 전면 표지", tags: ["표지"] },
];

describe("filterRefs", () => {
  it("조건이 없으면 전부", () => {
    expect(filterRefs(items, "", "")).toHaveLength(4);
    expect(filterRefs(items, "   ", "")).toHaveLength(4);
  });

  it("검색어는 제목·묶음·태그에서 대소문자 없이 찾는다", () => {
    expect(filterRefs(items, "saengin", "").map((x) => x.label)).toEqual(["@nova · SAENGIN 생긴"]);
    expect(filterRefs(items, "인물", "")).toHaveLength(2);
    expect(filterRefs(items, "말풍선", "")).toHaveLength(1);
  });

  it("공백으로 나눈 말은 모두 들어 있어야 한다", () => {
    expect(filterRefs(items, "표지 인물", "")).toHaveLength(1);
    expect(filterRefs(items, "표지 뉴스", "")).toHaveLength(0);
  });

  it("묶음 필터와 검색을 같이 쓴다", () => {
    expect(filterRefs(items, "", "사진 전면 표지")).toHaveLength(2);
    expect(filterRefs(items, "인물", "사진 전면 표지")).toHaveLength(1);
    expect(filterRefs(items, "", "없는 묶음")).toHaveLength(0);
  });

  it("묶음·태그가 없는 항목도 제목으로 찾는다", () => {
    expect(filterRefs([{ label: "카드 a.png" }], "a.png", "")).toHaveLength(1);
    expect(filterRefs([{ label: "카드 a.png" }], "", "x")).toHaveLength(0);
  });
});

describe("refSets", () => {
  it("묶음별 장수를 많은 순으로", () => {
    expect(refSets(items)).toEqual([
      { name: "사진 전면 표지", count: 2 },
      { name: "뉴스 사진 카드", count: 1 },
      { name: "질문·답 말풍선", count: 1 },
    ]);
  });

  it("묶음이 없는 항목은 세지 않는다", () => {
    expect(refSets([{ label: "x" }])).toEqual([]);
  });
});
