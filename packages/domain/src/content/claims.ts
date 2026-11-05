// 주장(claim)과 구분 필드 — docs/01-content-sot.md §5. 콘텐츠 3종(이전·이후·연구)이 같은 모양을 쓴다.
// 파일(YAML) 필드 이름을 그대로 쓴다(snake_case). 예전(구분 필드 없는) claim 도 그대로 읽는다 — 그때는 출처 세 칸(source_url·accessed_at·quote)만 본다.
import { Issues, type Json } from "../validation";

export const CLAIM_KINDS = ["fact", "market_reaction", "interpretation", "scenario"] as const;
/** fact 보도된 사실 / market_reaction 관측된 시장 반응 / interpretation 운영자 해석 / scenario 시나리오(예측 아님) */
export type ClaimKind = (typeof CLAIM_KINDS)[number];

export const CLAIM_BASES = ["researched", "experienced"] as const;
/** researched 외부 자료 조사 / experienced 운영자가 직접 해 보고 관측 */
export type ClaimBasis = (typeof CLAIM_BASES)[number];

export const SOURCE_TIERS = ["primary", "major_media", "other"] as const;
export type SourceTier = (typeof SOURCE_TIERS)[number];

export const DRAFTED_BY = ["operator", "assistant"] as const;
export type DraftedBy = (typeof DRAFTED_BY)[number];

export interface Experience {
  what: string;
  when: string;
  /** 다시 확인할 수 있는 자료의 위치 */
  data_location: string;
}

export interface Claim {
  /** 해석·시나리오의 based_on 이 가리키는 키. based_on 으로 참조되는 claim 은 id 가 있어야 한다 */
  id?: string;
  text: string;
  kind?: ClaimKind;
  basis?: ClaimBasis;
  /** 자료의 시점(사실·시장 반응) 또는 작성 시점(해석·시나리오). ISO 8601 */
  as_of?: string;
  source_url?: string;
  accessed_at?: string;
  /** 원문 그대로의 인용 */
  quote?: string;
  publisher?: string;
  tier?: SourceTier;
  /** 이 해석·시나리오가 서 있는 claim id */
  based_on?: string[];
  /** 시나리오의 조건 */
  condition?: string;
  experience?: Experience;
  drafted_by?: DraftedBy;
  verified_by?: string;
  verified_at?: string;
}

/** ISO 8601 날짜 또는 날짜+시각(+시간대). 값이 실제 달력에 있는지는 보지 않는다 */
export const ISO_DATE_OR_INSTANT = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
/** 분 단위 + 시간대 — 시장 반응의 관측 시각 */
export const ISO_MINUTE_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

function optionalText(e: Issues, raw: Json, key: string, path: string): string | undefined {
  return raw[key] === undefined ? undefined : e.text(raw[key], `${path}.${key}`);
}

function optionalDate(e: Issues, raw: Json, key: string, path: string): string | undefined {
  const value = optionalText(e, raw, key, path);
  if (value !== undefined && !ISO_DATE_OR_INSTANT.test(value)) e.add(`${path}.${key}`, "ISO 8601 날짜 또는 시각이어야 한다");
  return value;
}

export function validateClaims(e: Issues, input: unknown, path: string): Claim[] {
  return e.array(input, path).map((entry, i) => {
    const p = `${path}[${i}]`;
    const c = e.record(entry, p);
    const claim: Claim = { text: e.text(c["text"], `${p}.text`) };
    const id = optionalText(e, c, "id", p);
    if (id !== undefined) claim.id = id;
    if (c["kind"] !== undefined) claim.kind = e.oneOf(c["kind"], CLAIM_KINDS, `${p}.kind`, "fact");
    if (c["basis"] !== undefined) claim.basis = e.oneOf(c["basis"], CLAIM_BASES, `${p}.basis`, "researched");
    if (c["tier"] !== undefined) claim.tier = e.oneOf(c["tier"], SOURCE_TIERS, `${p}.tier`, "other");
    if (c["drafted_by"] !== undefined) claim.drafted_by = e.oneOf(c["drafted_by"], DRAFTED_BY, `${p}.drafted_by`, "assistant");
    for (const key of ["source_url", "quote", "publisher", "condition", "verified_by"] as const) {
      const value = optionalText(e, c, key, p);
      if (value !== undefined) claim[key] = value;
    }
    for (const key of ["as_of", "accessed_at", "verified_at"] as const) {
      const value = optionalDate(e, c, key, p);
      if (value !== undefined) claim[key] = value;
    }
    if (c["based_on"] !== undefined) claim.based_on = e.textArray(c["based_on"], `${p}.based_on`);
    if (c["experience"] !== undefined) {
      const x = e.record(c["experience"], `${p}.experience`);
      claim.experience = {
        what: e.text(x["what"], `${p}.experience.what`),
        when: e.text(x["when"], `${p}.experience.when`),
        data_location: e.text(x["data_location"], `${p}.experience.data_location`),
      };
    }
    return claim;
  });
}

