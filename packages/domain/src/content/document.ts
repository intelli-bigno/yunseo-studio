// 콘텐츠 정본 통합 진입점 — 어떤 종이든 validateContentDoc 하나로 읽고, contentBlockers 하나로 렌더 전 검사를 한다.
// 순수 함수. 프리셋 파일을 읽는 일은 presets-schema 가 하고, 여기에는 그 결과(규칙 데이터)만 들어온다.
import { Issues, isRecord, type ValidationResult } from "../validation";
import { findBannedExpressions, type BannedExpressionRule } from "../compliance/expressions";
import type { ContentFinding } from "./claims";
import { charCount, type ContentText } from "./envelope";
import {
  POST_ISSUE_SCHEMA,
  collectPostIssueTexts,
  postIssueFindings,
  validatePostIssueCard,
  type PostIssueCard,
} from "./post-issue";
import {
  PRE_ISSUE_SCHEMA,
  collectCardTexts,
  preIssueFindings,
  validatePreIssueCard,
  type PreIssueCard,
} from "./pre-issue";
import {
  RESEARCH_SCHEMA,
  collectResearchTexts,
  researchFindings,
  validateResearchPost,
  type ResearchPost,
} from "./research";

export type ContentBody = PreIssueCard | PostIssueCard | ResearchPost;
export const CONTENT_SCHEMAS = [PRE_ISSUE_SCHEMA, POST_ISSUE_SCHEMA, RESEARCH_SCHEMA] as const;

/** 파이프라인 계약(ContentDocument.kind)에 쓰는 종 이름 */
export function contentKindOf(body: ContentBody): "pre-issue" | "post-issue" | "research" {
  switch (body.type) {
    case "pre_issue":
      return "pre-issue";
    case "post_issue":
      return "post-issue";
    case "research":
      return "research";
  }
}

/** `pre-issue-5/v1` → `pre-issue-5` (presets/format 의 id) */
export function formatIdOf(schema: string): string {
  return schema.split("/")[0] ?? schema;
}

/** 스키마 식별자(`schema`)를 보고 맞는 검증기로 보낸다. 모르는 스키마·객체가 아닌 입력은 오류로 돌려준다(예외 없음) */
export function validateContentDoc(input: unknown): ValidationResult<ContentBody> {
  const schema = isRecord(input) ? input["schema"] : undefined;
  switch (schema) {
    case PRE_ISSUE_SCHEMA:
      return validatePreIssueCard(input);
    case POST_ISSUE_SCHEMA:
      return validatePostIssueCard(input);
    case RESEARCH_SCHEMA:
      return validateResearchPost(input);
    default: {
      const e = new Issues();
      e.add("schema", `${CONTENT_SCHEMAS.join(" | ")} 중 하나여야 한다`);
      return e.result(undefined as never);
    }
  }
}

/** 독자에게 보이는 모든 문장과 그 위치 (강조 표기 제거). 금지 표현·수치 검사의 공통 입력 */
export function collectContentTexts(body: ContentBody): ContentText[] {
  switch (body.schema) {
    case PRE_ISSUE_SCHEMA:
      return collectCardTexts(body);
    case POST_ISSUE_SCHEMA:
      return collectPostIssueTexts(body);
    case RESEARCH_SCHEMA:
      return collectResearchTexts(body);
  }
}

/** draft → verified 로 올리기 전에 막는 사유(구조화). 모두 block 으로 만들어 돌려준다 */
export function contentVerificationFindings(body: ContentBody): ContentFinding[] {
  switch (body.schema) {
    case PRE_ISSUE_SCHEMA:
      return preIssueFindings(body);
    case POST_ISSUE_SCHEMA:
      return postIssueFindings(body);
    case RESEARCH_SCHEMA:
      return researchFindings(body);
  }
}

// ───── 포맷 프리셋에서 오는 규칙 (presets-schema 의 FormatPreset 이 구조적으로 맞는다) ─────

/** 카드 장면 하나(질문 말풍선 Q 와 기본 답 띠 A) — 언어 코드별 문구. 한 슬롯이 여러 장이면 장마다 하나씩 */
export interface FormatPage {
  q: Readonly<Record<string, string>>;
  a?: Readonly<Record<string, string>>;
}
export interface FormatCard {
  slot: string;
  stage: string | null;
  /** 카드 한 장의 글 영역 글자 수 상한. null 이면 상한 없음 */
  max_chars: number | null;
  pages?: readonly FormatPage[];
}
export interface FormatSpec {
  id: string;
  /** 상한이 실측 전 가정값인가 — 그렇다면 넘어도 warn 이다 */
  limits_provisional: boolean;
  cards: readonly FormatCard[];
}

export interface ContentRules {
  banned: readonly BannedExpressionRule[];
  formats: readonly FormatSpec[];
}

/** 슬롯 상한 허용치: 가정값 상한을 이만큼 넘으면 가정값이어도 막는다 (레이아웃이 넘칠 위험) */
export const HARD_LIMIT_FACTOR = 1.5;

export interface SlotChars {
  slot: string;
  path: string;
  chars: number;
}

