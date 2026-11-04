// 금지 표현 검사 — 순수 함수. 규칙 데이터는 presets/compliance/banned-expressions.yaml 에 있고,
// 파일 읽기·검증은 presets-schema 어댑터가 맡는다 (domain 은 파일을 모른다).

/** body: 게시물 본문·캡션·카드 문구 / brand_promo: 프로필 소개·한 줄 설명 등 브랜드 전면 홍보 문구 */
export const SURFACES = ["body", "brand_promo"] as const;
export type Surface = (typeof SURFACES)[number];

/** block: 게시 불가(수정 필수) / warn: 사람이 보고 판정 */
export const SEVERITIES = ["block", "warn"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** brief: 사용자 친구 원문이 직접 금지한 표현 / proposed: 영어 발행 대비 제안(사람 확정 전, 항상 warn) */
export const RULE_ORIGINS = ["brief", "proposed"] as const;
export type RuleOrigin = (typeof RULE_ORIGINS)[number];

export interface BannedExpressionRule {
  id: string;
  terms: readonly string[];
  surfaces: readonly Surface[];
  severity: Severity;
  origin: RuleOrigin;
  reason: string;
}

export interface ExpressionHit {
  ruleId: string;
  term: string;
  severity: Severity;
  surface: Surface;
  /** 정규화한 텍스트 안의 위치 */
  index: number;
  matched: string;
}

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;

/** NFKC + 소문자 + 제로폭 문자 제거. 전각·호환 문자로 검사를 피하지 못하게 한다. */
export function normalizeForScan(text: string): string {
  return text.normalize("NFKC").replace(ZERO_WIDTH, "").toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 용어의 공백은 0개 이상의 공백으로 느슨하게 맞춘다 ("수익 보장" ↔ "수익보장"). 영문 용어는 단어 경계를 건다. */
function termPattern(term: string): RegExp {
  const body = normalizeForScan(term)
    .trim()
    .split(/\s+/)
    .map(escapeRegExp)
    .join("\\s*");
  const startsWord = /^[a-z0-9]/.test(normalizeForScan(term).trim());
  const endsWord = /[a-z0-9]$/.test(normalizeForScan(term).trim());
  return new RegExp(`${startsWord ? "\\b" : ""}${body}${endsWord ? "\\b" : ""}`, "gu");
}

export function findBannedExpressions(
  text: string,
  surface: Surface,
  rules: readonly BannedExpressionRule[],
): ExpressionHit[] {
  const haystack = normalizeForScan(text);
  const hits: ExpressionHit[] = [];
  for (const rule of rules) {
    if (!rule.surfaces.includes(surface)) continue;
    for (const term of rule.terms) {
      for (const match of haystack.matchAll(termPattern(term))) {
        hits.push({
          ruleId: rule.id,
          term,
          severity: rule.severity,
          surface,
          index: match.index,
          matched: match[0],
        });
      }
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}
