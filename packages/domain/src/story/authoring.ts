// [L2] 작성·검수 규칙 — 상태 기계(02 SOP)·사람 게이트 G1~G3·출처/기준 시점 검증·승인 무효화(04 Approval)·수정 이력(01 §6).
// 전부 순수 함수다. 화면·저장소는 이 규칙을 부르기만 하고 우회할 수 없다(04 규칙 5): 허용 안 된 전이·조건 미충족은 예외.
import { sha256Hex } from "./sha256";
import { normalizeFields } from "./fields";
import { documentGateIssues, type GateDocumentContext } from "./document";
import {
  CHECK_RESULT_STATUSES,
  SCENARIO_OUTCOMES,
  type Approval,
  type CheckItem,
  type CheckResult,
  type EvidenceReady,
  type GateId,
  type GateState,
  type Piece,
  type PieceClaim,
  type PieceKind,
  type PieceStatus,
  type ScenarioItem,
  type ScenarioOutcome,
  type Stage,
} from "./model";

// ───────────────────────────── 오류 ─────────────────────────────

export type AuthoringErrorCode = "transition_not_allowed" | "guard_failed" | "invalid_edit" | "reason_required" | "not_editable";

/** 규칙 위반. issues 는 사람이 읽는 이유 목록이다 */
export class AuthoringRuleError extends Error {
  constructor(
    readonly code: AuthoringErrorCode,
    readonly issues: string[],
  ) {
    super(issues.join(" · ") || code);
    this.name = "AuthoringRuleError";
  }
}

// ───────────────────────────── 종류별 단 틀 ─────────────────────────────

export const AUTHORING_KINDS = ["pre", "post", "research"] as const;
export type AuthoringKind = (typeof AUTHORING_KINDS)[number];
export const isAuthoringKind = (k: PieceKind): k is AuthoringKind => (AUTHORING_KINDS as readonly string[]).includes(k);

/** 01 §4.2~4.4 의 단 순서 = 정본. 새 편은 이 틀로 시작하고 저장해도 단 구성은 바뀌지 않는다 */
export const STAGE_TEMPLATES: Record<AuthoringKind, readonly Omit<Stage, "body">[]> = {
  pre: [
    { key: "why_it_matters", title: "왜 중요한가", question: "이 사건이 바꾸는 변수" },
    { key: "market_expectation", title: "시장은 무엇을 예상하나", question: "이미 가격에 담긴 기대 (수치는 출처·기준 시점 필수)" },
    { key: "scenarios", title: "결과별 시나리오", question: "둘 이상, 각각 조건 → 읽는 법" },
    { key: "transmission", title: "영향 경로", question: "결과 → 금리·환율·업종 등으로 닿는 길" },
    { key: "after_checks", title: "발표 뒤 확인할 것", question: "독자가 직접 확인할 신호와 볼 곳" },
  ],
  post: [
    { key: "result_vs_expectation", title: "결과 vs 예상", question: "실제 결과는 예상과 어떻게 달랐나" },
    { key: "market_reaction", title: "시장 반응", question: "관측된 반응만 — 분 단위 기준 시점" },
    { key: "judgment_update", title: "판단 갱신", question: "유지·수정·폐기한 판단과 근거" },
    { key: "next_variables", title: "다음 변수", question: "다음으로 확인할 변수" },
  ],
  research: [
    { key: "idea", title: "아이디어", question: "무엇을 왜 보나 — 가설과 반증 조건" },
    { key: "conditions", title: "조건", question: "언제 쓰고 언제 쓰지 않나" },
    { key: "failures", title: "실패", question: "어디서 틀렸나" },
    { key: "tool", title: "도구", question: "도구와 사용법·한계·검증 범위" },
    { key: "follow_up", title: "후속", question: "후속 검증에서 확인된 것" },
  ],
};

export const ID_PREFIX: Record<AuthoringKind, string> = { pre: "P", post: "A", research: "R" };

export interface NewPieceInput {
  id: string;
  kind: AuthoringKind;
  title: string;
  /** 게시 예정 ISO(KST, 분 단위) */
  slot: string;
  viewpoint?: string;
  preIssueId?: string | null;
}

