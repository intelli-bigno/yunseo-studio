import { describe, expect, it } from "vitest";
import { findBannedExpressions, normalizeForScan, type BannedExpressionRule } from "./expressions";

const rule = (over: Partial<BannedExpressionRule> & Pick<BannedExpressionRule, "id" | "terms">): BannedExpressionRule => ({
  surfaces: ["body", "brand_promo"],
  severity: "block",
  origin: "brief",
  reason: "test",
  ...over,
});

const free = rule({ id: "free", terms: ["무료"] });
const guarantee = rule({ id: "guarantee", terms: ["수익 보장"] });
const indicator = rule({ id: "indicator", terms: ["지표"], surfaces: ["brand_promo"] });
const en = rule({ id: "en-free", terms: ["for free"], severity: "warn", origin: "proposed" });

describe("findBannedExpressions", () => {
  it("금지 표현의 위치와 심각도를 돌려준다", () => {
    const hits = findBannedExpressions("지금 무료로 읽어보세요", "body", [free]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ ruleId: "free", term: "무료", severity: "block", surface: "body", index: 3 });
  });

  it("공백 유무와 상관없이 같은 표현으로 잡는다", () => {
    expect(findBannedExpressions("수익 보장", "body", [guarantee])).toHaveLength(1);
    expect(findBannedExpressions("수익보장", "body", [guarantee])).toHaveLength(1);
    expect(findBannedExpressions("수익   보장", "body", [guarantee])).toHaveLength(1);
  });

  it("전각·제로폭 문자로 검사를 피하지 못한다", () => {
    expect(findBannedExpressions("FOR​ FREE", "body", [en])).toHaveLength(1);
    expect(normalizeForScan("Ｆｏｒ Ｆｒｅｅ")).toBe("for free");
  });

  it("「지표」는 브랜드 전면 문구에서만 금지, 본문에서는 허용한다", () => {
    const text = "발표 이후 확인할 지표를 정리했습니다";
    expect(findBannedExpressions(text, "brand_promo", [indicator])).toHaveLength(1);
    expect(findBannedExpressions(text, "body", [indicator])).toHaveLength(0);
  });

  it("영문 용어는 단어 경계로만 잡는다 (free cash flow 는 걸리지 않는다)", () => {
    expect(findBannedExpressions("Free cash flow and the risk-free rate", "body", [en])).toHaveLength(0);
    expect(findBannedExpressions("Read it for free today", "body", [en])).toHaveLength(1);
  });

  it("여러 규칙의 결과를 위치 순으로 정렬한다", () => {
    const hits = findBannedExpressions("수익 보장, 무료", "body", [free, guarantee]);
    expect(hits.map((h) => h.ruleId)).toEqual(["guarantee", "free"]);
  });

  it("깨끗한 문장은 비어 있다", () => {
    expect(findBannedExpressions("The result matters less than what comes next.", "body", [free, guarantee, en])).toEqual([]);
  });
});
