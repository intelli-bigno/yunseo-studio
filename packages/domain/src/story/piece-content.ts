// 작성 편의 종류·승인 대상 내용 해시·기준 시점 — authoring·fields·document 가 함께 쓰는 바닥 모듈(이 파일은 그 셋을 import 하지 않는다).
import { sha256Hex } from "./sha256";
import type { Piece, PieceClaim, PieceKind } from "./model";

export const AUTHORING_KINDS = ["pre", "post", "research"] as const;
export type AuthoringKind = (typeof AUTHORING_KINDS)[number];
export const isAuthoringKind = (k: PieceKind): k is AuthoringKind => (AUTHORING_KINDS as readonly string[]).includes(k);

// ───────────────────────────── 승인 대상 내용 해시 ─────────────────────────────

/** 정렬된 키로 직렬화 — 같은 내용이면 같은 문자열 */
export function canonical(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}

/** 문장의 내용 칸(확인 표시 제외) */
// [L7] tier·condition 은 값이 있을 때만 들어간다(undefined 는 canonical 이 뺀다) — 예전 편의 해시·승인이 그대로 유지된다
export const claimContent = (c: PieceClaim) => ({ id: c.id, mark: c.mark, basis: c.basis, text: c.text, publisher: c.publisher ?? null, url: c.url ?? null, quote: c.quote ?? null, accessedAt: c.accessedAt ?? null, asOf: c.asOf ?? null, basedOn: c.basedOn ?? [], tier: c.tier || undefined, condition: c.condition?.trim() || undefined, experience: c.experience ?? undefined });

/** 승인 대상 = 독자에게 나가는 내용. 상태·게이트·확인 표시·게시 예정 시각·자료 확보 체크는 빼고 본다 */
export function contentOf(p: Piece): unknown {
  return {
    kind: p.kind,
    title: p.title,
    viewpoint: p.viewpoint,
    preIssueId: p.preIssueId ?? null,
    stages: p.stages.map((s) => ({ key: s.key, body: s.body })),
    claims: p.claims.map(claimContent),
    scenarios: p.scenarios ?? [],
    checks: p.checks ?? [],
    scenarioOutcomes: p.scenarioOutcomes ?? [],
    checkResults: p.checkResults ?? [],
    // [L7] 구조 칸 — 비었으면 빼서 예전 편의 해시가 바뀌지 않게 한다
    fields: p.fields && Object.keys(p.fields).length ? p.fields : undefined,
  };
}

export function contentHash(p: Piece): string {
  return sha256Hex(canonical(contentOf(p)));
}

/** 편 전체 기준 시점 = 문장들의 가장 늦은 as_of(01 §5 규칙 5) */
export function pieceAsOf(p: Piece): string | null {
  const xs = p.claims.map((c) => c.asOf).filter((x): x is string => !!x).sort();
  return xs[xs.length - 1] ?? null;
}
