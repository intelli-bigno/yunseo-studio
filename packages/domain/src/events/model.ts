// 일정(사건) 모델 — 공식 일정 수집(L4)의 정본 모양. 도메인은 외부 의존 0 이다(04 규칙 1).
// 시간은 UTC ISO 로 저장하고 KST 로 보여 준다(time.ts). 시간대 변환이 필요한 원천은 어댑터가 UTC 로 바꿔 넘긴다.
import type { EventKind } from "../content";

/** 일정의 세부 종류 — 중요도 점검표 기본값(importance.ts)과 화면 라벨의 열쇠. 어댑터가 원천 제목을 이 값으로 옮긴다 */
export const CALENDAR_EVENT_KINDS = [
  "rate_decision",
  "press_conference",
  "central_bank_minutes",
  "central_bank_report",
  "central_bank_testimony",
  "inflation_headline",
  "inflation_detail",
  "employment_headline",
  "employment_detail",
  "growth_headline",
  "growth_detail",
  "data_release_other",
  "election",
  "policy_announcement",
  "speech",
  "other",
] as const;
export type CalendarEventKind = (typeof CALENDAR_EVENT_KINDS)[number];

/** 카드 스키마(pre-issue)의 event.kind 와 같은 큰 분류 — 편 작성으로 넘길 때 그대로 쓴다 */
export const CALENDAR_KIND_CATEGORY: Record<CalendarEventKind, EventKind> = {
  rate_decision: "central_bank",
  press_conference: "central_bank",
  central_bank_minutes: "central_bank",
  central_bank_report: "central_bank",
  central_bank_testimony: "central_bank",
  inflation_headline: "data_release",
  inflation_detail: "data_release",
  employment_headline: "data_release",
  employment_detail: "data_release",
  growth_headline: "data_release",
  growth_detail: "data_release",
  data_release_other: "data_release",
  election: "election",
  policy_announcement: "policy",
  speech: "speech",
  other: "other",
};

export const CALENDAR_KIND_LABEL: Record<CalendarEventKind, string> = {
  rate_decision: "기준금리 결정",
  press_conference: "기자회견",
  central_bank_minutes: "의사록",
  central_bank_report: "경기 보고서",
  central_bank_testimony: "의회 증언",
  inflation_headline: "물가 핵심 지표",
  inflation_detail: "물가 보조 지표",
  employment_headline: "고용 핵심 지표",
  employment_detail: "고용 보조 지표",
  growth_headline: "성장 핵심 지표",
  growth_detail: "성장 보조 지표",
  data_release_other: "기타 통계 발표",
  election: "선거",
  policy_announcement: "정책 발표",
  speech: "연설",
  other: "기타",
};

export const MANUAL_EVENT_SOURCE = "manual";

/** 원천이 내려준 일정 한 건(정규화된 모양). 같은 일정인지는 (source, externalId) 로 가른다 */
export interface CalendarEvent {
  source: string;
  /** 원천 안에서 같은 일정을 가리키는 값. 원천이 id 를 주면 그대로, 아니면 안정 키를 조립한다 */
  externalId: string;
  kind: CalendarEventKind;
  /** 원천 원문 제목 */
  title: string;
  /** 화면 표시용 이름(한국어) */
  label: string;
  /** UTC ISO `YYYY-MM-DDTHH:mm:00Z`. timeKnown=false 면 그 날짜의 00:00Z (날짜만 아는 일정) */
  startsAt: string;
  timeKnown: boolean;
  /** 사람이 읽는 원천 이름 (예: 미 노동통계국(BLS) 발표 일정) */
  sourceName: string;
  /** 확인 출처 URL — 공식 페이지. 비어 있으면 저장하지 않는다 */
  sourceUrl: string;
  note?: string;
}

export interface StoredEvent extends CalendarEvent {
  id: string;
  firstSeenAt: string;
  updatedAt: string;
  /** 원천이 더는 이 일정을 내려주지 않으면 그 시각. 다시 나타나면 null */
  removedAt: string | null;
}

export const EVENT_CHANGE_TYPES = ["time_changed", "title_changed", "removed", "restored"] as const;
export type EventChangeType = (typeof EVENT_CHANGE_TYPES)[number];

/** 일정이 바뀐 이력 — 조용히 고치지 않는다(02 §3.4). from/to 는 바뀐 값(일시는 UTC ISO) */
export interface EventChange {
  eventId: string;
  at: string;
  type: EventChangeType;
  from: string | null;
  to: string | null;
}

const hash = (text: string): string => {
  // cyrb53 — 외부 의존 없는 53비트 해시. 암호용이 아니라 짧고 안정적인 id 용이다
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

/** (원천, 외부 id) 에서 만드는 안정 id — 일시가 바뀌어도 같다 */
export const calendarEventId = (source: string, externalId: string): string => `E-${hash(`${source}\u0000${externalId}`)}`;

export const isEventSourceUrl = (value: string): boolean => {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
};
