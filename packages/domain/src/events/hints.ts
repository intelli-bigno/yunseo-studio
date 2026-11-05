// 기계 판독 파일을 확인하지 못한 공식 원천 — 수동 입력 때 「확인 출처 URL」 로 쓸 공식 페이지 안내.
// URL 은 2026-11-05 에 Aside 로 열어 확인한 것만 적는다(docs/05 §5.4). 모르는 기관은 운영자가 URL 을 직접 넣는다.
export interface ManualSourceHint {
  org: string;
  label: string;
  url: string;
}

export const MANUAL_SOURCE_HINTS: readonly ManualSourceHint[] = [
  { org: "ECB", label: "유럽중앙은행 통화정책 회의 일정", url: "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html" },
  { org: "BoE", label: "영란은행 통화정책위원회 일정", url: "https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates" },
  { org: "BoJ", label: "일본은행 금융정책결정회합 일정", url: "https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm" },
];
