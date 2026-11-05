// 카드 안의 고정 문구(템플릿이 쓰는 말) — 발행 언어별. 질문 말풍선(Q)은 여기가 아니라 포맷 프리셋의 pages 에 있다.
// 지원하는 언어는 en · ko. 그 밖의 언어는 영어 문구를 쓰고 렌더 결과 경고에 남긴다.
import type { Marker } from "./plan/types";

export type Lang = "en" | "ko";

export interface Strings {
  asOf: string;
  asOfMissing: string;
  channelTbd: string;
  channelShortTbd: string;
  draftTag: string;
  editedBy: string;
  operatorTbd: string;
  next: (question: string) => string;
  conditionsNote: string;
  readingsNote: string;
  landsOn: (touches: string) => string;
  legend: Record<Marker, { title: string; none: string }>;
  legendNote: string;
  sourceNeeded: string;
  accessed: string;
  moreClaims: (n: number) => string;
  viewMissing: string;
  viewTitle: string;
  disclosureTbd: string;
  statusDraft: string;
  followUp: string;
  outcome: Record<"matched" | "partial" | "diverged" | "unresolved", string>;
  checkStatus: Record<"done" | "not_available" | "dropped", string>;
  judgment: Record<"kept" | "revised" | "dropped", string>;
  noPriorScenarios: string;
  hypothesis: string;
  falsifier: string;
  useWhen: string;
  skipWhen: string;
  riskLimits: string;
  why: string;
  changed: string;
  inputs: string;
  outputs: string;
  limits: string;
  verifiedScope: string;
  tested: string;
  scope: string;
  result: string;
  stillUnknown: string;
  changesEarlier: string;
  cardOf: (i: number, n: number) => string;
}

const EN: Strings = {
  asOf: "As of",
  asOfMissing: "As of [not set]",
  channelTbd: "[Channel TBD]",
  channelShortTbd: "[CH]",
  draftTag: "DRAFT",
  editedBy: "edited by",
  operatorTbd: "[operator TBD]",
  next: (q) => `Next: ${q}`,
  conditionsNote: "Each is a condition to watch, **not a forecast.**",
  readingsNote: "Readings to **test against what you see**, not conclusions.",
  landsOn: (t) => `Each path ends where you can **look it up yourself**: ${t}.`,
  legend: {
    fact: { title: "Reported facts", none: "none cited in this post" },
    market: { title: "Market reaction", none: "none cited in this post" },
    view: { title: "Operator's view", none: "built on the facts above" },
    scenario: { title: "Scenarios", none: "conditions to readings, no probabilities" },
  },
  legendNote: "Solid underline = researched, dashed = first-hand",
  sourceNeeded: "source needed",
  accessed: "accessed",
  moreClaims: (n) => `+${n} more claims in the source table`,
  viewMissing: "Operator's view: not written yet (required before review)",
  viewTitle: "Operator's view",
  disclosureTbd: "[Disclosure text TBD]",
  statusDraft: "Status: draft, cannot be published",
  followUp: "Follow-up: the post-event issue closes these checks with what happened.",
  outcome: { matched: "Matched", partial: "Partly", diverged: "Diverged", unresolved: "Unresolved" },
  checkStatus: { done: "Done", not_available: "Not available", dropped: "Dropped" },
  judgment: { kept: "Kept", revised: "Revised", dropped: "Dropped" },
  noPriorScenarios: "No earlier scenarios existed for this event.",
  hypothesis: "Hypothesis",
  falsifier: "What would show it wrong",
  useWhen: "Use when",
  skipWhen: "Skip when",
  riskLimits: "Risk limits",
  why: "Why",
  changed: "Changed",
  inputs: "Inputs",
  outputs: "Outputs",
  limits: "Limits",
  verifiedScope: "Verified scope",
  tested: "Tested",
  scope: "Scope",
  result: "Result",
  stillUnknown: "Still unknown",
  changesEarlier: "Changes to earlier posts",
  cardOf: (i, n) => `Card ${i} of ${n}`,
};

const KO: Strings = {
  asOf: "기준 시점",
  asOfMissing: "기준 시점 [미입력]",
  channelTbd: "[채널명 미정]",
  channelShortTbd: "[CH]",
  draftTag: "초안",
  editedBy: "edited by",
  operatorTbd: "[운영자 미정]",
  next: (q) => `다음: ${q}`,
  conditionsNote: "각각은 지켜볼 조건일 뿐 **예측이 아닙니다.**",
  readingsNote: "결론이 아니라 **보이는 것과 맞춰 볼 해석**입니다.",
  landsOn: (t) => `각 경로는 **직접 찾아볼 수 있는 곳**에서 끝납니다: ${t}.`,
  legend: {
    fact: { title: "보도된 사실", none: "이 게시물에서 인용한 것 없음" },
    market: { title: "시장 반응", none: "이 게시물에서 인용한 것 없음" },
    view: { title: "운영자 해석", none: "위 사실 위에 세운 해석" },
    scenario: { title: "시나리오", none: "조건 → 읽는 법, 확률 없음" },
  },
  legendNote: "실선 밑줄 = 조사, 점선 = 직접 경험",
  sourceNeeded: "출처 필요",
  accessed: "접근",
  moreClaims: (n) => `출처 표에 ${n}건 더 있음`,
  viewMissing: "운영자 해석: 아직 쓰지 않음 (검수 전 필수)",
  viewTitle: "운영자 해석",
  disclosureTbd: "[고지 문구 미정]",
  statusDraft: "상태: 초안, 게시 불가",
  followUp: "후속: 사건 이후 편이 이 확인 항목을 실제 결과로 닫습니다.",
  outcome: { matched: "일치", partial: "일부", diverged: "달랐음", unresolved: "미정" },
  checkStatus: { done: "확인함", not_available: "확인 불가", dropped: "제외" },
  judgment: { kept: "유지", revised: "수정", dropped: "철회" },
  noPriorScenarios: "이 사건에는 사전 시나리오가 없었습니다.",
  hypothesis: "가설",
  falsifier: "틀렸다고 볼 신호",
  useWhen: "쓸 때",
  skipWhen: "쓰지 않을 때",
  riskLimits: "리스크 한도",
  why: "이유",
  changed: "바뀐 점",
  inputs: "넣는 것",
  outputs: "나오는 것",
  limits: "한계",
  verifiedScope: "검증한 범위",
  tested: "확인한 것",
  scope: "범위",
  result: "결과",
  stillUnknown: "아직 모르는 것",
  changesEarlier: "이전 편에서 바뀐 것",
  cardOf: (i, n) => `카드 ${i}/${n}`,
};

/** 발행 언어 코드 → 문구 묶음. 지원하지 않는 언어는 영어 + fallback 표시 */
export function stringsFor(language: string): { lang: Lang; strings: Strings; fallback: boolean } {
  if (language.toLowerCase().startsWith("ko")) return { lang: "ko", strings: KO, fallback: false };
  return { lang: "en", strings: EN, fallback: !language.toLowerCase().startsWith("en") };
}

export const MARKER_GLYPH: Record<Marker, string> = { fact: "■", market: "▲", view: "◆", scenario: "○" };
