import { describe, expect, it } from "vitest";
import type { BannedExpressionRule } from "../compliance/expressions";
import { contentBlockers, formatIdOf, slotCharCounts, validateContentDoc, type ContentBody, type ContentRules } from "./document";
import { postIssueInput, preIssueInput, researchInput, sourcedFact } from "./fixtures";

const banned: BannedExpressionRule[] = [
  { id: "free", terms: ["무료"], surfaces: ["body"], severity: "block", origin: "brief", reason: "t" },
  { id: "en-free", terms: ["for free"], surfaces: ["body"], severity: "warn", origin: "proposed", reason: "t" },
];
const rules: ContentRules = {
  banned,
  formats: [
    { id: "pre-issue-5", limits_provisional: true, cards: [{ slot: "cover", stage: null, max_chars: 20 }, { slot: "why_it_matters", stage: "why_it_matters", max_chars: 30 }] },
    { id: "research-5", limits_provisional: false, cards: [{ slot: "cover", stage: null, max_chars: 90 }, { slot: "tool", stage: "tool", max_chars: 10, pages: [{ q: { en: "q" } }, { q: { en: "q2" } }] }] },
  ],
};

function body(input: unknown): ContentBody {
  const result = validateContentDoc(input);
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.value;
}

describe("validateContentDoc", () => {
  it("스키마 식별자로 세 종을 구분해 읽는다", () => {
    expect(body(preIssueInput()).schema).toBe("pre-issue-5/v1");
    expect(body(postIssueInput())).toMatchObject({ schema: "post-issue-4/v1", type: "post_issue" });
    expect(body(researchInput())).toMatchObject({ schema: "research-5/v1", type: "research", stage: "tool" });
    expect(formatIdOf("research-5/v1")).toBe("research-5");
  });

  it("모르는 스키마·객체가 아닌 입력은 예외 없이 오류로 돌려준다", () => {
    for (const input of [null, "text", 3, {}, { schema: "other/v1" }]) {
      const result = validateContentDoc(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]).toContain("schema");
    }
  });

  it("이후 편: 자료 확보 표시·이전 편 연결·4단이 없으면 경로가 담긴 오류", () => {
    const input = postIssueInput() as { stages: Record<string, unknown> };
    delete input.stages["judgment_update"];
    const result = validateContentDoc({ ...input, evidence_ready: "yes", links: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const text = result.errors.join("\n");
      for (const path of ["evidence_ready", "links.pre_issue_id", "stages.judgment_update"]) expect(text).toContain(path);
    }
  });

  it("연구 편: 한 편은 한 단계만 담는다 / 모르는 단계·결과 값은 거부", () => {
    const extra = researchInput() as { stages: Record<string, unknown> };
    extra.stages["idea"] = { headline: "h", hypothesis: "x", falsifier: "y" };
    const two = validateContentDoc(extra);
    expect(two.ok).toBe(false);
    if (!two.ok) expect(two.errors.join("\n")).toContain("stages.idea");
    expect(validateContentDoc(researchInput({ stage: "backtest" })).ok).toBe(false);

    const post = postIssueInput() as { stages: { result_vs_expectation: { scenario_outcomes: unknown[] } } };
    post.stages.result_vs_expectation.scenario_outcomes = [{ scenario_id: "a", outcome: "won", note: "n" }];
    expect(validateContentDoc(post).ok).toBe(false);
  });

  it("수정 이력: update 는 후속 게시물(또는 예정일)과 독자용 문구가 필요하다", () => {
    const revision = { at: "2026-01-01", by: "op", change_kind: "update", affected: ["claims[0]"], before: "a", after: "b", reason: "new data" };
    const bad = validateContentDoc(preIssueInput({ revisions: [revision] }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.join("\n")).toMatch(/reader_note[\s\S]*follow_up/);
    const good = validateContentDoc(preIssueInput({ revisions: [{ ...revision, reader_note: "Updated.", follow_up_due: "2026-02-01" }] }));
    expect(good.ok).toBe(true);
  });
});

describe("contentBlockers — 금지 표현", () => {
  it("block 규칙은 draft 여도 막고 warn 규칙은 알리기만 한다 (경로 포함)", () => {
    const input = preIssueInput() as { stages: { why_it_matters: { points: string[] } }; cover: { hook: string } };
    input.stages.why_it_matters.points = ["무료 공개"];
    input.cover.hook = "Read it for free";
    const { block, warn } = contentBlockers(body(input), { banned, formats: [] });
    expect(block.map((f) => [f.code, f.path])).toEqual([["banned_expression", "stages.why_it_matters.points[0]"]]);
    expect(warn.some((f) => f.code === "banned_expression" && f.path === "cover.hook")).toBe(true);
  });

  it("강조 표기(**)를 사이에 끼워도 금지 표현을 잡는다", () => {
    const input = preIssueInput() as { stages: { why_it_matters: { points: string[] } } };
    input.stages.why_it_matters.points = ["무**료** 공개"];
    expect(contentBlockers(body(input), { banned, formats: [] }).block).toHaveLength(1);
  });
});

describe("contentBlockers — 글자 상한", () => {
  const long = (n: number) => "가".repeat(n);

  it("가정값 상한을 넘으면 warn, 1.5배를 넘으면 block", () => {
    const over = preIssueInput() as { stages: { why_it_matters: { points: string[] } } };
    over.stages.why_it_matters.points = [long(35)];
    const warned = contentBlockers(body(over), rules);
    expect(warned.block).toEqual([]);
    expect(warned.warn.find((f) => f.code === "char_limit")).toMatchObject({ path: "stages.why_it_matters", message: expect.stringContaining("35자 > 상한 30자") as string });

    over.stages.why_it_matters.points = [long(46)];
    expect(contentBlockers(body(over), rules).block.map((f) => f.code)).toEqual(["char_limit"]);
  });

  it("확정 상한(provisional 아님)은 넘으면 곧바로 block, 장 수만큼 상한이 늘어난다", () => {
    const input = researchInput() as { stages: { tool: Record<string, unknown> } };
    input.stages.tool = { ...input.stages.tool, purpose: long(15), how_to_use: [long(4)] };
    const total = slotCharCounts(body(input)).find((s) => s.slot === "tool")?.chars ?? 0;
    expect(total).toBeGreaterThan(20); // 장당 10자 × 2장 = 20자 상한
    expect(contentBlockers(body(input), rules).block.map((f) => f.code)).toContain("char_limit");
  });

  it("표지는 제목만 센다", () => {
    const input = preIssueInput() as { cover: { title: string } };
    input.cover.title = long(21);
    expect(contentBlockers(body(input), rules).warn.some((f) => f.path === "cover.title" && f.code === "char_limit")).toBe(true);
  });
});

describe("contentBlockers — 출처·기준 시점", () => {
  it("draft 는 빠진 칸을 warn 으로 알리고, verified 는 같은 사유로 block 한다", () => {
    const withClaim = { claims: [{ kind: "fact", text: "A fact 5", basis: "researched" }] };
    const draft = contentBlockers(body(preIssueInput(withClaim)), { banned, formats: [] });
    expect(draft.block).toEqual([]);
    expect(draft.warn.some((f) => f.code === "source_missing" && f.message.startsWith("[draft] "))).toBe(true);
    expect(draft.warn.some((f) => f.code === "as_of_missing" && f.path === "as_of")).toBe(true);

    const verified = contentBlockers(body(preIssueInput({ ...withClaim, status: "verified" })), { banned, formats: [] });
    expect(verified.block.some((f) => f.code === "source_missing" && f.path === "claims[0]")).toBe(true);
    expect(verified.warn).toEqual([]);
  });

  it("출처를 다 갖춘 verified 이전 편은 막히지 않는다", () => {
    const input = preIssueInput({
      status: "verified",
      as_of: "2026-01-02T00:00:00Z",
      importance: "major",
      operator_view: "view",
      event: { name: "e", kind: "data_release", scheduled_at: "2026-01-03T00:00:00Z", timezone: "UTC" },
      claims: [sourcedFact],
    });
    expect(contentBlockers(body(input), { banned, formats: [] })).toEqual({ block: [], warn: [] });
  });

  it("편의 as_of 가 claim 의 as_of 보다 이르면 block", () => {
    const input = preIssueInput({ status: "verified", as_of: "2025-12-31T00:00:00Z", claims: [sourcedFact] });
    expect(contentBlockers(body(input), { banned, formats: [] }).block.some((f) => f.path === "as_of" && f.message.includes("가장 늦은"))).toBe(true);
  });

  it("claim 종류별 필수: 시장 반응은 분 단위 시각, 해석은 근거 claim, 직접 경험은 experience", () => {
    const claims = [
      { ...sourcedFact, id: "m", kind: "market_reaction", as_of: "2026-01-01" },
      { id: "i1", kind: "interpretation", basis: "researched", text: "view", as_of: "2026-01-01" },
      { id: "i2", kind: "interpretation", basis: "experienced", text: "view", as_of: "2026-01-01", based_on: ["nope"] },
      { id: "f", kind: "fact", basis: "experienced", text: "tried it", as_of: "2026-01-01" },
      { id: "s", kind: "scenario", basis: "researched", text: "if x", as_of: "2026-01-01" },
    ];
    const messages = contentBlockers(body(preIssueInput({ status: "verified", claims })), { banned, formats: [] }).block.map((f) => `${f.path} ${f.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining("claims[0] 시장 반응의 as_of 는 분 단위"),
        expect.stringContaining("claims[1] 해석은 based_on"),
        expect.stringContaining("claims[2] based_on 이 없는 claim 을 가리킨다: nope"),
        expect.stringContaining("claims[2] 직접 경험(experience)"),
        expect.stringContaining("claims[3] 직접 경험(experience: what·when·data_location)"),
        expect.stringContaining("claims[4] 시나리오는 condition"),
        expect.stringContaining("claims 시나리오 claim 은 같은 편에 둘 이상"),
      ]),
    );
  });

  it("자동 초안(drafted_by: assistant)은 사람이 저장하기 전에는 verified 불가", () => {
    const input = preIssueInput({ status: "verified", claims: [{ ...sourcedFact, drafted_by: "assistant" }] });
    expect(contentBlockers(body(input), { banned, formats: [] }).block.some((f) => f.message.includes("drafted_by: assistant"))).toBe(true);
  });
});

describe("contentBlockers — 이후 편·연구 편 고유 조건", () => {
  it("이후 편: evidence_ready 가 거짓이면 발행 불가, 이전 편이 있으면 시나리오 대응이 있어야 한다", () => {
    const input = postIssueInput({ status: "verified" }) as { stages: { result_vs_expectation: { scenario_outcomes: unknown[] } } };
    input.stages.result_vs_expectation.scenario_outcomes = [];
    const paths = contentBlockers(body(input), { banned, formats: [] }).block.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(["evidence_ready", "stages.result_vs_expectation.scenario_outcomes", "event.occurred_at", "claims"]));
    const noPre = postIssueInput({ status: "verified", links: { pre_issue_id: null } }) as { stages: { result_vs_expectation: { scenario_outcomes: unknown[] } } };
    noPre.stages.result_vs_expectation.scenario_outcomes = [];
    expect(contentBlockers(body(noPre), { banned, formats: [] }).block.map((f) => f.path)).not.toContain("stages.result_vs_expectation.scenario_outcomes");
  });

  it("연구 편(도구): 한계·검증 범위가 비면 verified 불가, 조건은 같은 편 또는 conditions 편에", () => {
    const input = researchInput({ status: "verified" }) as { stages: { tool: Record<string, unknown> } };
    input.stages.tool = { ...input.stages.tool, limits: null, verified_scope: null, applies_when: [], not_when: [] };
    const paths = contentBlockers(body(input), { banned, formats: [] }).block.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(["stages.tool.limits", "stages.tool.verified_scope", "stages.tool"]));
    const linked = researchInput({ status: "verified", links: { origin_post_id: null, conditions_post_id: "cond-1" } }) as { stages: { tool: Record<string, unknown> } };
    linked.stages.tool = { ...linked.stages.tool, applies_when: [], not_when: [] };
    expect(contentBlockers(body(linked), { banned, formats: [] }).block.map((f) => f.path)).not.toContain("stages.tool");
  });

  it("연구 편: 구분 필드(kind·basis)가 없는 claim 은 verified 불가", () => {
    const input = researchInput({ status: "verified", claims: [{ text: "claim", source_url: "u", accessed_at: "2026-01-01", quote: "q" }] });
    expect(contentBlockers(body(input), { banned, formats: [] }).block.some((f) => f.path === "claims[0]" && f.message.includes("kind·basis"))).toBe(true);
  });
});
