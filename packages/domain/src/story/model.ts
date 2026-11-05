// 운영 화면이 다루는 한 편(Piece)의 모델 — 종류·상태·게이트·출처 문장·발행 대기열.
// 도메인은 외부 의존 0 이다(04 규칙 1). 표시용 한국어 라벨은 화면(apps) 몫이다.

export const PIECE_KINDS = ["pre", "post", "research", "story"] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];

/** 게이트 상태. waiting = 사람 판단 대기, blocked = 칸이 비어 못 감 */
export type GateState = "passed" | "waiting" | "blocked" | "todo";
export const GATE_IDS = ["G1", "G2", "G3"] as const;
export type GateId = (typeof GATE_IDS)[number];

export const PIECE_STATUSES = ["idea", "selected", "evidence_wait", "drafted", "verified", "in_review", "approved", "published"] as const;
export type PieceStatus = (typeof PIECE_STATUSES)[number];

/** 구분 표시 — 01 문서 §5: 사실 · 시장 반응 · 해석 · 시나리오 */
export type Mark = "fact" | "reaction" | "view" | "scenario";

export interface PieceClaim {
  id: string;
  mark: Mark;
  basis: "research" | "experienced";
  text: string;
  publisher: string | null;
  url: string | null;
  quote: string | null;
  accessedAt: string | null; // YYYY-MM-DD
  asOf: string | null; // 기준 시점 ISO (분 단위)
  verified: boolean;
  /** [L2] 사람 확인 기록(G2) — 확인한 사람·시각. 문장이 바뀌면 지워진다 */
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  /** [L2] 해석이 서 있는 사실 문장 id(01 §5 based_on) */
  basedOn?: string[];
}

export interface Stage {
  key: string;
  title: string;
  question: string;
  body: string;
}

export interface Piece {
  id: string;
  kind: PieceKind;
  title: string;
  slot: string; // 게시 예정 ISO (KST)
  status: PieceStatus;
  gates: Record<GateId, GateState>;
  blocker: string | null; // 「G2 · 출처 2개 미확인」 같은 한 줄
  viewpoint: string; // G1 핵심 관점 한 문장
  stages: Stage[];
  claims: PieceClaim[];
  preIssueId?: string;
  cards?: string[]; // 미리보기 카드 이미지 이름
  hash?: string; // 승인 해시(G3 통과 시)
  // ── [L2] 작성·검수(authoring.ts) — 없으면 빈 값으로 읽는다 ──
  /** 저장 버전(낙관적 동시성). 저장할 때마다 1 오른다 */
  revision?: number;
  /** G1 중요도(①②) */
  importance?: "major" | "watch" | null;
  /** ① 이전 편 3단 시나리오(안정 id — ② 가 이 id 로 응답한다) */
  scenarios?: ScenarioItem[];
  /** ① 이전 편 5단 「확인할 것」(안정 id) */
  checks?: CheckItem[];
  /** ② 이후 편 — 이전 편 시나리오마다 응답 */
  scenarioOutcomes?: ScenarioOutcome[];
  /** ② 이후 편 — 이전 편 확인 항목마다 처리 */
  checkResults?: CheckResult[];
  /** ② 이후 편 발행 전 자료 확보 조건(01 §4.3, 사람 판단) */
  evidence?: EvidenceReady;
  /** 게이트 통과 기록(최근 것부터 아님 — 기록 순서). 저장소가 채운다 */
  approvals?: Approval[];
}

export interface ScenarioItem {
  id: string;
  label: string;
  condition: string;
  reading: string;
}

export interface CheckItem {
  id: string;
  what: string;
  where: string;
}

export const SCENARIO_OUTCOMES = ["matched", "partial", "diverged", "unresolved"] as const;
export type ScenarioOutcomeKind = (typeof SCENARIO_OUTCOMES)[number];
export interface ScenarioOutcome {
  scenarioId: string;
  outcome: ScenarioOutcomeKind;
  note: string;
}

export const CHECK_RESULT_STATUSES = ["done", "not_available", "dropped"] as const;
export type CheckResultStatus = (typeof CHECK_RESULT_STATUSES)[number];
export interface CheckResult {
  checkId: string;
  status: CheckResultStatus;
  note: string;
}

export interface EvidenceReady {
  /** 결과의 1차 자료가 공개됐고 확인했다 */
  primary: boolean;
  /** 시장 반응을 읽을 만큼 관측 시간이 지났다 */
  observed: boolean;
  /** 이전 편 시나리오 전부에 대응이 적혀 있다 */
  allScenarios: boolean;
  /** 사실 / 시장 반응 / 해석이 섞이지 않았다 */
  separated: boolean;
}

/** 게이트 통과·반려 기록(04 Approval). contentHash 가 지금 내용 해시와 다르면 무효다 */
export interface Approval {
  gate: GateId;
  decision: "approved" | "rejected";
  actor: string;
  at: string;
  contentHash: string;
  note: string | null;
}

export interface WeekVariable {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  tz: string;
  label: string;
  mark: Mark;
  source: string;
  importance: "major" | "watch";
  closedBy?: string; // 이후 편 id
}

export interface EventCandidate {
  id: string;
  date: string;
  label: string;
  questions: Record<"a" | "b" | "c" | "d" | "e", boolean>;
  decision: "major" | "watch" | "skip" | null;
}

export interface QueueItem {
  pieceId: string;
  channel: "feed" | "story" | "reels";
  approvedHash: string | null;
  currentHash: string;
  postedUrl: string | null;
}
