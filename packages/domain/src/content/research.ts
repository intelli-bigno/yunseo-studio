// 콘텐츠 정본 스키마 — 「트레이딩 연구」 (포맷 research-5). 어떻게 판단하고 실행할 것인가.
// 정본 설계는 docs/01-content-sot.md §4.4. 편 하나 = 스레드의 한 단계(stage). 도구·연구는 한계와 검증 범위를 같이 낸다.
import { Issues, type Json, type ValidationResult } from "../validation";
import { blockFinding, type ContentFinding } from "./claims";
import { envelopeFindings, findingLine, plainText, readEnvelope, type ContentText, type Envelope } from "./envelope";

export const RESEARCH_SCHEMA = "research-5/v1";

/** 5단계 순서 = 정본. 스레드는 이 순서로 발전한다. presets/format/research-5.yaml 의 stages 와 같아야 한다(테스트가 대조). */
export const RESEARCH_STAGES = ["idea", "conditions", "failures", "tool", "follow_up"] as const;
export type ResearchStage = (typeof RESEARCH_STAGES)[number];

export interface IdeaStage {
  headline: string;
  /** 가설 한 문장 */
  hypothesis: string;
  /** 무엇이 보이면 가설이 틀리나 */
  falsifier: string;
}
export interface ConditionsStage {
  headline: string;
  applies_when: string[];
  not_when: string[];
  /** 리스크 관리 한도. 수치를 쓰면 claim */
  risk_limits: string;
}
export interface FailureCase {
  case: string;
  what_happened: string;
  why: string;
  what_changed: string;
}
export interface FailuresStage {
  headline: string;
  cases: FailureCase[];
}
export interface ToolStage {
  headline: string;
  name: string;
  purpose: string;
  how_to_use: string[];
  inputs: string;
  outputs: string;
  /** 적용 조건과 한계. verified 에서 필수 */
  limits: string | null;
  /** 실제로 검증한 범위 — 무엇을 어떤 자료로 어디까지 확인했고 무엇은 확인하지 않았나. verified 에서 필수 */
  verified_scope: string | null;
  applies_when: string[];
  not_when: string[];
  /** 배포 안내는 한 줄 이하(선택). 게시물 안의 가치가 먼저다 */
  distribution_note?: string;
}
export interface FollowUpStage {
  headline: string;
  tested: string;
  /** 기간·표본·시장·비용 가정 */
  scope: string;
  result_summary: string;
  still_unknown: string;
  /** 이전 단계 편 중 바뀐 것 (수정 이력 §6 과 연결) */
  changes_to_earlier: string[];
}

interface ResearchBase extends Envelope {
  schema: typeof RESEARCH_SCHEMA;
  type: "research";
  thread: { id: string; topic: string };
  links: {
    /** 이 스레드의 출발이 된 이후(post-issue) 편 — 느슨한 연결 */
    origin_post_id: string | null;
    /** tool 단계 편이 가리키는 같은 스레드의 conditions 편 */
    conditions_post_id: string | null;
  };
  cover: { title: string; hook: string };
}

export type ResearchPost = ResearchBase &
  (
    | { stage: "idea"; stages: { idea: IdeaStage } }
    | { stage: "conditions"; stages: { conditions: ConditionsStage } }
    | { stage: "failures"; stages: { failures: FailuresStage } }
    | { stage: "tool"; stages: { tool: ToolStage } }
    | { stage: "follow_up"; stages: { follow_up: FollowUpStage } }
  );

/** 키가 없으면 null — draft 에서 비워 둘 수 있는 칸 */
function textOrMissing(e: Issues, value: unknown, path: string): string | null {
  return value === undefined ? null : e.textOrNull(value, path);
}

