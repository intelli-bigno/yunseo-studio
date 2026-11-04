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