export type FindingCode =
  | "banned_expression"
  | "char_limit"
  | "source_missing"
  | "as_of_missing"
  | "unsourced_number"
  | "verification"
  | "caption_limit";

/** 렌더·검수 전에 알리는 한 건. block 이면 렌더를 거부하고, warn 은 결과에 실어 사람에게 보인다 */
export interface ContentFinding {
  severity: "block" | "warn";
  code: FindingCode;
  path: string;
  message: string;
}

const SOURCE_FIELDS = "출처(source_url·accessed_at·quote) 누락";

/** 검증 사유 한 건. severity 는 호출한 쪽이 문서 상태(draft/verified)에 따라 정한다 — 여기서는 block 으로 만든다 */
export function blockFinding(code: FindingCode, path: string, message: string): ContentFinding {
  return { severity: "block", code, path, message };
}

/** claim 한 건씩 verified 조건(§5 「종류별 필수 필드」)을 본다. 비어 있어야 verified 로 올릴 수 있다 */
export function claimFindings(claims: readonly Claim[]): ContentFinding[] {
  const out: ContentFinding[] = [];
  const ids = new Set(claims.flatMap((c) => (c.id === undefined ? [] : [c.id])));
  claims.forEach((c, i) => {
    const p = `claims[${i}]`;
    const hasSource = Boolean(c.source_url && c.accessed_at && c.quote);
    if (c.kind === undefined) {
      // 구분 필드가 없는 예전 claim — 출처 세 칸만 본다
      if (!hasSource) out.push(blockFinding("source_missing", p, SOURCE_FIELDS));
      return;
    }
    if (c.drafted_by === "assistant") out.push(blockFinding("verification", p, "자동 초안(drafted_by: assistant) — 사람이 저장해 operator 로 바꾸기 전에는 verified 불가"));
    if (c.basis === undefined) out.push(blockFinding("verification", p, "basis(researched | experienced) 누락"));
    if (c.as_of === undefined) out.push(blockFinding("as_of_missing", p, "as_of(기준 시점) 누락"));

    if (c.kind === "fact" || c.kind === "market_reaction") {
      if (c.basis === "experienced") {
        if (!c.experience) out.push(blockFinding("verification", p, "직접 경험(experience: what·when·data_location) 누락"));
      } else {
        if (!hasSource) out.push(blockFinding("source_missing", p, SOURCE_FIELDS));
        if (!c.publisher || !c.tier) out.push(blockFinding("source_missing", p, "출처 발행처·등급(publisher·tier) 누락"));
        if (!c.verified_by || !c.verified_at) out.push(blockFinding("verification", p, "사람 확인 기록(verified_by·verified_at) 누락"));
      }
      if (c.kind === "market_reaction" && c.as_of !== undefined && !ISO_MINUTE_WITH_ZONE.test(c.as_of)) {
        out.push(blockFinding("as_of_missing", p, "시장 반응의 as_of 는 분 단위 + 시간대여야 한다"));
      }
    } else if (c.kind === "interpretation") {
      if (!c.based_on || c.based_on.length === 0) out.push(blockFinding("verification", p, "해석은 based_on(근거 claim id) 이 있어야 한다 — 사실 없는 해석 금지"));
      else for (const id of c.based_on) if (!ids.has(id)) out.push(blockFinding("verification", p, `based_on 이 없는 claim 을 가리킨다: ${id}`));
      if (c.basis === "experienced" && !c.experience) out.push(blockFinding("verification", p, "직접 경험(experience) 누락"));
    } else {
      if (!c.condition) out.push(blockFinding("verification", p, "시나리오는 condition(조건) 이 있어야 한다"));
    }
  });
  if (claims.filter((c) => c.kind === "scenario").length === 1) {
    out.push(blockFinding("verification", "claims", "시나리오 claim 은 같은 편에 둘 이상이어야 한다 — 한 방향 예측 금지"));
  }
  return out;
}
