// [L2] 편(Piece) → 콘텐츠 정본 본문(렌더 입력). 렌더·릴스·캡션은 이 본문 하나만 쓴다(02 §2: 사본 금지).
// ① 이전 편은 기존 정본 스키마 pre-issue-5/v1(content/pre-issue.ts)을 그대로 통과해야 한다.
// ②·③ 은 코드 스키마가 아직 없어(01 §4 「후속」) 공통 봉투 + 단 + 구분 문장 모양(post-issue-4/v1·research-5/v1 잠정)으로 낸다.
import { validatePreIssueCard, type PreIssueCard } from "../content/pre-issue";
import { contentHash, isAuthoringKind, pieceAsOf, type AuthoringKind } from "./authoring";
import type { Piece, PieceClaim } from "./model";

export const DOCUMENT_SCHEMAS: Record<AuthoringKind, string> = { pre: "pre-issue-5/v1", post: "post-issue-4/v1", research: "research-5/v1" };
export const CONTRACT_KIND: Record<AuthoringKind, "pre-issue" | "post-issue" | "research"> = { pre: "pre-issue", post: "post-issue", research: "research" };

export interface DocumentClaim {
  id: string;
  kind: "fact" | "market_reaction" | "interpretation" | "scenario";
  basis: "researched" | "experienced";
  text: string;
  as_of: string | null;
  source: { url: string; publisher: string | null; accessed_at: string | null; quote: string | null } | null;
  based_on: string[];
}

/** ②·③ 공통 봉투(01 §4.1) */
export interface AuthoringEnvelope {
  schema: string;
  id: string;
  type: "pre_issue" | "post_issue" | "research";
  status: "draft" | "verified";
  language: string;
  as_of: string | null;
  title: string;
  operator_view: string;
  stages: { key: string; title: string; body: string }[];
  claims: DocumentClaim[];
  links: { pre_issue_id: string | null };
  scenario_outcomes: { scenario_id: string; outcome: string; note: string }[];
  check_results: { check_id: string; status: string; note: string }[];
  content_hash: string;
}

export type DocumentResult = { ok: true; schema: string; kind: "pre-issue" | "post-issue" | "research"; body: PreIssueCard | AuthoringEnvelope } | { ok: false; errors: string[] };

const KIND: Record<PieceClaim["mark"], DocumentClaim["kind"]> = { fact: "fact", reaction: "market_reaction", view: "interpretation", scenario: "scenario" };

const docClaim = (c: PieceClaim): DocumentClaim => ({
  id: c.id,
  kind: KIND[c.mark],
  basis: c.basis === "research" ? "researched" : "experienced",
  text: c.text,
  as_of: c.asOf,
  source: c.url ? { url: c.url, publisher: c.publisher, accessed_at: c.accessedAt, quote: c.quote } : null,
  based_on: c.basedOn ?? [],
});

const lines = (body: string) =>
  body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** 단 본문 → 제목 한 줄 + 나머지 줄(없으면 제목 줄을 그대로 한 점으로) */
const headed = (body: string) => {
  const [headline = "", ...rest] = lines(body);
  return { headline, points: rest.length ? rest : headline ? [headline] : [] };
};

export function toContentBody(p: Piece, options: { language?: string } = {}): DocumentResult {
  if (!isAuthoringKind(p.kind)) return { ok: false, errors: ["스토리 편은 카드 정본이 아님"] };
  const language = options.language ?? "en";
  const status = p.status === "idea" || p.status === "selected" || p.status === "evidence_wait" || p.status === "drafted" ? "draft" : "verified";
  const stage = (key: string) => p.stages.find((s) => s.key === key)?.body ?? "";

  if (p.kind === "pre") {
    const why = headed(stage("why_it_matters"));
    const exp = headed(stage("market_expectation"));
    const trans = lines(stage("transmission"));
    const card = {
      schema: DOCUMENT_SCHEMAS.pre,
      id: p.id,
      status,
      language,
      event: { name: p.title, kind: "other", scheduled_at: null, timezone: null },
      cover: { title: p.title, hook: p.viewpoint },
      stages: {
        why_it_matters: why,
        market_expectation: exp,
        scenarios: { headline: lines(stage("scenarios"))[0] ?? "", items: (p.scenarios ?? []).map((s) => ({ label: s.label, condition: s.condition, reading: s.reading })) },
        transmission: {
          headline: trans[0] ?? "",
          // 「결과 → 경로 → 닿는 곳」 한 줄을 경로 하나로 읽는다
          paths: (trans.length > 1 ? trans.slice(1) : trans).map((l) => {
            const parts = l.split(/\s*(?:→|->)\s*/).filter(Boolean);
            return { channel: parts[0] ?? l, via: parts.slice(1, -1).join(" → ") || parts[0] || l, touches: [parts[parts.length - 1] ?? l] };
          }),
        },
        after_checks: { headline: lines(stage("after_checks"))[0] ?? "", checks: (p.checks ?? []).map((c) => ({ what: c.what, where: c.where })) },
      },
      claims: p.claims.map((c) => {
        const out: { text: string; source_url?: string; accessed_at?: string; quote?: string } = { text: c.text };
        if (c.url) out.source_url = c.url;
        if (c.accessedAt) out.accessed_at = c.accessedAt;
        if (c.quote) out.quote = c.quote;
        return out;
      }),
      operator_view: p.viewpoint || null,
    };
    const v = validatePreIssueCard(card);
    return v.ok ? { ok: true, schema: DOCUMENT_SCHEMAS.pre, kind: "pre-issue", body: v.value } : { ok: false, errors: v.errors };
  }

  const errors: string[] = [];
  if (!p.title.trim()) errors.push("title: 비어 있음");
  if (!p.viewpoint.trim()) errors.push("operator_view: 비어 있음");
  if (!p.stages.some((s) => s.body.trim())) errors.push("stages: 하나 이상 작성");
  if (errors.length) return { ok: false, errors };
  const env: AuthoringEnvelope = {
    schema: DOCUMENT_SCHEMAS[p.kind],
    id: p.id,
    type: p.kind === "post" ? "post_issue" : "research",
    status,
    language,
    as_of: pieceAsOf(p),
    title: p.title,
    operator_view: p.viewpoint,
    stages: p.stages.map((s) => ({ key: s.key, title: s.title, body: s.body })),
    claims: p.claims.map(docClaim),
    links: { pre_issue_id: p.preIssueId ?? null },
    scenario_outcomes: (p.scenarioOutcomes ?? []).map((o) => ({ scenario_id: o.scenarioId, outcome: o.outcome, note: o.note })),
    check_results: (p.checkResults ?? []).map((r) => ({ check_id: r.checkId, status: r.status, note: r.note })),
    content_hash: contentHash(p),
  };
  return { ok: true, schema: env.schema, kind: CONTRACT_KIND[p.kind], body: env };
}
