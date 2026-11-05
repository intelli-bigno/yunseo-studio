// 콘텐츠 정본 스키마 — 「이슈 이후」 4단 카드 (포맷 post-issue-4). 무엇이 달라졌는가.
// 정본 설계는 docs/01-content-sot.md §4.3. 이전 편(pre-issue-5)의 시나리오·확인 항목을 id 로 가리켜 닫는다.
import { Issues, type ValidationResult } from "../validation";
import { blockFinding, type ContentFinding } from "./claims";
import { envelopeFindings, findingLine, plainText, readEnvelope, type ContentText, type Envelope } from "./envelope";
import { EVENT_KINDS, type EventKind } from "./pre-issue";

export const POST_ISSUE_SCHEMA = "post-issue-4/v1";

/** 4단 순서 = 정본. presets/format/post-issue-4.yaml 의 stages 와 같아야 한다(테스트가 대조). */
export const POST_STAGE_KEYS = ["result_vs_expectation", "market_reaction", "judgment_update", "next_variables"] as const;
export type PostStageKey = (typeof POST_STAGE_KEYS)[number];

/** matched 맞았다 / partial 일부 / diverged 갈라졌다 / unresolved 아직 모른다 */
export const POST_SCENARIO_OUTCOMES = ["matched", "partial", "diverged", "unresolved"] as const;
export type PostScenarioOutcomeKind = (typeof POST_SCENARIO_OUTCOMES)[number];