/** 새 편 — 상태 idea(G1 대기), 단은 종류별 빈 틀 */
export function newPiece(input: NewPieceInput): Piece {
  const issues: string[] = [];
  if (!input.title.trim()) issues.push("제목 비어 있음");
  if (!isIsoMinute(input.slot)) issues.push("게시 예정 시각 형식(YYYY-MM-DDTHH:mm)");
  if (input.preIssueId && input.kind !== "post") issues.push("이전 편 연결은 이후 편만");
  if (issues.length) throw new AuthoringRuleError("invalid_edit", issues);
  const piece: Piece = {
    id: input.id,
    kind: input.kind,
    title: input.title.trim(),
    slot: input.slot,
    status: "idea",
    gates: { G1: "waiting", G2: "todo", G3: "todo" },
    blocker: null,
    viewpoint: input.viewpoint?.trim() ?? "",
    stages: STAGE_TEMPLATES[input.kind].map((s) => ({ ...s, body: "" })),
    claims: [],
    revision: 0,
    importance: null,
    approvals: [],
  };
  if (input.kind === "pre") {
    piece.scenarios = [];
    piece.checks = [];
  }
  if (input.kind === "post") {
    piece.scenarioOutcomes = [];
    piece.checkResults = [];
    piece.evidence = { primary: false, observed: false, allScenarios: false, separated: false };
    if (input.preIssueId) piece.preIssueId = input.preIssueId;
  }
  return refresh(piece, {});
}

// ───────────────────────────── 형식 검사 (외부 접속 없음) ─────────────────────────────

