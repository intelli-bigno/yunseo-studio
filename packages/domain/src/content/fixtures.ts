// 테스트 전용 입력 만들기 — 세 종의 올바른 draft 한 편씩. index.ts 로 내보내지 않는다(`@yunseo/domain/testing` 으로만 가져온다).
type Obj = Record<string, unknown>;

export function preIssueInput(over: Obj = {}): Obj {
  return {
    schema: "pre-issue-5/v1",
    id: "pre-sample",
    status: "draft",
    language: "en",
    event: { name: "Sample event", kind: "election", scheduled_at: null, timezone: null },
    cover: { title: "A title", hook: "A hook" },
    stages: {
      why_it_matters: { headline: "Why headline", points: ["A point."] },
      market_expectation: { headline: "Expectation headline", points: ["A point."] },
      scenarios: {
        headline: "Scenario headline",
        items: [
          { label: "a", condition: "c", reading: "r" },
          { label: "b", condition: "c", reading: "r" },
        ],
      },
      transmission: { headline: "Path headline", paths: [{ channel: "c", via: "v", touches: ["t"] }] },
      after_checks: { headline: "Check headline", checks: [{ what: "w", where: "x" }] },
    },
    claims: [],
    operator_view: null,
    ...over,
  };
}

export function postIssueInput(over: Obj = {}): Obj {
  return {
    schema: "post-issue-4/v1",
    id: "post-sample",
    status: "draft",
    language: "en",
    links: { pre_issue_id: "pre-sample" },
    evidence_ready: false,
    event: { name: "Sample event", kind: "election", occurred_at: null, timezone: null },
    cover: { title: "A title", hook: "A hook" },
    stages: {
      result_vs_expectation: {
        headline: "Result headline",
        actual_result: "A result.",
        expectation_gap: "A gap.",
        scenario_outcomes: [{ scenario_id: "a", outcome: "unresolved", note: "n" }],
        check_results: [{ check_id: "x", status: "not_available", note: "n" }],
      },
      market_reaction: { headline: "Reaction headline", points: ["A move."] },
      judgment_update: { headline: "Judgment headline", items: [{ judgment: "j", status: "kept", reason: "r", based_on: [] }] },
      next_variables: { headline: "Next headline", items: [{ variable: "v", why: "w", where: "x" }] },
    },
    claims: [],
    operator_view: null,
    ...over,
  };
}

export function researchInput(over: Obj = {}): Obj {
  return {
    schema: "research-5/v1",
    id: "research-sample",
    status: "draft",
    language: "en",
    thread: { id: "t", topic: "A topic" },
    stage: "tool",
    cover: { title: "A title", hook: "A hook" },
    stages: {
      tool: {
        headline: "Tool headline",
        name: "Worksheet",
        purpose: "A purpose.",
        how_to_use: ["Step one."],
        inputs: "In",
        outputs: "Out",
        limits: "Limits.",
        verified_scope: "Scope.",
        applies_when: ["When"],
        not_when: ["Not when"],
      },
    },
    claims: [],
    operator_view: null,
    ...over,
  };
}

/** 출처를 다 갖춘 사실 claim */
export const sourcedFact = {
  id: "c1",
  kind: "fact",
  basis: "researched",
  text: "Sample fact 3",
  as_of: "2026-01-01T00:00:00Z",
  source_url: "https://example.org/a",
  accessed_at: "2026-01-02",
  quote: "quote",
  publisher: "Example Org",
  tier: "primary",
  verified_by: "operator",
  verified_at: "2026-01-02",
} as const;