function readStage(e: Issues, stage: ResearchStage, stages: Json): ResearchPost["stages"] {
  const p = `stages.${stage}`;
  const s = e.record(stages[stage], p);
  const headline = e.text(s["headline"], `${p}.headline`);
  switch (stage) {
    case "idea":
      return { idea: { headline, hypothesis: e.text(s["hypothesis"], `${p}.hypothesis`), falsifier: e.text(s["falsifier"], `${p}.falsifier`) } };
    case "conditions":
      return {
        conditions: {
          headline,
          applies_when: e.textArray(s["applies_when"], `${p}.applies_when`, 1),
          not_when: e.textArray(s["not_when"], `${p}.not_when`, 1),
          risk_limits: e.text(s["risk_limits"], `${p}.risk_limits`),
        },
      };
    case "failures":
      return {
        failures: {
          headline,
          cases: e.array(s["cases"], `${p}.cases`, 1).map((raw, i) => {
            const cp = `${p}.cases[${i}]`;
            const c = e.record(raw, cp);
            return {
              case: e.text(c["case"], `${cp}.case`),
              what_happened: e.text(c["what_happened"], `${cp}.what_happened`),
              why: e.text(c["why"], `${cp}.why`),
              what_changed: e.text(c["what_changed"], `${cp}.what_changed`),
            };
          }),
        },
      };
    case "tool": {
      const tool: ToolStage = {
        headline,
        name: e.text(s["name"], `${p}.name`),
        purpose: e.text(s["purpose"], `${p}.purpose`),
        how_to_use: e.textArray(s["how_to_use"], `${p}.how_to_use`, 1),
        inputs: e.text(s["inputs"], `${p}.inputs`),
        outputs: e.text(s["outputs"], `${p}.outputs`),
        limits: textOrMissing(e, s["limits"], `${p}.limits`),
        verified_scope: textOrMissing(e, s["verified_scope"], `${p}.verified_scope`),
        applies_when: s["applies_when"] === undefined ? [] : e.textArray(s["applies_when"], `${p}.applies_when`),
        not_when: s["not_when"] === undefined ? [] : e.textArray(s["not_when"], `${p}.not_when`),
      };
      if (s["distribution_note"] !== undefined) tool.distribution_note = e.text(s["distribution_note"], `${p}.distribution_note`);
      return { tool };
    }
    case "follow_up":
      return {
        follow_up: {
          headline,
          tested: e.text(s["tested"], `${p}.tested`),
          scope: e.text(s["scope"], `${p}.scope`),
          result_summary: e.text(s["result_summary"], `${p}.result_summary`),
          still_unknown: e.text(s["still_unknown"], `${p}.still_unknown`),
          changes_to_earlier: e.textArray(s["changes_to_earlier"], `${p}.changes_to_earlier`),
        },
      };
  }
}

export function validateResearchPost(input: unknown): ValidationResult<ResearchPost> {
  const e = new Issues();
  const root = e.record(input, "$");
  if (root["schema"] !== RESEARCH_SCHEMA) e.add("schema", `${RESEARCH_SCHEMA} 여야 한다`);

  const stage = e.oneOf(root["stage"], RESEARCH_STAGES, "stage", "idea");
  const thread = e.record(root["thread"], "thread");
  const links = root["links"] === undefined ? {} : e.record(root["links"], "links");
  const cover = e.record(root["cover"], "cover");
  const stages = e.record(root["stages"], "stages");
  for (const key of Object.keys(stages)) {
    if (key !== stage) e.add(`stages.${key}`, `이 편의 단계(${stage}) 밖의 본문이다 — 한 편은 한 단계만 담는다`);
  }

  const base: ResearchBase = {
    schema: RESEARCH_SCHEMA,
    type: "research",
    ...readEnvelope(e, root, "research"),
    thread: { id: e.text(thread["id"], "thread.id"), topic: e.text(thread["topic"], "thread.topic") },
    links: {
      origin_post_id: links["origin_post_id"] === undefined ? null : e.textOrNull(links["origin_post_id"], "links.origin_post_id"),
      conditions_post_id: links["conditions_post_id"] === undefined ? null : e.textOrNull(links["conditions_post_id"], "links.conditions_post_id"),
    },
    cover: { title: e.text(cover["title"], "cover.title"), hook: e.text(cover["hook"], "cover.hook") },
  };
  const post = { ...base, stage, stages: readStage(e, stage, stages) } as ResearchPost;
  return e.result(post);
}

