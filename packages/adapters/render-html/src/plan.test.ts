import { describe, expect, it } from "vitest";
import { validateContentDoc, type ContentBody } from "@yunseo/domain";
import { postIssueInput, preIssueInput, researchInput, sourcedFact } from "@yunseo/domain/testing";
import { stringsFor } from "./strings";
import { ALT_TEXT_MAX, altTextOf } from "./plan/alt";
import { planCards, type Block, type CardPage, type PlanContext } from "./plan";

function body(input: unknown): ContentBody {
  const result = validateContentDoc(input);
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.value;
}

/** 질문 문구는 `Q:<슬롯>#<장>`, 기본 답은 둘째 장부터 `A:<슬롯>#<장>` 으로 돌려주는 가짜 프리셋 */
const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  s: stringsFor("en").strings,
  disclosure: null,
  page: (slot, index) => ({ q: `Q:${slot}#${index}`, a: index === 0 ? null : `A:${slot}#${index}` }),
  ...over,
});

const slots = (pages: CardPage[]) => pages.map((p) => p.slot);
const kinds = (blocks: Block[]) => blocks.map((b) => b.t);

describe("카드 계획", () => {
  it("이전 편: 표지 + 5단(시나리오는 두 장) + 출처 = 8장", () => {
    const pages = planCards(body(preIssueInput()), ctx());
    expect(slots(pages)).toEqual(["cover", "why_it_matters", "market_expectation", "scenarios", "scenarios-2", "transmission", "after_checks", "sources"]);
    expect(pages.map((p) => p.kind)).toEqual(["cover", "qa", "qa", "qa", "qa", "qa", "qa", "sources"]);
  });

  it("질문은 프리셋에서, 첫 장의 답은 정본의 headline, 둘째 장의 답은 프리셋 기본값", () => {
    const pages = planCards(body(preIssueInput()), ctx());
    expect(pages[1]).toMatchObject({ question: "Q:why_it_matters#0", answer: "Why headline" });
    expect(pages[3]).toMatchObject({ question: "Q:scenarios#0", answer: "Scenario headline" });
    expect(pages[4]).toMatchObject({ question: "Q:scenarios#1", answer: "A:scenarios#1" });
  });

  it("다음 장 안내 줄은 다음 장의 질문을 쓴다 (마지막 본문 장에는 없다)", () => {
    const pages = planCards(body(preIssueInput()), ctx());
    const next = (p: CardPage) => p.blocks.filter((b) => b.t === "para" && b.next).map((b) => (b.t === "para" ? b.text : ""));
    expect(next(pages[1]!)).toEqual(["Next: Q:market_expectation#0"]);
    expect(next(pages[3]!)).toEqual(["Next: Q:scenarios#1"]);
    expect(next(pages[4]!)).toEqual(["Next: Q:transmission#0"]);
    expect(next(pages[6]!)).toEqual([]);
  });

  it("강조 표기(**)는 계획에 그대로 남는다 — 레이아웃이 굵게·밑줄로 바꾼다", () => {
    const input = preIssueInput() as { stages: { why_it_matters: { points: string[] } } };
    input.stages.why_it_matters.points = ["A **key phrase** here."];
    const first = planCards(body(input), ctx())[1]?.blocks[0];
    expect(first).toMatchObject({ t: "para", marker: "view", text: "A **key phrase** here." });
  });

  it("이후 편: 시나리오 대응·확인 항목 대응이 없으면 그 장을 그리지 않는다", () => {
    expect(slots(planCards(body(postIssueInput()), ctx()))).toEqual(["cover", "result_vs_expectation", "result_vs_expectation-2", "result_vs_expectation-3", "market_reaction", "judgment_update", "next_variables", "sources"]);
    const bare = postIssueInput({ links: { pre_issue_id: null } }) as { stages: { result_vs_expectation: { scenario_outcomes: unknown[]; check_results: unknown[] } } };
    bare.stages.result_vs_expectation.scenario_outcomes = [];
    bare.stages.result_vs_expectation.check_results = [];
    const pages = planCards(body(bare), ctx());
    expect(slots(pages)).toEqual(["cover", "result_vs_expectation", "market_reaction", "judgment_update", "next_variables", "sources"]);
    expect(JSON.stringify(pages[1]?.blocks)).toContain("No earlier scenarios existed for this event.");
  });

  it("이후 편: 사실 ■ · 시장 반응 ▲ · 해석 ◆ 표시가 구조대로 붙는다", () => {
    const pages = planCards(body(postIssueInput()), ctx());
    expect(pages[1]?.blocks.slice(0, 2)).toMatchObject([{ marker: "fact" }, { marker: "view" }]);
    expect(pages[4]?.blocks[0]).toMatchObject({ marker: "market" });
    expect(JSON.stringify(pages[2]?.blocks)).toContain("Unresolved. n"); // 결과 + 메모
  });

  it("연구 편: 표지 + 그 편의 단계 + 출처, 도구 단계는 두 장", () => {
    expect(slots(planCards(body(researchInput()), ctx()))).toEqual(["cover", "tool", "tool-2", "sources"]);
    const idea = researchInput({ stage: "idea", stages: { idea: { headline: "h", hypothesis: "A hypothesis.", falsifier: "A falsifier." } } });
    const pages = planCards(body(idea), ctx());
    expect(slots(pages)).toEqual(["cover", "idea", "sources"]);
    expect(kinds(pages[1]!.blocks)).toEqual(["box"]);
  });

  it("출처 장: 인용한 claim 은 발행처·접근일과 함께, 4건을 넘으면 나머지는 줄여 안내한다", () => {
    const claims = Array.from({ length: 6 }, (_, i) => ({ ...sourcedFact, id: `c${i}`, text: `Fact ${i}` }));
    const sources = planCards(body(preIssueInput({ claims })), ctx()).at(-1);
    const rows = sources?.blocks.find((b) => b.t === "sources");
    if (rows?.t !== "sources") throw new Error("출처 행 없음");
    expect(rows.rows[0]).toMatchObject({ marker: "fact", title: "Fact 0", detail: "Example Org · accessed 2026-01-02 · As of 2026-01-01T00:00:00Z" });
    expect(rows.rows.map((r) => r.title)).toContain("+2 more claims in the source table");
  });

  it("출처 장: 운영자 해석이 있으면 본문으로, 없으면 점선 자리 / 고지 문구가 확정이면 그대로", () => {
    const empty = planCards(body(preIssueInput()), ctx()).at(-1)?.blocks ?? [];
    expect(empty.filter((b) => b.t === "placeholder")).toHaveLength(2);
    const filled = planCards(body(preIssueInput({ status: "verified", operator_view: "My view." })), ctx({ disclosure: "Confirmed line." })).at(-1)?.blocks ?? [];
    expect(JSON.stringify(filled)).toContain("**Operator's view.** My view.");
    expect(filled.filter((b) => b.t === "placeholder")).toMatchObject([{ text: "Confirmed line." }]);
  });
});

