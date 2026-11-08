// [L2·L7] 편(Piece) → 콘텐츠 정본 본문(렌더 입력). 렌더·릴스·캡션은 이 본문 하나만 쓴다(02 §2: 사본 금지).
// 3종 모두 정식 스키마(pre-issue-5/v1 · post-issue-4/v1 · research-5/v1)로 내고, 같은 검증기(validateContentDoc)를 통과해야 ok 다.
// 단 본문(글)은 「첫 줄 = 카드 제목, 다음 줄부터 점」으로 읽고, 글로 못 채우는 필드는 구조 칸(fields.ts)에서 읽는다.
import type { Claim } from "../content/claims";
import { contentBlockers, contentVerificationFindings, validateContentDoc, type ContentBody, type ContentRules } from "../content/document";
import { contentHash, isAuthoringKind, pieceAsOf, type AuthoringKind } from "./piece-content";
import { listColumns, listLines } from "./fields";
import type { Piece, PieceClaim } from "./model";

export const DOCUMENT_SCHEMAS: Record<AuthoringKind, string> = { pre: "pre-issue-5/v1", post: "post-issue-4/v1", research: "research-5/v1" };
export const CONTRACT_KIND: Record<AuthoringKind, "pre-issue" | "post-issue" | "research"> = { pre: "pre-issue", post: "post-issue", research: "research" };

export type DocumentResult = { ok: true; schema: string; kind: "pre-issue" | "post-issue" | "research"; body: ContentBody; contentHash: string } | { ok: false; errors: string[] };

const KIND: Record<PieceClaim["mark"], NonNullable<Claim["kind"]>> = { fact: "fact", reaction: "market_reaction", view: "interpretation", scenario: "scenario" };

/** 작성 화면의 시각은 KST 벽시계(datetime-local)다 — 시간대가 없으면 +09:00 을 붙여 정본의 「분 단위 + 시간대」 규칙에 맞춘다 */
export const withKstZone = (v: string | null | undefined): string | null => (!v ? null : /T/.test(v) && !/(?:Z|[+-]\d{2}:\d{2})$/.test(v) ? `${v}+09:00` : v);

/** 편 문장 → 정본 claim(01 §5). 구분 필드를 모두 싣는다 — 정본 검사(claimFindings)가 종류별 필수를 본다 */
export function toClaim(c: PieceClaim): Claim {
  const out: Claim = { id: c.id, text: c.text, kind: KIND[c.mark], basis: c.basis === "research" ? "researched" : "experienced", drafted_by: "operator" };
  const asOf = withKstZone(c.asOf);
  if (asOf) out.as_of = asOf;
  if (c.url) out.source_url = c.url;
  if (c.accessedAt) out.accessed_at = c.accessedAt;
  if (c.quote) out.quote = c.quote;
  if (c.publisher) out.publisher = c.publisher;
  if (c.tier) out.tier = c.tier;
  if (c.condition) out.condition = c.condition;
  if (c.basedOn?.length) out.based_on = [...c.basedOn];
  if (c.experience) out.experience = { what: c.experience.what, when: c.experience.when, data_location: c.experience.dataLocation };
  if (c.verified && c.verifiedBy && c.verifiedAt) {
    out.verified_by = c.verifiedBy;
    out.verified_at = withKstZone(c.verifiedAt) ?? c.verifiedAt;
  }
  return out;
}

const lines = (body: string) => listLines(body);

/** 단 본문 → 제목 한 줄 + 나머지 줄(없으면 제목 줄을 그대로 한 점으로) */
const headed = (body: string) => {
  const [headline = "", ...rest] = lines(body);
  return { headline, points: rest.length ? rest : headline ? [headline] : [] };
};

const JUDGMENT: Record<string, string> = { 유지: "kept", 수정: "revised", 폐기: "dropped", kept: "kept", revised: "revised", dropped: "dropped" };