const sum = (texts: readonly string[]) => texts.reduce((n, t) => n + charCount(t), 0);

/** 카드 슬롯별 글 영역 글자 수 — 상한(max_chars) 검사의 입력. 질문·답 띠(headline)는 세지 않는다 */
export function slotCharCounts(body: ContentBody): SlotChars[] {
  const cover: SlotChars = { slot: "cover", path: "cover.title", chars: charCount(body.cover.title) };
  switch (body.schema) {
    case PRE_ISSUE_SCHEMA: {
      const s = body.stages;
      return [
        cover,
        { slot: "why_it_matters", path: "stages.why_it_matters", chars: sum(s.why_it_matters.points) },
        { slot: "market_expectation", path: "stages.market_expectation", chars: sum(s.market_expectation.points) },
        { slot: "scenarios", path: "stages.scenarios", chars: sum(s.scenarios.items.flatMap((x) => [x.label, x.condition, x.reading])) },
        { slot: "transmission", path: "stages.transmission", chars: sum(s.transmission.paths.flatMap((x) => [x.channel, x.via, ...x.touches])) },
        {
          slot: "after_checks",
          path: "stages.after_checks",
          chars: sum([...s.after_checks.checks.flatMap((x) => [x.what, x.where]), ...(s.after_checks.closing === undefined ? [] : [s.after_checks.closing])]),
        },
      ];
    }
    case POST_ISSUE_SCHEMA: {
      const s = body.stages;
      return [
        cover,
        {
          slot: "result_vs_expectation",
          path: "stages.result_vs_expectation",
          chars: sum([
            s.result_vs_expectation.actual_result,
            s.result_vs_expectation.expectation_gap,
            ...s.result_vs_expectation.scenario_outcomes.map((x) => x.note),
            ...s.result_vs_expectation.check_results.map((x) => x.note),
          ]),
        },
        { slot: "market_reaction", path: "stages.market_reaction", chars: sum(s.market_reaction.points) },
        { slot: "judgment_update", path: "stages.judgment_update", chars: sum(s.judgment_update.items.flatMap((x) => [x.judgment, x.reason])) },
        { slot: "next_variables", path: "stages.next_variables", chars: sum(s.next_variables.items.flatMap((x) => [x.variable, x.why, x.where, ...(x.when === undefined ? [] : [x.when])])) },
      ];
    }
    case RESEARCH_SCHEMA: {
      const text = collectResearchTexts(body)
        .filter((t) => t.path.startsWith(`stages.${body.stage}.`) && !t.path.endsWith(".headline"))
        .map((t) => t.text);
      return [cover, { slot: body.stage, path: `stages.${body.stage}`, chars: sum(text) }];
    }
  }
}

export interface ContentBlockers {
  /** 하나라도 있으면 렌더·게시를 거부한다 */
  block: ContentFinding[];
  /** 거부하지는 않지만 사람이 보고 판정한다 */
  warn: ContentFinding[];
}

/**
 * 렌더 전 검사 — 금지 표현·글자 상한·출처/기준 시점 누락.
 * - 금지 표현: 규칙의 severity 그대로 (brief 원문 금지어는 block, 영어 제안은 warn)
 * - 글자 상한: max_chars × 장 수. 가정값(limits_provisional)이면 warn, 상한의 HARD_LIMIT_FACTOR 배를 넘으면 block
 * - 출처·기준 시점·운영자 해석 등 verified 조건: status 가 verified 면 block, draft 면 warn (초안 미리보기는 허용)
 */
export function contentBlockers(body: ContentBody, rules: ContentRules): ContentBlockers {
  const block: ContentFinding[] = [];
  const warn: ContentFinding[] = [];
  const push = (f: ContentFinding) => (f.severity === "block" ? block : warn).push(f);

  for (const { path, text } of collectContentTexts(body)) {
    for (const hit of findBannedExpressions(text, "body", rules.banned)) {
      push({ severity: hit.severity, code: "banned_expression", path, message: `금지 표현 「${hit.matched}」 (${hit.ruleId})` });
    }
  }

  const format = rules.formats.find((f) => f.id === formatIdOf(body.schema));
  if (format) {
    for (const { slot, path, chars } of slotCharCounts(body)) {
      const card = format.cards.find((c) => c.slot === slot);
      if (!card || card.max_chars === null) continue;
      const limit = card.max_chars * (card.pages?.length ?? 1);
      if (chars <= limit) continue;
      const hard = chars > limit * HARD_LIMIT_FACTOR;
      push({
        severity: hard || !format.limits_provisional ? "block" : "warn",
        code: "char_limit",
        path,
        message: `${chars}자 > 상한 ${limit}자${format.limits_provisional ? " (가정값)" : ""}${hard ? " — 레이아웃이 넘칠 위험" : ""}`,
      });
    }
  }

  const verified = body.status === "verified";
  for (const f of contentVerificationFindings(body)) {
    push({ ...f, severity: verified ? "block" : "warn", message: verified ? f.message : `[draft] ${f.message}` });
  }
  return { block, warn };
}
