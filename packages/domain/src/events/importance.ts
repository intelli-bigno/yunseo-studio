// 중요도 판정 — docs/02 §3.2. 자동은 점검표(a~e)만 채우고, 최종 판정은 사람이 누른다.
import type { CalendarEventKind } from "./model";

export const EVENT_IMPORTANCE = ["major", "watch", "skip"] as const;
export type EventImportance = (typeof EVENT_IMPORTANCE)[number];

/** a 기대 변화 · b 갈림 · c 자료(1차 자료·사전 기대 확인) · d 해석(운영자 도메인 해석) · e 후속 변수 */
export interface ImportanceAnswers {
  a: boolean;
  b: boolean;
  c: boolean;
  d: boolean;
  e: boolean;
}

export const IMPORTANCE_ANSWER_LABEL: Record<keyof ImportanceAnswers, string> = {
  a: "기대 변화",
  b: "갈림",
  c: "자료 확인",
  d: "운영자 해석",
  e: "후속 변수",
};

/**
 * 판정 규칙(02 §3.2 표).
 * - major: a·b·c·d 모두 예
 * - watch: a 또는 b 가 예이고 c·d 중 하나 이상 아니오
 * - skip: 그 밖
 * [해석] a·b 중 하나만 예인데 c·d 가 모두 예인 경우는 표에 없다 — 피드 편성이 없는 watch 로 둔다(skip 으로 버리지 않는다).
 */
export function judgeEventImportance(q: ImportanceAnswers): EventImportance {
  if (q.a && q.b && q.c && q.d) return "major";
  if (q.a || q.b) return "watch";
  return "skip";
}

/**
 * 종류별 점검표 기본값 — 공식 발표 일정으로 알 수 있는 것만 채운다.
 * d(운영자 해석)는 사람만 안다 → 항상 false. 그래서 자동 제안은 watch 를 넘지 않고, major 는 사람이 사유를 적고 올린다.
 */
const PROFILE: Record<CalendarEventKind, Pick<ImportanceAnswers, "a" | "b" | "c" | "e">> = {
  rate_decision: { a: true, b: true, c: true, e: true },
  press_conference: { a: true, b: false, c: true, e: false },
  central_bank_minutes: { a: true, b: false, c: true, e: false },
  central_bank_report: { a: false, b: false, c: true, e: false },
  central_bank_testimony: { a: true, b: false, c: true, e: false },
  inflation_headline: { a: true, b: true, c: true, e: true },
  inflation_detail: { a: true, b: false, c: true, e: false },
  employment_headline: { a: true, b: true, c: true, e: true },
  employment_detail: { a: true, b: false, c: true, e: false },
  growth_headline: { a: true, b: true, c: true, e: true },
  growth_detail: { a: false, b: false, c: true, e: false },
  data_release_other: { a: false, b: false, c: true, e: false },
  election: { a: true, b: true, c: true, e: true },
  policy_announcement: { a: true, b: true, c: false, e: true },
  speech: { a: false, b: false, c: true, e: false },
  other: { a: false, b: false, c: false, e: false },
};

export function suggestImportanceAnswers(kind: CalendarEventKind): ImportanceAnswers {
  return { ...PROFILE[kind], d: false };
}

export function suggestKindImportance(kind: CalendarEventKind): EventImportance {
  return judgeEventImportance(suggestImportanceAnswers(kind));
}

/** 사람이 남긴 판정 한 건 */
export interface EventDecision {
  eventId: string;
  decision: EventImportance;
  /** 올릴 때 필수, 내리거나 제외할 때는 선택 */
  reason: string;
  decidedAt: string;
}

const RANK: Record<EventImportance, number> = { skip: 0, watch: 1, major: 2 };

/** 최종 판정 = 사람의 판정 > 자동 제안 */
export function effectiveEventImportance(suggested: EventImportance, human: Pick<EventDecision, "decision"> | null): EventImportance {
  return human ? human.decision : suggested;
}

/** 판정을 올릴 때는 사유를 받는다(02 §3.2 「발행량을 채우려고 판정을 올리지 않는다」). 문제가 없으면 빈 배열 */
export function eventDecisionIssues(input: { suggested: EventImportance; decision: EventImportance; reason: string }): string[] {
  const raising = RANK[input.decision] > RANK[input.suggested];
  return raising && input.reason.trim() === "" ? ["판정을 올리려면 사유가 필요하다 (어떤 질문의 답이 왜 바뀌었는가)"] : [];
}