export function toContentBody(p: Piece, options: { language?: string; status?: "draft" | "verified" } = {}): DocumentResult {
  if (!isAuthoringKind(p.kind)) return { ok: false, errors: ["스토리 편은 카드 정본이 아님"] };
  const language = options.language ?? "en";
  const status = options.status ?? (p.status === "idea" || p.status === "selected" || p.status === "evidence_wait" || p.status === "drafted" ? "draft" : "verified");
  const stage = (key: string) => p.stages.find((s) => s.key === key)?.body ?? "";
  const head = (key: string) => lines(stage(key))[0] ?? "";
  const f = (key: string): string | null => p.fields?.[key]?.trim() || null;
  const list = (key: string) => listLines(p.fields?.[key]);

  // 공통 봉투(01 §4.1)
  const envelope = {
    id: p.id,
    status,
    language,
    as_of: withKstZone(pieceAsOf(p)),
    importance: p.kind === "research" ? null : (p.importance ?? null),
    reels: null,
    claims: p.claims.map(toClaim),
    operator_view: p.viewpoint.trim() || null,
    revisions: [],
  };
  const cover = { title: p.title, hook: p.viewpoint };
  const event = (at: "scheduled_at" | "occurred_at") => ({ name: p.title, kind: f("event_kind") ?? "other", [at]: f("event_at"), timezone: f("timezone") });

  let body: unknown;
  if (p.kind === "pre") {
    const trans = lines(stage("transmission"));
    body = {
      schema: DOCUMENT_SCHEMAS.pre,
      type: "pre_issue",
      ...envelope,
      event: event("scheduled_at"),
      cover,
      stages: {
        why_it_matters: headed(stage("why_it_matters")),
        market_expectation: headed(stage("market_expectation")),
        scenarios: { headline: head("scenarios"), items: (p.scenarios ?? []).map((s) => ({ id: s.id, label: s.label, condition: s.condition, reading: s.reading })) },
        transmission: {
          headline: trans[0] ?? "",
          // 「결과 → 경로 → 닿는 곳」 한 줄을 경로 하나로 읽는다
          paths: (trans.length > 1 ? trans.slice(1) : trans).map((l) => {
            const parts = l.split(/\s*(?:→|->)\s*/).filter(Boolean);
            return { channel: parts[0] ?? l, via: parts.slice(1, -1).join(" → ") || parts[0] || l, touches: [parts[parts.length - 1] ?? l] };
          }),
        },
        after_checks: { headline: head("after_checks"), checks: (p.checks ?? []).map((c) => ({ id: c.id, what: c.what, where: c.where })) },
      },
    };
  } else if (p.kind === "post") {
    const ev = p.evidence;
    body = {
      schema: DOCUMENT_SCHEMAS.post,
      type: "post_issue",
      ...envelope,
      links: { pre_issue_id: p.preIssueId ?? null },
      evidence_ready: !!ev && ev.primary && ev.observed && ev.allScenarios && ev.separated,
      event: event("occurred_at"),
      cover,
      stages: {
        result_vs_expectation: {
          headline: head("result_vs_expectation"),
          actual_result: f("result_vs_expectation.actual_result") ?? "",
          expectation_gap: f("result_vs_expectation.expectation_gap") ?? "",
          scenario_outcomes: (p.scenarioOutcomes ?? []).map((o) => ({ scenario_id: o.scenarioId, outcome: o.outcome, note: o.note })),
          check_results: (p.checkResults ?? []).map((r) => ({ check_id: r.checkId, status: r.status, note: r.note })),
        },
        market_reaction: headed(stage("market_reaction")),
        judgment_update: {
          headline: head("judgment_update"),
          items: list("judgment_update.items").map((l) => {
            const [st = "", judgment = "", reason = "", based = ""] = listColumns(l);
            return { judgment, status: JUDGMENT[st] ?? st, reason, based_on: based.split(",").map((x) => x.trim()).filter(Boolean) };
          }),
        },
        next_variables: {
          headline: head("next_variables"),
          items: list("next_variables.items").map((l) => {
            const [variable = "", why = "", where = "", when = ""] = listColumns(l);
            return { variable, why, where, ...(when ? { when } : {}) };
          }),
        },
      },
    };
  } else {
    const st = f("stage") ?? "idea";
    const k = (key: string) => f(`${st}.${key}`);
    const ks = (key: string) => list(`${st}.${key}`);
    const headline = head(st);
    const stageBody: Record<string, unknown> = {
      idea: { headline, hypothesis: k("hypothesis") ?? "", falsifier: k("falsifier") ?? "" },
      conditions: { headline, applies_when: ks("applies_when"), not_when: ks("not_when"), risk_limits: k("risk_limits") ?? "" },
      failures: {
        headline,
        cases: ks("cases").map((l) => {
          const [c = "", what_happened = "", why = "", what_changed = ""] = listColumns(l);
          return { case: c, what_happened, why, what_changed };
        }),
      },
      tool: {
        headline,
        name: k("name") ?? "",
        purpose: k("purpose") ?? "",
        how_to_use: ks("how_to_use"),
        inputs: k("inputs") ?? "",
        outputs: k("outputs") ?? "",
        limits: k("limits"),
        verified_scope: k("verified_scope"),
        applies_when: ks("applies_when"),
        not_when: ks("not_when"),
      },
      follow_up: { headline, tested: k("tested") ?? "", scope: k("scope") ?? "", result_summary: k("result_summary") ?? "", still_unknown: k("still_unknown") ?? "", changes_to_earlier: ks("changes_to_earlier") },
    };
    body = {
      schema: DOCUMENT_SCHEMAS.research,
      type: "research",
      ...envelope,
      stage: st,
      thread: { id: f("thread_id") ?? p.id, topic: f("thread_topic") ?? p.title },
      links: { origin_post_id: null, conditions_post_id: null },
      cover,
      stages: { [st]: stageBody[st] },
    };
  }

  const v = validateContentDoc(body);
  return v.ok ? { ok: true, schema: v.value.schema, kind: CONTRACT_KIND[p.kind], body: v.value, contentHash: contentHash(p) } : { ok: false, errors: v.errors };
}

/** 게이트 판단에 쓰는 렌더 전 검사 규칙(금지 표현·포맷). 없으면 규칙 무관한 확인 조건(출처 없는 수치·기준 시점 등)만 본다 */
export interface GateDocumentContext {
  rules?: ContentRules | null;
  language?: string;
}

/**
 * [L9] 렌더 전 검사(contentBlockers)를 게이트에서 먼저 — 이 편이 「확인됨(verified)」 정본이 된다고 보고 막는 이유를 낸다.
 * G2 통과·G3 승인 조건이다. 렌더에서야 막히던 「출처 없는 수치」 등을 게이트가 먼저 막고 이유를 화면에 보인다.
 */
export function documentGateIssues(p: Piece, ctx: GateDocumentContext = {}): string[] {
  if (!isAuthoringKind(p.kind)) return [];
  const r = toContentBody(p, { status: "verified", ...(ctx.language ? { language: ctx.language } : {}) });
  if (!r.ok) return r.errors.map((e) => `정본 형식 · ${e}`);
  const findings = ctx.rules ? contentBlockers(r.body, ctx.rules).block : contentVerificationFindings(r.body);
  return [...new Set(findings.map((f) => `렌더 전 검사 · ${f.path}: ${f.message}`))];
}