export const CHECK_STATUSES = ["done", "not_available", "dropped"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

export const JUDGMENT_STATUSES = ["kept", "revised", "dropped"] as const;
export type JudgmentStatus = (typeof JUDGMENT_STATUSES)[number];

export interface PostScenarioOutcome {
  /** 이전 편 scenarios.items[].id (없으면 label) */
  scenario_id: string;
  outcome: PostScenarioOutcomeKind;
  note: string;
}
export interface PostCheckResult {
  /** 이전 편 after_checks.checks[].id */
  check_id: string;
  status: CheckStatus;
  note: string;
}
export interface JudgmentItem {
  /** 이전 편의 어떤 판단인지 */
  judgment: string;
  status: JudgmentStatus;
  reason: string;
  /** 근거 claim id */
  based_on: string[];
}
export interface NextVariable {
  variable: string;
  why: string;
  where: string;
  when?: string;
}

export interface PostIssueCard extends Envelope {
  schema: typeof POST_ISSUE_SCHEMA;
  type: "post_issue";
  /** pre_issue_id: 이전 편. null 이면 사전 시나리오가 없던 사건이다(소급해서 만든 것처럼 쓰지 않는다) */
  links: { pre_issue_id: string | null };
  /** 발행 전 자료 확보 조건(사람 판단, docs/01 §4.3): 1차 자료 확인·관측 시간·시나리오 전부 대응·사실/반응/해석 분리 */
  evidence_ready: boolean;
  event: { name: string; kind: EventKind; occurred_at: string | null; timezone: string | null };
  cover: { title: string; hook: string };
  stages: {
    result_vs_expectation: {
      headline: string;
      actual_result: string;
      expectation_gap: string;
      scenario_outcomes: PostScenarioOutcome[];
      check_results: PostCheckResult[];
    };
    market_reaction: { headline: string; points: string[] };
    judgment_update: { headline: string; items: JudgmentItem[] };
    next_variables: { headline: string; items: NextVariable[] };
  };
}

export function validatePostIssueCard(input: unknown): ValidationResult<PostIssueCard> {
  const e = new Issues();
  const root = e.record(input, "$");
  if (root["schema"] !== POST_ISSUE_SCHEMA) e.add("schema", `${POST_ISSUE_SCHEMA} 여야 한다`);

  const links = e.record(root["links"], "links");
  const event = e.record(root["event"], "event");
  const cover = e.record(root["cover"], "cover");
  const stages = e.record(root["stages"], "stages");
  const result = e.record(stages["result_vs_expectation"], "stages.result_vs_expectation");
  const reaction = e.record(stages["market_reaction"], "stages.market_reaction");
  const judgment = e.record(stages["judgment_update"], "stages.judgment_update");
  const next = e.record(stages["next_variables"], "stages.next_variables");
  if (typeof root["evidence_ready"] !== "boolean") e.add("evidence_ready", "true | false 여야 한다");

  const card: PostIssueCard = {
    schema: POST_ISSUE_SCHEMA,
    type: "post_issue",
    ...readEnvelope(e, root, "post_issue"),
    links: { pre_issue_id: e.textOrNull(links["pre_issue_id"], "links.pre_issue_id") },
    evidence_ready: root["evidence_ready"] === true,
    event: {
      name: e.text(event["name"], "event.name"),
      kind: e.oneOf(event["kind"], EVENT_KINDS, "event.kind", "other"),
      occurred_at: e.textOrNull(event["occurred_at"], "event.occurred_at"),
      timezone: e.textOrNull(event["timezone"], "event.timezone"),
    },
    cover: { title: e.text(cover["title"], "cover.title"), hook: e.text(cover["hook"], "cover.hook") },
    stages: {
      result_vs_expectation: {
        headline: e.text(result["headline"], "stages.result_vs_expectation.headline"),
        actual_result: e.text(result["actual_result"], "stages.result_vs_expectation.actual_result"),
        expectation_gap: e.text(result["expectation_gap"], "stages.result_vs_expectation.expectation_gap"),
        scenario_outcomes: e.array(result["scenario_outcomes"], "stages.result_vs_expectation.scenario_outcomes").map((raw, i) => {
          const p = `stages.result_vs_expectation.scenario_outcomes[${i}]`;
          const o = e.record(raw, p);
          return {
            scenario_id: e.text(o["scenario_id"], `${p}.scenario_id`),
            outcome: e.oneOf(o["outcome"], POST_SCENARIO_OUTCOMES, `${p}.outcome`, "unresolved"),
            note: e.text(o["note"], `${p}.note`),
          };
        }),
        check_results: e.array(result["check_results"], "stages.result_vs_expectation.check_results").map((raw, i) => {
          const p = `stages.result_vs_expectation.check_results[${i}]`;
          const c = e.record(raw, p);
          return {
            check_id: e.text(c["check_id"], `${p}.check_id`),
            status: e.oneOf(c["status"], CHECK_STATUSES, `${p}.status`, "not_available"),
            note: e.text(c["note"], `${p}.note`),
          };
        }),
      },
      market_reaction: {
        headline: e.text(reaction["headline"], "stages.market_reaction.headline"),
        points: e.textArray(reaction["points"], "stages.market_reaction.points", 1),
      },
      judgment_update: {
        headline: e.text(judgment["headline"], "stages.judgment_update.headline"),
        items: e.array(judgment["items"], "stages.judgment_update.items", 1).map((raw, i) => {
          const p = `stages.judgment_update.items[${i}]`;
          const j = e.record(raw, p);
          return {
            judgment: e.text(j["judgment"], `${p}.judgment`),
            status: e.oneOf(j["status"], JUDGMENT_STATUSES, `${p}.status`, "kept"),
            reason: e.text(j["reason"], `${p}.reason`),
            based_on: e.textArray(j["based_on"], `${p}.based_on`),
          };
        }),
      },
      next_variables: {
        headline: e.text(next["headline"], "stages.next_variables.headline"),
        items: e.array(next["items"], "stages.next_variables.items", 1).map((raw, i) => {
          const p = `stages.next_variables.items[${i}]`;
          const v = e.record(raw, p);
          const item: NextVariable = {
            variable: e.text(v["variable"], `${p}.variable`),
            why: e.text(v["why"], `${p}.why`),
            where: e.text(v["where"], `${p}.where`),
          };
          if (v["when"] !== undefined) item.when = e.text(v["when"], `${p}.when`);
          return item;
        }),
      },
    },
  };
  return e.result(card);
}

/** 독자에게 보이는 모든 문장과 그 위치. 강조 표기(**)는 벗긴다 */
export function collectPostIssueTexts(card: PostIssueCard): ContentText[] {
  const s = card.stages;
  const out: ContentText[] = [
    { path: "cover.title", text: card.cover.title },
    { path: "cover.hook", text: card.cover.hook },
    { path: "stages.result_vs_expectation.headline", text: s.result_vs_expectation.headline },
    { path: "stages.result_vs_expectation.actual_result", text: s.result_vs_expectation.actual_result },
    { path: "stages.result_vs_expectation.expectation_gap", text: s.result_vs_expectation.expectation_gap },
    { path: "stages.market_reaction.headline", text: s.market_reaction.headline },
    ...s.market_reaction.points.map((text, i) => ({ path: `stages.market_reaction.points[${i}]`, text })),
    { path: "stages.judgment_update.headline", text: s.judgment_update.headline },
    { path: "stages.next_variables.headline", text: s.next_variables.headline },
  ];
  s.result_vs_expectation.scenario_outcomes.forEach((x, i) =>
    out.push({ path: `stages.result_vs_expectation.scenario_outcomes[${i}].note`, text: x.note }),
  );
  s.result_vs_expectation.check_results.forEach((x, i) => out.push({ path: `stages.result_vs_expectation.check_results[${i}].note`, text: x.note }));
  s.judgment_update.items.forEach((x, i) => {
    const p = `stages.judgment_update.items[${i}]`;
    out.push({ path: `${p}.judgment`, text: x.judgment }, { path: `${p}.reason`, text: x.reason });
  });
  s.next_variables.items.forEach((x, i) => {
    const p = `stages.next_variables.items[${i}]`;
    out.push({ path: `${p}.variable`, text: x.variable }, { path: `${p}.why`, text: x.why }, { path: `${p}.where`, text: x.where });
    if (x.when !== undefined) out.push({ path: `${p}.when`, text: x.when });
  });
  if (card.operator_view !== null) out.push({ path: "operator_view", text: card.operator_view });
  return out.map((t) => ({ path: t.path, text: plainText(t.text) }));
}

export function postIssueFindings(card: PostIssueCard): ContentFinding[] {
  const out: ContentFinding[] = [];
  if (!card.evidence_ready) out.push(blockFinding("verification", "evidence_ready", "자료 확보 조건(1차 자료·관측 시간·시나리오 대응·사실/반응/해석 분리)을 사람이 확인하기 전에는 발행 불가"));
  if (card.event.occurred_at === null) out.push(blockFinding("verification", "event.occurred_at", "사건 일시가 비어 있다"));
  if (card.event.timezone === null) out.push(blockFinding("verification", "event.timezone", "시간대 명시 필요"));
  if (card.links.pre_issue_id !== null && card.stages.result_vs_expectation.scenario_outcomes.length === 0) {
    out.push(blockFinding("verification", "stages.result_vs_expectation.scenario_outcomes", "이전 편 시나리오 전부에 대응(scenario_outcomes)이 있어야 한다 — 누락 = 차단"));
  }
  if (!card.claims.some((c) => c.kind === "market_reaction")) {
    out.push(blockFinding("source_missing", "claims", "시장 반응(market_reaction) claim 이 없다 — 관측한 반응은 출처와 분 단위 기준 시점이 필요하다"));
  }
  out.push(...envelopeFindings(card, collectPostIssueTexts(card), { importance: true }));
  return out;
}

export function postIssueBlockers(card: PostIssueCard): string[] {
  return postIssueFindings(card).map(findingLine);
}