/** 출처 URL 형식만 본다 — 열어 보지 않는다 */
export function isSourceUrl(url: string): boolean {
  return /^https?:\/\/(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,63}(?::\d{1,5})?(?:[/?#][^\s]*)?$/.test(url.trim());
}

const validDate = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

export function isIsoDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return !!m && validDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** 분 단위 시각(선택: 초·시간대) — 기준 시점(as_of)·게시 예정 */
export function isIsoMinute(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/.exec(v);
  return !!m && validDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** 수치·날짜가 든 문장 — 조사 근거면 출처가 있어야 한다 */
const hasSpecifics = (text: string) => /\d/.test(text);

/** 이 문장에 출처(url·접근일·원문 인용)가 필요한가 — 01 §5: 사실·시장 반응, 그리고 수치·날짜가 든 조사 문장 */
export function needsSource(c: PieceClaim): boolean {
  if (c.basis !== "research") return false;
  return c.mark === "fact" || c.mark === "reaction" || hasSpecifics(c.text);
}

/** 한 문장이 사람 확인(G2)을 받기 전에 갖춰야 할 것. 비어 있어야 「확인」을 누를 수 있다 */
export function claimBlockers(c: PieceClaim, all: readonly PieceClaim[] = []): string[] {
  const out: string[] = [];
  if (!c.text.trim()) out.push("문장 비어 있음");
  if (!c.asOf) out.push("기준 시점 없음");
  else if (!isIsoMinute(c.asOf)) out.push("기준 시점 형식(분 단위)");
  if (needsSource(c)) {
    if (!c.url) out.push("출처 URL 없음");
    else if (!isSourceUrl(c.url)) out.push("출처 URL 형식 오류");
    if (!c.accessedAt) out.push("접근일 없음");
    else if (!isIsoDate(c.accessedAt)) out.push("접근일 형식(YYYY-MM-DD)");
    if (!c.quote?.trim()) out.push("원문 인용 없음");
  }
  if (c.mark === "view") {
    const based = c.basedOn ?? [];
    if (based.length === 0) out.push("근거 사실(based_on) 없음");
    const ids = new Set(all.map((x) => x.id));
    for (const id of based) if (!ids.has(id) || id === c.id) out.push(`근거 문장 없음: ${id}`);
  }
  return out;
}

// ───────────────────────────── 승인 대상 내용 해시 ─────────────────────────────

/** 정렬된 키로 직렬화 — 같은 내용이면 같은 문자열 */
function canonical(v: unknown): string {
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
const claimContent = (c: PieceClaim) => ({ id: c.id, mark: c.mark, basis: c.basis, text: c.text, publisher: c.publisher ?? null, url: c.url ?? null, quote: c.quote ?? null, accessedAt: c.accessedAt ?? null, asOf: c.asOf ?? null, basedOn: c.basedOn ?? [], tier: c.tier || undefined, condition: c.condition?.trim() || undefined, experience: c.experience ?? undefined });

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

/** 해당 게이트의 마지막 기록 */
export function lastApproval(p: Piece, gate: GateId): Approval | null {
  const list = (p.approvals ?? []).filter((a) => a.gate === gate);
  return list[list.length - 1] ?? null;
}

/** 유효한 승인 = 마지막 기록이 승인이고, 승인한 내용 해시가 지금 내용 해시와 같다 */
export function validApproval(p: Piece, gate: GateId): Approval | null {
  const a = lastApproval(p, gate);
  return a && a.decision === "approved" && a.contentHash === contentHash(p) ? a : null;
}

// ───────────────────────────── 검증 (G2 조건) ─────────────────────────────

export interface LinkContext {
  /** 이후 편이 가리키는 이전 편(찾지 못했으면 null, 연결을 보지 않으면 undefined) */
  preIssue?: Piece | null | undefined;
  /** [L9] 렌더 전 검사 규칙(금지 표현·포맷). 없어도 출처 없는 수치·기준 시점 등 확인 조건은 늘 본다 */
  document?: GateDocumentContext;
}

/** 이후 편 ↔ 이전 편 연결 점검 — 누락·모르는 id */
export function linkIssues(p: Piece, pre: Piece | null | undefined): string[] {
  if (p.kind !== "post" || !p.preIssueId) return [];
  if (!pre) return [`이전 편 ${p.preIssueId} 없음`];
  if (pre.kind !== "pre") return [`${pre.id} 는 이전 편이 아님`];
  const out: string[] = [];
  const outcomes = new Map((p.scenarioOutcomes ?? []).map((o) => [o.scenarioId, o]));
  const results = new Map((p.checkResults ?? []).map((r) => [r.checkId, r]));
  const scenarios = pre.scenarios ?? [];
  const checks = pre.checks ?? [];
  const missingS = scenarios.filter((s) => !outcomes.has(s.id)).length;
  const missingC = checks.filter((c) => !results.has(c.id)).length;
  if (missingS) out.push(`이전 편 시나리오 ${missingS}개 미응답`);
  if (missingC) out.push(`이전 편 확인 항목 ${missingC}개 미처리`);
  for (const id of outcomes.keys()) if (!scenarios.some((s) => s.id === id)) out.push(`모르는 시나리오 ${id}`);
  for (const id of results.keys()) if (!checks.some((c) => c.id === id)) out.push(`모르는 확인 항목 ${id}`);
  for (const r of p.checkResults ?? []) if (r.status === "dropped" && !r.note.trim()) out.push(`확인 항목 ${r.checkId} 를 버린 이유 없음`);
  return out;
}

/** 저장을 막는 연결 오류 — 없는 이전 편, 이전 편이 아닌 편, 이전 편에 없는 id 로 응답 */
export function danglingLinks(p: Piece, pre: Piece | null | undefined): string[] {
  const out: string[] = [];
  const outcomes = p.scenarioOutcomes ?? [];
  const results = p.checkResults ?? [];
  if (!p.preIssueId) {
    if (outcomes.length || results.length) out.push("이전 편 없이 시나리오 응답·확인 결과를 둘 수 없음");
    return out;
  }
  if (pre === undefined) return out;
  if (!pre) return [`이전 편 ${p.preIssueId} 없음`];
  if (pre.kind !== "pre") return [`${pre.id} 는 이전 편이 아님`];
  for (const o of outcomes) if (!(pre.scenarios ?? []).some((s) => s.id === o.scenarioId)) out.push(`모르는 시나리오 ${o.scenarioId}`);
  for (const r of results) if (!(pre.checks ?? []).some((c) => c.id === r.checkId)) out.push(`모르는 확인 항목 ${r.checkId}`);
  return out;
}

export const EVIDENCE_LABELS: Record<keyof EvidenceReady, string> = {
  primary: "결과의 1차 자료가 공개됐고 확인했다",
  observed: "시장 반응을 읽을 만큼 관측 시간이 지났다",
  allScenarios: "이전 편 시나리오 전부에 대응이 적혀 있다",
  separated: "사실 / 시장 반응 / 해석이 섞이지 않았다",
};

export function evidenceMissing(p: Piece): (keyof EvidenceReady)[] {
  const e = p.evidence ?? { primary: false, observed: false, allScenarios: false, separated: false };
  return (Object.keys(EVIDENCE_LABELS) as (keyof EvidenceReady)[]).filter((k) => !e[k]);
}

/** draft → verified 를 막는 이유(G2). 비어야 사람이 「사실 확인 통과」를 누를 수 있다 */
export function pieceBlockers(p: Piece, ctx: LinkContext = {}): string[] {
  const out: string[] = [];
  if (!p.viewpoint.trim()) out.push("핵심 관점(운영자 해석) 비어 있음");
  const empty = p.stages.filter((s) => !s.body.trim()).length;
  if (p.kind === "research") {
    if (empty === p.stages.length) out.push("단 하나 이상 작성");
  } else if (empty) out.push(`빈 단 ${empty}개`);
  const specifics = p.stages.some((s) => hasSpecifics(s.body));
  if (specifics && !p.claims.some((c) => needsSource(c))) out.push("본문에 수치·날짜가 있는데 출처 문장 없음");
  let open = 0;
  for (const c of p.claims) {
    const issues = claimBlockers(c, p.claims);
    if (issues.length) out.push(`문장 ${c.id}: ${issues.join(", ")}`);
    else if (!c.verified) open += 1;
  }
  if (open) out.push(`사람 확인 전 문장 ${open}개`);
  if (p.claims.filter((c) => c.mark === "scenario").length === 1) out.push("시나리오 문장은 둘 이상");
  if (p.kind === "pre") {
    const sc = (p.scenarios ?? []).filter((s) => s.label.trim() && s.condition.trim() && s.reading.trim());
    if (sc.length < 2) out.push("시나리오(조건·읽는 법) 둘 이상");
    if (!(p.checks ?? []).some((c) => c.what.trim() && c.where.trim())) out.push("확인할 것(무엇·볼 곳) 하나 이상");
  }
  if (p.kind === "post") {
    out.push(...linkIssues(p, ctx.preIssue));
    const miss = evidenceMissing(p);
    if (miss.length) out.push(`자료 확보 조건 ${4 - miss.length}/4`);
  }
  // [L9] 칸이 다 찼으면 렌더 전 검사와 같은 규칙으로 본다 — 렌더에서야 막히던 「출처 없는 수치」를 G2 에서 먼저 막는다
  if (!out.length) out.push(...documentGateIssues(p, ctx.document));
  return out;
}

// ───────────────────────────── 상태 기계 ─────────────────────────────

export const GATE_ACTIONS = ["select", "start_draft", "await_evidence", "evidence_ready", "verify", "reopen", "request_review", "approve", "reject", "publish", "reapprove", "request_changes"] as const;
export type GateAction = (typeof GATE_ACTIONS)[number];

export interface TransitionRule {
  action: GateAction;
  from: PieceStatus;
  to: PieceStatus;
  /** 사람 게이트 기록을 남기는 전이 */
  gate: GateId | null;
  /** 이 종류에서만 허용(없으면 3종 모두) */
  kinds?: readonly AuthoringKind[];
}

/** 허용 전이 표 = 02 SOP 상태도. 여기 없는 (상태, 행동) 쌍은 전부 예외다 */
export const TRANSITIONS: readonly TransitionRule[] = [
  { action: "select", from: "idea", to: "selected", gate: "G1" },
  { action: "start_draft", from: "selected", to: "drafted", gate: null },
  { action: "await_evidence", from: "selected", to: "evidence_wait", gate: null, kinds: ["post"] },
  { action: "evidence_ready", from: "evidence_wait", to: "drafted", gate: null, kinds: ["post"] },
  { action: "verify", from: "drafted", to: "verified", gate: "G2" },
  { action: "reopen", from: "verified", to: "drafted", gate: null },
  { action: "request_review", from: "verified", to: "in_review", gate: null },
  { action: "approve", from: "in_review", to: "approved", gate: "G3" },
  { action: "reject", from: "in_review", to: "drafted", gate: "G3" },
  { action: "publish", from: "approved", to: "published", gate: null },
  { action: "reapprove", from: "published", to: "published", gate: "G3" },
  // [L9] 02 SOP changes_requested — 승인본을 작성으로 되돌린다. G3 기록은 「반려」로 남아 승인이 무효가 되고, 사유가 필수다
  { action: "request_changes", from: "approved", to: "drafted", gate: "G3" },
];

export function transitionFor(p: Pick<Piece, "status" | "kind">, action: GateAction): TransitionRule | null {
  if (!isAuthoringKind(p.kind)) return null;
  const kind = p.kind;
  return TRANSITIONS.find((t) => t.action === action && t.from === p.status && (!t.kinds || t.kinds.includes(kind))) ?? null;
}

export interface ActionInput {
  actor: string;
  /** ISO 시각 */
  at: string;
  /** 반려 사유 등 */
  reason?: string;
  /** G1 중요도(①②) */
  importance?: "major" | "watch";
  /** G3 체크리스트 — 항목 수는 g3Checklist(kind) 와 같아야 하고 전부 참이어야 한다 */
  checklist?: readonly boolean[];
}

/** 02 §5.3 — G3 최종 발행 판단 체크리스트 */
export function g3Checklist(kind: PieceKind): string[] {
  const base = [
    "투자 권유로 읽히는 문장 없음, 수치 단정 없음",
    "금지 표현 검사 통과 (block 0, warn 은 읽고 판정)",
    "사실 / 시장 반응 / 해석 / 시나리오가 구분돼 보임",
    "출처 카드와 기준 시점 있음",
    "이벤트 일시·시간대 정확, 오늘 기준 재확인",
    "브랜드 자리표시자 없음, 고지 문구 포함",
    "맞춤법 (발행 언어 기준)",
    "표지 틀 일치, 차트 한눈에 읽힘",
    "이 편을 내는 이유가 「채우려고」가 아님",
  ];
  return kind === "post" ? [...base, "이전 편과 나란히 읽어 모순 없음(달라진 부분은 이유 있음)"] : base;
}

/** 이 행동을 지금 할 수 없는 이유. 빈 배열이면 가능 */
export function guardIssues(p: Piece, action: GateAction, input: Partial<ActionInput>, ctx: LinkContext = {}): string[] {
  const rule = transitionFor(p, action);
  if (!rule) return [`${p.status} 에서 ${action} 할 수 없음`];
  const out: string[] = [];
  if (rule.gate && !input.actor?.trim()) out.push("게이트는 사람이 누른다 — 확인자 이름 필요");
  switch (action) {
    case "select":
      if (!p.viewpoint.trim()) out.push("핵심 관점 한 문장 필요");
      if (p.kind !== "research" && !(input.importance ?? p.importance)) out.push("중요도(major·watch) 판정 필요");
      if (p.kind !== "research" && (input.importance ?? p.importance) === "watch") out.push("watch 는 피드 편성 없음 — major 만 선정");
      break;
    case "evidence_ready": {
      const miss = evidenceMissing(p);
      if (miss.length) out.push(...miss.map((k) => `자료 확보: ${EVIDENCE_LABELS[k]}`));
      break;
    }
    case "verify":
      out.push(...pieceBlockers(p, ctx));
      break;
    case "approve":
    case "reapprove": {
      const list = g3Checklist(p.kind);
      const checked = input.checklist ?? [];
      if (checked.length !== list.length || !checked.every(Boolean)) out.push(`체크리스트 ${checked.filter(Boolean).length}/${list.length}`);
      if (!validApproval(p, "G2") && action === "approve") out.push("G2 사실 확인이 지금 내용과 맞지 않음");
      if (action === "reapprove") {
        if (validApproval(p, "G3")) out.push("이미 지금 내용으로 승인됨");
        out.push(...pieceBlockers(p, ctx));
      } else out.push(...documentGateIssues(p, ctx.document)); // [L9] G3 승인 전 점검 = 렌더 전 검사
      break;
    }
    case "request_review":
      out.push(...documentGateIssues(p, ctx.document));
      break;
    case "request_changes":
      if (!input.reason?.trim()) out.push("수정 요청 사유 필수");
      break;
    case "reject":
      if (!input.reason?.trim()) out.push("반려 사유 필수");
      break;
    case "publish":
      if (!validApproval(p, "G3")) out.push("유효한 G3 승인 없음 — 승인 뒤 내용이 바뀌었거나 승인 기록 없음");
      break;
    default:
      break;
  }
  return out;
}

export interface ActionResult {
  piece: Piece;
  approval: Approval | null;
  summary: string;
}

/** 전이를 적용한다. 허용 안 된 전이·조건 미충족이면 AuthoringRuleError */
export function applyAction(p: Piece, action: GateAction, input: ActionInput, ctx: LinkContext = {}): ActionResult {
  const rule = transitionFor(p, action);
  if (!rule) throw new AuthoringRuleError("transition_not_allowed", [`${p.status} 에서 ${action} 할 수 없음`]);
  const issues = guardIssues(p, action, input, ctx);
  if (issues.length) throw new AuthoringRuleError("guard_failed", issues);
  const next: Piece = { ...p, status: rule.to };
  if (action === "select" && input.importance) next.importance = input.importance;
  const hash = contentHash(next);
  const approval: Approval | null = rule.gate
    ? { gate: rule.gate, decision: action === "reject" || action === "request_changes" ? "rejected" : "approved", actor: input.actor.trim(), at: input.at, contentHash: hash, note: input.reason?.trim() || null }
    : null;
  if (approval) next.approvals = [...(p.approvals ?? []), approval];
  if (rule.gate === "G3" && approval?.decision === "approved") next.hash = hash.slice(0, 8);
  if (action === "request_changes") delete next.hash;
  return { piece: refresh(next, ctx), approval, summary: `${action}: ${p.status} → ${rule.to}` };
}

export interface ActionOption {
  action: GateAction;
  gate: GateId | null;
  to: PieceStatus;
  issues: string[];
}

/** 지금 상태에서 가능한 행동과 막는 이유(화면 버튼용 — 판단은 applyAction 이 다시 한다).
 *  화면이 누를 때 채우는 입력(누른 사람·G1 중요도·G3 체크리스트·반려 사유)은 채워졌다고 보고, 그 밖의 막는 이유만 보인다 */
export function availableActions(p: Piece, ctx: LinkContext = {}, input: Partial<ActionInput> = { actor: "확인자", importance: "major" }): ActionOption[] {
  return TRANSITIONS.filter((t) => transitionFor(p, t.action) === t).map((t) => ({
    action: t.action,
    gate: t.gate,
    to: t.to,
    issues: guardIssues(p, t.action, { checklist: g3Checklist(p.kind).map(() => true), ...input }, ctx).filter((m) => !m.startsWith("체크리스트") && m !== "반려 사유 필수" && m !== "수정 요청 사유 필수"),
  }));
}

// ───────────────────────────── 게이트·막힘 표시 ─────────────────────────────

export function deriveGates(p: Piece, ctx: LinkContext = {}): Record<GateId, GateState> {
  const s = p.status;
  const G1: GateState = s === "idea" ? (p.viewpoint.trim() ? "waiting" : "blocked") : "passed";
  const G2: GateState =
    s === "idea" || s === "selected" || s === "evidence_wait" ? "todo" : s === "drafted" ? (pieceBlockers(p, ctx).length ? "blocked" : "waiting") : "passed";
  const G3: GateState =
    s === "in_review" ? "waiting" : s === "approved" || s === "published" ? (validApproval(p, "G3") ? "passed" : "waiting") : "todo";
  return { G1, G2, G3 };
}

export function deriveBlocker(p: Piece, ctx: LinkContext = {}): string | null {
  if (p.status === "evidence_wait") return `자료 대기 · 조건 ${4 - evidenceMissing(p).length}/4`;
  if (p.status === "drafted") {
    const issues = pieceBlockers(p, ctx);
    return issues.length ? `G2 · ${issues[0]}${issues.length > 1 ? ` 외 ${issues.length - 1}` : ""}` : null;
  }
  if ((p.status === "approved" || p.status === "published") && !validApproval(p, "G3")) return "G3 · 승인 뒤 내용이 바뀜 — 다시 승인 필요";
  return null;
}

/** 저장 직전 파생 칸(게이트·막힘 한 줄)을 다시 계산한다 */
export function refresh(p: Piece, ctx: LinkContext = {}): Piece {
  return { ...p, gates: deriveGates(p, ctx), blocker: deriveBlocker(p, ctx) };
}

// ───────────────────────────── 편집 ─────────────────────────────

const TIERS: readonly (string | null | undefined)[] = ["primary", "major_media", "other"];

export const CHANGE_KINDS = ["correction", "update", "clarification"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export interface PiecePatch {
  title?: string;
  slot?: string;
  viewpoint?: string;
  importance?: "major" | "watch" | null;
  preIssueId?: string | null;
  stages?: readonly Pick<Stage, "key" | "body">[];
  claims?: readonly PieceClaim[];
  scenarios?: readonly ScenarioItem[];
  checks?: readonly CheckItem[];
  scenarioOutcomes?: readonly ScenarioOutcome[];
  checkResults?: readonly CheckResult[];
  evidence?: EvidenceReady;
  /** [L7] 구조 칸 전체(보낸 것으로 바꾼다) */
  fields?: Readonly<Record<string, string>>;
}

export interface EditMeta {
  actor: string;
  at: string;
  reason?: string;
  /** 발행 뒤 수정은 필수(01 §6) */
  changeKind?: ChangeKind;
  readerNote?: string;
  /** update 는 후속 게시물 id 또는 기한(YYYY-MM-DD) 필수 */
  followUp?: string;
}

export interface FieldChange {
  path: string;
  before: string;
  after: string;
}

export interface EditResult {
  piece: Piece;
  changes: FieldChange[];
  contentChanged: boolean;
  /** 내용이 바뀌어 효력을 잃은 게이트 */
  invalidated: GateId[];
}

const short = (v: unknown): string => {
  const s = typeof v === "string" ? v : JSON.stringify(v ?? null);
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
};

const uniqueIds = (items: readonly { id: string }[], label: string, issues: string[]) => {
  const seen = new Set<string>();
  for (const x of items) {
    if (!x.id.trim()) issues.push(`${label} id 비어 있음`);
    if (seen.has(x.id)) issues.push(`${label} id 중복: ${x.id}`);
    seen.add(x.id);
  }
};

const claimContentKey = (c: PieceClaim) => canonical(claimContent(c));

export interface EditContext extends LinkContext {
  /** 이 이전 편을 가리키는 이후 편들 — 응답받은 시나리오·확인 항목은 지울 수 없다 */
  linkedPosts?: readonly Piece[];
}

/** 편집을 적용한다. 단 구성·확인 표시는 바꿀 수 없고(사람 확인은 confirmClaim 으로만), 발행 뒤 수정은 이유가 필수다 */
export function applyEdit(before: Piece, patch: PiecePatch, meta: EditMeta, ctx: EditContext = {}): EditResult {
  if (!isAuthoringKind(before.kind)) throw new AuthoringRuleError("not_editable", ["스토리 편은 여기서 고치지 않는다"]);
  const issues: string[] = [];
  const next: Piece = { ...before };

  if (patch.title !== undefined) {
    if (!patch.title.trim()) issues.push("제목 비어 있음");
    next.title = patch.title.trim();
  }
  if (patch.slot !== undefined) {
    if (!isIsoMinute(patch.slot)) issues.push("게시 예정 시각 형식(YYYY-MM-DDTHH:mm)");
    next.slot = patch.slot;
  }
  if (patch.viewpoint !== undefined) next.viewpoint = patch.viewpoint.trim();
  if (patch.importance !== undefined) {
    if (before.kind === "research" && patch.importance) issues.push("연구 편은 중요도 없음");
    next.importance = patch.importance;
  }
  if (patch.preIssueId !== undefined) {
    if (patch.preIssueId && before.kind !== "post") issues.push("이전 편 연결은 이후 편만");
    if (patch.preIssueId) next.preIssueId = patch.preIssueId;
    else delete next.preIssueId;
  }
  if (patch.stages) {
    const keys = before.stages.map((s) => s.key).join("|");
    if (patch.stages.map((s) => s.key).join("|") !== keys) issues.push("단 구성은 바꿀 수 없음");
    else next.stages = before.stages.map((s, i) => ({ ...s, body: patch.stages![i]!.body }));
  }
  if (patch.claims) {
    uniqueIds(patch.claims, "문장", issues);
    const old = new Map(before.claims.map((c) => [c.id, c]));
    next.claims = patch.claims.map((c) => {
      const prev = old.get(c.id);
      const base: PieceClaim = { id: c.id, mark: c.mark, basis: c.basis, text: c.text, publisher: c.publisher || null, url: c.url?.trim() || null, quote: c.quote || null, accessedAt: c.accessedAt || null, asOf: c.asOf || null, verified: false, verifiedBy: null, verifiedAt: null, basedOn: [...(c.basedOn ?? [])] };
      if (c.tier) {
        if (!TIERS.includes(c.tier)) issues.push(`출처 등급 값: ${c.tier}`);
        base.tier = c.tier;
      }
      if (c.condition?.trim()) base.condition = c.condition.trim();
      if (c.experience && (c.experience.what.trim() || c.experience.when.trim() || c.experience.dataLocation.trim())) {
        base.experience = { what: c.experience.what.trim(), when: c.experience.when.trim(), dataLocation: c.experience.dataLocation.trim() };
      }
      // 확인 표시는 편집으로 켤 수 없다 — 내용이 그대로인 문장만 이전 확인을 이어받는다
      if (prev && prev.verified && claimContentKey(prev) === claimContentKey(base)) {
        return { ...base, verified: true, verifiedBy: prev.verifiedBy ?? null, verifiedAt: prev.verifiedAt ?? null };
      }
      return base;
    });
  }
  if (patch.scenarios) {
    if (before.kind !== "pre") issues.push("시나리오 목록은 이전 편만");
    uniqueIds(patch.scenarios, "시나리오", issues);
    next.scenarios = patch.scenarios.map((s) => ({ ...s }));
  }
  if (patch.checks) {
    if (before.kind !== "pre") issues.push("확인할 것 목록은 이전 편만");
    uniqueIds(patch.checks, "확인 항목", issues);
    next.checks = patch.checks.map((c) => ({ ...c }));
  }
  if (patch.scenarioOutcomes) {
    if (before.kind !== "post") issues.push("시나리오 응답은 이후 편만");
    for (const o of patch.scenarioOutcomes) if (!SCENARIO_OUTCOMES.includes(o.outcome)) issues.push(`시나리오 응답 값: ${o.outcome}`);
    next.scenarioOutcomes = patch.scenarioOutcomes.map((o) => ({ ...o }));
  }
  if (patch.checkResults) {
    if (before.kind !== "post") issues.push("확인 결과는 이후 편만");
    for (const r of patch.checkResults) if (!CHECK_RESULT_STATUSES.includes(r.status)) issues.push(`확인 결과 값: ${r.status}`);
    next.checkResults = patch.checkResults.map((r) => ({ ...r }));
  }
  if (patch.evidence) {
    if (before.kind !== "post") issues.push("자료 확보 조건은 이후 편만");
    next.evidence = { ...patch.evidence };
  }
  if (patch.fields) {
    const n = normalizeFields(before.kind, patch.fields);
    issues.push(...n.issues);
    if (Object.keys(n.fields).length) next.fields = n.fields;
    else delete next.fields;
  }

  // 연결 무결성 — 이후 편이 응답한 시나리오·확인 항목은 이전 편에서 지울 수 없다
  for (const post of ctx.linkedPosts ?? []) {
    for (const o of post.scenarioOutcomes ?? []) if (!(next.scenarios ?? []).some((s) => s.id === o.scenarioId)) issues.push(`이후 편 ${post.id} 가 응답한 시나리오 ${o.scenarioId} 는 지울 수 없음`);
    for (const r of post.checkResults ?? []) if (!(next.checks ?? []).some((c) => c.id === r.checkId)) issues.push(`이후 편 ${post.id} 가 처리한 확인 항목 ${r.checkId} 는 지울 수 없음`);
  }
  // 이후 편의 응답은 가리키는 이전 편에 있는 id 만(누락은 저장 가능 — G2 에서 막는다)
  if (next.kind === "post") issues.push(...danglingLinks(next, ctx.preIssue));

  const contentChanged = contentHash(next) !== contentHash(before);
  const changes = diff(before, next);
  if (before.status === "published" && changes.length) {
    if (!meta.reason?.trim()) issues.push("발행 뒤 수정은 이유 필수");
    if (!meta.changeKind) issues.push("발행 뒤 수정은 변경 종류(정정·갱신·명확화) 필수");
    if ((meta.changeKind === "correction" || meta.changeKind === "update") && !meta.readerNote?.trim()) issues.push("정정·갱신은 독자 문구 필수");
    if (meta.changeKind === "update" && !meta.followUp?.trim()) issues.push("갱신은 후속 게시물 id 또는 기한 필수");
  }
  if (!meta.actor.trim()) issues.push("저장한 사람 필요");
  if (issues.length) throw new AuthoringRuleError(issues.some((m) => m.includes("이유") || m.includes("필수")) && before.status === "published" ? "reason_required" : "invalid_edit", [...new Set(issues)]);

  // 승인 무효 — 검증 뒤 내용이 바뀌면 다시 작성 단계로(발행된 편은 상태를 두고 G3 해시만 어긋난다)
  const invalidated: GateId[] = [];
  if (contentChanged) {
    if (before.status === "verified" || before.status === "in_review" || before.status === "approved") {
      next.status = "drafted";
      invalidated.push("G2");
      if (before.status !== "verified") invalidated.push("G3");
    } else if (before.status === "published") invalidated.push("G3");
  }
  return { piece: refresh(next, ctx), changes, contentChanged, invalidated };
}

/** 사람 확인(G2 문장 단위). 문장이 갖출 것을 다 갖춰야 한다 */
export function confirmClaim(p: Piece, claimId: string, actor: string, at: string): Piece {
  const c = p.claims.find((x) => x.id === claimId);
  if (!c) throw new AuthoringRuleError("invalid_edit", [`문장 ${claimId} 없음`]);
  if (!actor.trim()) throw new AuthoringRuleError("guard_failed", ["확인자 이름 필요"]);
  // [L7] 발행된 편도 확인한다 — 발행 뒤 정정(이유·독자 문구 필수)으로 바뀐 문장을 다시 확인해야 재승인(reapprove)이 열린다
  if (p.status !== "drafted" && p.status !== "published") throw new AuthoringRuleError("transition_not_allowed", [`${p.status} 에서는 문장 확인을 하지 않는다(작성 단계·발행 뒤 정정만)`]);
  const issues = claimBlockers(c, p.claims);
  if (issues.length) throw new AuthoringRuleError("guard_failed", issues);
  return refresh({ ...p, claims: p.claims.map((x) => (x.id === claimId ? { ...x, verified: true, verifiedBy: actor.trim(), verifiedAt: at } : x)) });
}

/** 바뀐 칸 목록(이력 표시용) */
export function diff(a: Piece, b: Piece): FieldChange[] {
  const out: FieldChange[] = [];
  const add = (path: string, x: unknown, y: unknown) => {
    if (canonical(x) !== canonical(y)) out.push({ path, before: short(x), after: short(y) });
  };
  add("title", a.title, b.title);
  add("slot", a.slot, b.slot);
  add("viewpoint", a.viewpoint, b.viewpoint);
  add("importance", a.importance ?? null, b.importance ?? null);
  add("preIssueId", a.preIssueId ?? null, b.preIssueId ?? null);
  b.stages.forEach((s, i) => add(`stages.${s.key}`, a.stages[i]?.body ?? "", s.body));
  const ac = new Map(a.claims.map((c) => [c.id, c]));
  const bc = new Map(b.claims.map((c) => [c.id, c]));
  for (const [id, c] of bc) {
    const prev = ac.get(id);
    if (!prev) out.push({ path: `claims.${id}`, before: "", after: short(c.text) });
    else if (claimContentKey(prev) !== claimContentKey(c)) out.push({ path: `claims.${id}`, before: short(prev.text), after: short(c.text) });
  }
  for (const [id, c] of ac) if (!bc.has(id)) out.push({ path: `claims.${id}`, before: short(c.text), after: "" });
  add("scenarios", a.scenarios ?? [], b.scenarios ?? []);
  add("checks", a.checks ?? [], b.checks ?? []);
  add("scenarioOutcomes", a.scenarioOutcomes ?? [], b.scenarioOutcomes ?? []);
  add("checkResults", a.checkResults ?? [], b.checkResults ?? []);
  add("evidence", a.evidence ?? null, b.evidence ?? null);
  add("fields", a.fields ?? {}, b.fields ?? {});
  return out;
}

/** 편 전체 기준 시점 = 문장들의 가장 늦은 as_of(01 §5 규칙 5) */
export function pieceAsOf(p: Piece): string | null {
  const xs = p.claims.map((c) => c.asOf).filter((x): x is string => !!x).sort();
  return xs[xs.length - 1] ?? null;
}