describe("대체텍스트", () => {
  const s = stringsFor("en").strings;

  it("장 번호·질문→답·본문 앞부분을 이어 붙이고 상한을 넘지 않는다", () => {
    const pages = planCards(body(preIssueInput()), ctx());
    expect(altTextOf(pages[0]!, 0, 8, s)).toBe("Card 1 of 8. A title.");
    expect(altTextOf(pages[1]!, 1, 8, s)).toBe("Card 2 of 8. Q:why_it_matters#0 → Why headline. A point. Next: Q:market_expectation#0");
    const long = preIssueInput({ cover: { title: "word ".repeat(100), hook: "h" } });
    const alt = altTextOf(planCards(body(long), ctx())[0]!, 0, 8, s);
    expect([...alt].length).toBeLessThanOrEqual(ALT_TEXT_MAX);
    expect(alt.endsWith("…")).toBe(true);
  });

  it("강조 표기는 벗긴다", () => {
    const input = preIssueInput() as { stages: { why_it_matters: { points: string[] } } };
    input.stages.why_it_matters.points = ["A **bold** claim."];
    expect(altTextOf(planCards(body(input), ctx())[1]!, 1, 8, s)).toContain("A bold claim.");
  });
});

describe("고정 문구", () => {
  it("영어·한국어를 지원하고 그 밖의 언어는 영어로 돌아가며 표시한다", () => {
    expect(stringsFor("en").fallback).toBe(false);
    expect(stringsFor("ko-KR")).toMatchObject({ lang: "ko", fallback: false });
    expect(stringsFor("fr")).toMatchObject({ lang: "en", fallback: true });
  });
});
