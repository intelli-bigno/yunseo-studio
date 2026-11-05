import { describe, expect, it } from "vitest";
import type { BannedExpressionRule } from "../compliance/expressions";
import {
  STAGE_KEYS,
  findUnsourcedNumbers,
  scanCardExpressions,
  validatePreIssueCard,
  verificationBlockers,
  type PreIssueCard,
} from "./pre-issue";

function card(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: "pre-issue-5/v1",
    id: "sample",
    status: "draft",
    language: "en",
    event: { name: "Sample event", kind: "election", scheduled_at: null, timezone: null },
    cover: { title: "A title", hook: "A hook" },
    stages: {
      why_it_matters: { headline: "h", points: ["p"] },
      market_expectation: { headline: "h", points: ["p"] },
      scenarios: {
        headline: "h",
        items: [
          { label: "a", condition: "c", reading: "r" },
          { label: "b", condition: "c", reading: "r" },
        ],
      },
      transmission: { headline: "h", paths: [{ channel: "c", via: "v", touches: ["t"] }] },
      after_checks: { headline: "h", checks: [{ what: "w", where: "x" }] },
    },
    claims: [],
    operator_view: null,
    ...over,
  };
}

function parsed(input: Record<string, unknown>): PreIssueCard {
  const result = validatePreIssueCard(input);
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.value;
}

describe("validatePreIssueCard", () => {
  it("5단 순서는 정본과 같다", () => {
    expect(STAGE_KEYS).toEqual(["why_it_matters", "market_expectation", "scenarios", "transmission", "after_checks"]);
  });

  it("올바른 draft 카드를 통과시킨다", () => {
    expect(validatePreIssueCard(card()).ok).toBe(true);
  });

  it("시나리오가 하나뿐이면 거부한다 (한 방향 예측 금지)", () => {
    const base = card() as { stages: { scenarios: { items: unknown[] } } };
    base.stages.scenarios.items = [{ label: "a", condition: "c", reading: "r" }];
    const result = validatePreIssueCard(base);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toContain("stages.scenarios.items: 항목이 2개 이상");
  });

  it("단계가 빠지면 경로가 담긴 오류를 돌려준다", () => {
    const base = card() as { stages: Record<string, unknown> };
    delete base.stages["transmission"];
    const result = validatePreIssueCard(base);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((m) => m.startsWith("stages.transmission"))).toBe(true);
  });

  it("스키마 식별자·이벤트 유형·상태가 틀리면 거부한다", () => {
    const result = validatePreIssueCard(card({ schema: "other", status: "done" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("schema");
      expect(result.errors.join("\n")).toContain("status");
    }
  });

  it("객체가 아닌 입력도 예외 없이 오류로 돌려준다", () => {
    expect(validatePreIssueCard(null).ok).toBe(false);
    expect(validatePreIssueCard("text").ok).toBe(false);
  });
});

describe("검수 전 차단 사유", () => {
  it("일시·시간대·운영자 해석이 비면 verified 로 올릴 수 없다", () => {
    expect(verificationBlockers(parsed(card()))).toEqual([
      "event.scheduled_at: 일시 없는 이벤트는 선정 불가",
      "event.timezone: 시간대 명시 필요",
      "operator_view: 운영자 고유 해석이 비어 있다",
      "as_of: 기준 시점이 비어 있다",
      "importance: major | watch 판정이 필요하다 (docs/02 §3.2)",
    ]);
  });

  it("모든 조건을 갖추면 차단 사유가 없다", () => {
    const ready = card({
      event: { name: "e", kind: "data_release", scheduled_at: "2026-01-01T00:00:00Z", timezone: "America/New_York" },
      operator_view: "view",
      as_of: "2026-01-01T00:00:00Z",
      importance: "major",
    });
    expect(verificationBlockers(parsed(ready))).toEqual([]);
  });

  it("예전 파일(as_of·importance·type·revisions 가 없는)도 읽는다", () => {
    const old = parsed(card());
    expect(old).toMatchObject({ type: "pre_issue", as_of: null, importance: null, reels: null, revisions: [] });
  });

  it("봉투 필드가 틀리면 경로가 담긴 오류를 돌려준다", () => {
    const result = validatePreIssueCard(card({ type: "research", as_of: "yesterday", importance: "huge", reels: { planned: "yes" } }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const text = result.errors.join("\n");
      for (const path of ["type", "as_of", "importance", "reels.planned"]) expect(text).toContain(path);
    }
  });

  it("출처가 빠진 주장은 막는다", () => {
    const withClaim = card({ claims: [{ text: "claim" }] });
    expect(verificationBlockers(parsed(withClaim)).some((m) => m.startsWith("claims[0]"))).toBe(true);
  });
});

describe("수치와 금지 표현", () => {
  it("본문 수치는 claims 에 같은 수치가 있어야 한다", () => {
    const base = card() as { cover: { hook: string } };
    base.cover.hook = "Up 3 points";
    expect(findUnsourcedNumbers(parsed(base)).map((t) => t.path)).toEqual(["cover.hook"]);
    const sourced = card({ claims: [{ text: "3 points" }] }) as { cover: { hook: string } };
    sourced.cover.hook = "Up 3 points";
    expect(findUnsourcedNumbers(parsed(sourced))).toEqual([]);
  });

  it("본문 어디서 금지 표현이 나왔는지 경로를 알려준다", () => {
    const rules: BannedExpressionRule[] = [
      { id: "free", terms: ["무료"], surfaces: ["body"], severity: "block", origin: "brief", reason: "t" },
    ];
    const base = card() as { stages: { why_it_matters: { points: string[] } } };
    base.stages.why_it_matters.points = ["무료 공개"];
    const hits = scanCardExpressions(parsed(base), rules);
    expect(hits.map((h) => h.path)).toEqual(["stages.why_it_matters.points[0]"]);
  });
});
