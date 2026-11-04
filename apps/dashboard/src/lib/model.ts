// 대시보드 화면 모델(목업 단계). 정본 스키마는 packages/domain — 유스케이스 연결(M2) 전까지 화면은 이 모델만 본다.

export type Kind = "pre" | "post" | "research" | "story";
export const KIND_LABEL: Record<Kind, string> = { pre: "이전", post: "이후", research: "연구", story: "스토리" };
export const KIND_NO: Record<Kind, string> = { pre: "01", post: "02", research: "03", story: "S" };

/** 게이트 상태. waiting = 사람 판단 대기, blocked = 칸이 비어 못 감 */
export type GateState = "passed" | "waiting" | "blocked" | "todo";
export type GateId = "G1" | "G2" | "G3";
export const GATE_LABEL: Record<GateId, string> = { G1: "주제·관점", G2: "사실 확인", G3: "발행 판단" };

export type Status = "idea" | "selected" | "evidence_wait" | "drafted" | "verified" | "in_review" | "approved" | "published";
export const STATUS_LABEL: Record<Status, string> = {
  idea: "후보",
  selected: "선정",
  evidence_wait: "자료 대기",
  drafted: "작성 중",
  verified: "확인됨",
  in_review: "검수 중",
  approved: "승인",
  published: "발행",
};

/** 구분 표시 — 01 문서 §5: 사실 ■ · 시장 반응 ▲ · 해석 ◆ · 시나리오 ○ */
export type Mark = "fact" | "reaction" | "view" | "scenario";
export const MARK_GLYPH: Record<Mark, string> = { fact: "■", reaction: "▲", view: "◆", scenario: "○" };
export const MARK_LABEL: Record<Mark, string> = { fact: "사실", reaction: "시장 반응", view: "해석", scenario: "시나리오" };

export interface Claim {
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
}

export interface Stage {
  key: string;
  title: string;
  question: string;
  body: string;
}

export interface Piece {
  id: string;
  kind: Kind;
  title: string;
  slot: string; // 게시 예정 ISO (KST)
  status: Status;
  gates: Record<GateId, GateState>;
  blocker: string | null; // 「G2 · 출처 2개 미확인」 같은 한 줄
  viewpoint: string; // G1 핵심 관점 한 문장
  stages: Stage[];
  claims: Claim[];
  preIssueId?: string;
  cards?: string[]; // 미리보기 카드 이미지 이름(/api/cards/<name>)
  hash?: string; // 승인 해시(G3 통과 시)
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
