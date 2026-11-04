// 유스케이스가 화면에 돌려주는 읽기 모델 — 직렬화 가능한 평범한 값만. 화면은 이것만 그린다.
import type { EventCandidate, GateId, Piece, PieceKind, QueueItem, QueueState, WeekVariable } from "@yunseo/domain";

export interface PieceRow {
  piece: Piece;
  /** 지금 이 편이 서 있는 게이트. 전부 통과면 null */
  gate: GateId | null;
}

/** 사이드바 숫자 — 모든 화면의 레이아웃이 부른다 */
export interface NavSummary {
  today: string;
  awaiting: number;
  stuck: number;
  unpublished: number;
  ready: number;
}

export interface DayColumn {
  date: string;
  state: "today" | "past" | "default";
  pieces: PieceRow[];
}

export interface QueueRow {
  item: QueueItem;
  piece: Piece;
  state: QueueState;
}

export interface TodayBoard {
  today: string;
  /** 지금 가장 먼저 볼 편(내 게이트 → 막힌 편 순) */
  focus: PieceRow | null;
  focusChecked: number;
  mine: PieceRow[];
  stuck: PieceRow[];
  queueSummary: Record<QueueState, number>;
  queue: QueueRow[];
  variables: WeekVariable[];
  week: DayColumn[];
}

export type ScheduleMode = "week" | "month";

export interface ScheduleView {
  today: string;
  mode: ScheduleMode;
  /** 보이는 범위의 첫 날·마지막 날 */
  from: string;
  to: string;
  days: DayColumn[];
  variables: WeekVariable[];
  candidates: EventCandidate[];
}

export interface ContentList {
  kind: PieceKind | "all";
  rows: PieceRow[];
  total: number;
}

export interface PieceDetail {
  piece: Piece;
  /** 이 편이 닫는 이전 편(이후 편만) */
  preIssue: Piece | null;
  /** G2 를 막는 문장 수 */
  openClaims: number;
}

export interface PublishQueueView {
  summary: Record<QueueState, number>;
  rows: QueueRow[];
}

/** 빠른 이동(⌘K) 색인 원료 — 라벨·주소는 화면이 만든다 */
export interface PaletteIndex {
  pieces: { id: string; title: string; kind: PieceKind; hasClaims: boolean }[];
}
