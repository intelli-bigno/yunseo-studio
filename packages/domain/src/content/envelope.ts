// 공통 봉투 — 콘텐츠 3종이 함께 쓰는 필드(docs/01-content-sot.md §4.1)와 수정 이력(§6).
// 종마다 다른 본문(stages)은 각 스키마 파일이 읽고, 여기서는 봉투와 공통 도구만 읽는다.
import { Issues, type Json } from "../validation";
import { ISO_DATE_OR_INSTANT, blockFinding, claimFindings, validateClaims, type Claim, type ContentFinding } from "./claims";

export const CONTENT_TYPES = ["pre_issue", "post_issue", "research"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/** draft: 작성 중 / verified: 출처·일시·운영자 해석까지 갖춰 검수 단계로 넘길 수 있음 */
export const CARD_STATUSES = ["draft", "verified"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

/** major: 피드 편성 / watch: 「이번 주의 변수」에만 (판정 기준은 docs/02 편성 규칙) */
export const IMPORTANCES = ["major", "watch"] as const;
export type Importance = (typeof IMPORTANCES)[number];

export const REVISION_KINDS = ["correction", "update", "clarification"] as const;
export type RevisionKind = (typeof REVISION_KINDS)[number];

export interface Revision {
  at: string;
  by: string;
  change_kind: RevisionKind;
  /** 바뀐 claim id 또는 필드 경로 */
  affected: string[];
  before: string;
  after: string;
  reason: string;
  /** 독자에게 보이는 정정 문구. correction · update 필수 */
  reader_note?: string;
  /** update 는 후속 게시물(또는 발행 전이면 follow_up_due) 필수 */
  follow_up_post_id?: string;
  follow_up_due?: string;
}

export interface Envelope {
  id: string;
  status: CardStatus;
  /** 발행 언어 코드. 프리셋 language 와 같아야 게시 가능(후속). */
  language: string;
  /** 이 편이 근거로 삼은 자료의 가장 늦은 시각(ISO 8601). draft 에서만 null 허용 */
  as_of: string | null;
  importance: Importance | null;
  /** 이 편을 릴스로 확장할 계획인가 */
  reels: { planned: boolean } | null;
  /** 수치·고유명사·날짜가 든 주장 + 출처. 사실 수치를 쓰지 않은 편은 빈 배열 */
  claims: Claim[];
  /** 운영자 도메인 지식·경험으로 얹는 고유 해석. verified 에서 필수 */
  operator_view: string | null;
  revisions: Revision[];
}

export interface ContentText {
  path: string;
  text: string;
}

/** 본문 강조 표기 `**핵심 구**` 를 벗긴 글자. 글자 수·금지 표현·수치 검사는 모두 이 글자로 한다 */
export function plainText(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1");
}

/** 글자 수 — 사람이 세는 글자(코드 포인트) 기준 */
export function charCount(text: string): number {
  return [...plainText(text)].length;
}

function optionalDate(e: Issues, value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  const text = e.text(value, path);
  if (text !== "" && !ISO_DATE_OR_INSTANT.test(text)) e.add(path, "ISO 8601 날짜 또는 시각이어야 한다");
  return text;
}

function readRevisions(e: Issues, input: unknown): Revision[] {
  if (input === undefined) return [];
  return e.array(input, "revisions").map((entry, i) => {
    const p = `revisions[${i}]`;
    const r = e.record(entry, p);
    const change_kind = e.oneOf(r["change_kind"], REVISION_KINDS, `${p}.change_kind`, "clarification");
    const revision: Revision = {
      at: e.text(r["at"], `${p}.at`),
      by: e.text(r["by"], `${p}.by`),
      change_kind,
      affected: e.textArray(r["affected"], `${p}.affected`, 1),
      before: e.text(r["before"], `${p}.before`),
      after: e.text(r["after"], `${p}.after`),
      reason: e.text(r["reason"], `${p}.reason`),
    };
    if (r["reader_note"] !== undefined) revision.reader_note = e.text(r["reader_note"], `${p}.reader_note`);
    else if (change_kind !== "clarification") e.add(`${p}.reader_note`, "correction · update 는 독자에게 보일 정정 문구가 필요하다");
    const followUp = r["follow_up_post_id"] === undefined ? undefined : e.text(r["follow_up_post_id"], `${p}.follow_up_post_id`);
    const due = optionalDate(e, r["follow_up_due"], `${p}.follow_up_due`);
    if (followUp !== undefined) revision.follow_up_post_id = followUp;
    if (due !== undefined) revision.follow_up_due = due;
    if (change_kind === "update" && followUp === undefined && due === undefined) {
      e.add(`${p}.follow_up_post_id`, "update 는 후속 게시물(follow_up_post_id) 또는 예정일(follow_up_due)이 필요하다");
    }
    return revision;
  });
}

/** 봉투 필드를 읽는다. 예전 파일(as_of·importance·reels·revisions·type 이 없는)도 그대로 통과한다 */
export function readEnvelope(e: Issues, root: Json, type: ContentType): Envelope {
  if (root["type"] !== undefined && root["type"] !== type) e.add("type", `${type} 이어야 한다`);
  const reels =
    root["reels"] === undefined || root["reels"] === null
      ? null
      : (() => {
          const r = e.record(root["reels"], "reels");
          if (typeof r["planned"] !== "boolean") e.add("reels.planned", "true | false 여야 한다");
          return { planned: r["planned"] === true };
        })();
  const asOf = root["as_of"] === undefined || root["as_of"] === null ? null : (optionalDate(e, root["as_of"], "as_of") ?? null);
  return {
    id: e.text(root["id"], "id"),
    status: e.oneOf(root["status"], CARD_STATUSES, "status", "draft"),
    language: e.text(root["language"], "language"),
    as_of: asOf,
    importance:
      root["importance"] === undefined || root["importance"] === null ? null : e.oneOf(root["importance"], IMPORTANCES, "importance", "watch"),
    reels,
    claims: validateClaims(e, root["claims"], "claims"),
    operator_view: e.textOrNull(root["operator_view"], "operator_view"),
    revisions: readRevisions(e, root["revisions"]),
  };
}

/** `a.b[0]` 같은 경로를 뒤에 붙여 읽기 좋은 한 줄로 만든다 */
export function findingLine(f: Pick<ContentFinding, "path" | "message">): string {
  return `${f.path}: ${f.message}`;
}

/** 숫자가 든 본문 문장 중 claims 에 같은 숫자가 없는 것. 수치는 출처 있는 claim 으로만 쓴다 (편집 원칙 3). */
export function unsourcedNumbers(texts: readonly ContentText[], claims: readonly Claim[]): ContentText[] {
  const claimed = new Set(claims.flatMap((c) => c.text.match(/\d[\d,.]*/g) ?? []));
  return texts.filter(({ text }) => (text.match(/\d[\d,.]*/g) ?? []).some((n) => !claimed.has(n)));
}

/**
 * 봉투 단위 verified 조건 — 운영자 해석·기준 시점·중요도·claim 별 출처·본문 수치.
 * 종마다 다른 조건(이벤트 일시 등)은 각 스키마 파일이 앞에 붙인다. 순서는 읽는 사람이 위에서부터 고치는 순서다.
 */
export function envelopeFindings(env: Envelope, texts: readonly ContentText[], options: { importance: boolean }): ContentFinding[] {
  const out: ContentFinding[] = [];
  if (env.operator_view === null) out.push(blockFinding("verification", "operator_view", "운영자 고유 해석이 비어 있다"));
  if (env.as_of === null) out.push(blockFinding("as_of_missing", "as_of", "기준 시점이 비어 있다"));
  if (options.importance && env.importance === null) out.push(blockFinding("verification", "importance", "major | watch 판정이 필요하다 (docs/02 §3.2)"));
  if (env.as_of !== null) {
    const latest = Math.max(...env.claims.flatMap((c) => (c.as_of === undefined ? [] : [Date.parse(c.as_of)])).filter(Number.isFinite), Number.NEGATIVE_INFINITY);
    if (Number.isFinite(latest) && Date.parse(env.as_of) < latest) out.push(blockFinding("as_of_missing", "as_of", "claims 의 가장 늦은 as_of 보다 이르다 (docs/01 §5 규칙 5)"));
  }
  out.push(...claimFindings(env.claims));
  for (const t of unsourcedNumbers(texts, env.claims)) out.push(blockFinding("unsourced_number", t.path, "출처 없는 수치"));
  return out;
}