/** 독자에게 보이는 모든 문장과 그 위치. 강조 표기(**)는 벗긴다 */
export function collectResearchTexts(post: ResearchPost): ContentText[] {
  const out: ContentText[] = [
    { path: "cover.title", text: post.cover.title },
    { path: "cover.hook", text: post.cover.hook },
    { path: "thread.topic", text: post.thread.topic },
  ];
  const at = (path: string, text: string) => out.push({ path: `stages.${post.stage}.${path}`, text });
  switch (post.stage) {
    case "idea": {
      const s = post.stages.idea;
      at("headline", s.headline);
      at("hypothesis", s.hypothesis);
      at("falsifier", s.falsifier);
      break;
    }
    case "conditions": {
      const s = post.stages.conditions;
      at("headline", s.headline);
      s.applies_when.forEach((t, i) => at(`applies_when[${i}]`, t));
      s.not_when.forEach((t, i) => at(`not_when[${i}]`, t));
      at("risk_limits", s.risk_limits);
      break;
    }
    case "failures": {
      const s = post.stages.failures;
      at("headline", s.headline);
      s.cases.forEach((c, i) => {
        at(`cases[${i}].case`, c.case);
        at(`cases[${i}].what_happened`, c.what_happened);
        at(`cases[${i}].why`, c.why);
        at(`cases[${i}].what_changed`, c.what_changed);
      });
      break;
    }
    case "tool": {
      const s = post.stages.tool;
      at("headline", s.headline);
      at("name", s.name);
      at("purpose", s.purpose);
      s.how_to_use.forEach((t, i) => at(`how_to_use[${i}]`, t));
      at("inputs", s.inputs);
      at("outputs", s.outputs);
      if (s.limits !== null) at("limits", s.limits);
      if (s.verified_scope !== null) at("verified_scope", s.verified_scope);
      s.applies_when.forEach((t, i) => at(`applies_when[${i}]`, t));
      s.not_when.forEach((t, i) => at(`not_when[${i}]`, t));
      if (s.distribution_note !== undefined) at("distribution_note", s.distribution_note);
      break;
    }
    case "follow_up": {
      const s = post.stages.follow_up;
      at("headline", s.headline);
      at("tested", s.tested);
      at("scope", s.scope);
      at("result_summary", s.result_summary);
      at("still_unknown", s.still_unknown);
      s.changes_to_earlier.forEach((t, i) => at(`changes_to_earlier[${i}]`, t));
      break;
    }
  }
  if (post.operator_view !== null) out.push({ path: "operator_view", text: post.operator_view });
  return out.map((t) => ({ path: t.path, text: plainText(t.text) }));
}

export function researchFindings(post: ResearchPost): ContentFinding[] {
  const out: ContentFinding[] = [];
  if (post.stage === "tool") {
    const tool = post.stages.tool;
    if (tool.limits === null) out.push(blockFinding("verification", "stages.tool.limits", "적용 조건과 한계가 비어 있다 — 도구는 한계와 함께 낸다"));
    if (tool.verified_scope === null) out.push(blockFinding("verification", "stages.tool.verified_scope", "실제로 검증한 범위가 비어 있다"));
    const sameStageConditions = tool.applies_when.length > 0 && tool.not_when.length > 0;
    if (!sameStageConditions && post.links.conditions_post_id === null) {
      out.push(blockFinding("verification", "stages.tool", "언제 쓰고 언제 쓰지 않는지(applies_when·not_when)가 같은 편에 있거나 links.conditions_post_id 로 가리켜야 한다"));
    }
  }
  post.claims.forEach((c, i) => {
    // 연구 편은 직접 경험과 조사 내용을 문장 단위로 구분한다
    if (c.kind === undefined || c.basis === undefined) out.push(blockFinding("verification", `claims[${i}]`, "연구 편의 claim 은 kind·basis(조사/직접 경험) 구분이 필요하다"));
  });
  out.push(...envelopeFindings(post, collectResearchTexts(post), { importance: false }));
  return out;
}

export function researchBlockers(post: ResearchPost): string[] {
  return researchFindings(post).map(findingLine);
}
