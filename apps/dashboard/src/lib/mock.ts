// 목업 데이터 — 화면 확인용 자리표시. 수치·출처는 실제 사실이 아니다(발행에 쓰지 않는다).
import type { Claim, EventCandidate, Piece, QueueItem, Stage, WeekVariable } from "./model";

export const TODAY = "2026-11-04";
export const WEEK_START = "2026-11-02"; // 월요일

const preStages = (why: string): Stage[] => [
  { key: "why_it_matters", title: "왜 중요한가", question: "이 사건이 왜 지금 중요한가", body: why },
  { key: "market_expectation", title: "시장은 무엇을 예상하나", question: "현재 시장이 가격에 반영한 예상", body: "[자리표시] 컨센서스와 선물 시장이 반영한 확률을 한 줄로." },
  { key: "scenarios", title: "결과별 시나리오", question: "결과가 갈리는 갈래 2~3개", body: "○ 시나리오 A — 조건 / 읽는 법\n○ 시나리오 B — 조건 / 읽는 법\n○ 시나리오 C — 조건 / 읽는 법" },
  { key: "transmission", title: "영향 경로", question: "어떤 경로로 자산·업종에 닿나", body: "금리 → 달러 → 신흥국 자산 [자리표시]" },
  { key: "after_checks", title: "발표 뒤 확인할 것", question: "독자가 직접 확인할 신호 하나 이상", body: "" },
];

const postStages: Stage[] = [
  { key: "result_vs_expectation", title: "결과 vs 예상", question: "실제 결과는 예상과 어떻게 달랐나", body: "■ 실제 결과 [자료 대기]" },
  { key: "market_reaction", title: "시장 반응", question: "확인된 반응만 — 분 단위 기준 시점", body: "" },
  { key: "judgment_update", title: "판단 갱신", question: "유지·수정·폐기한 판단과 근거", body: "" },
  { key: "next_variables", title: "다음 변수", question: "다음으로 확인할 변수", body: "" },
];

const researchStages: Stage[] = [
  { key: "idea", title: "아이디어", question: "무엇을 왜 보나 — 가설과 반증 조건", body: "가설: 달러 강세 구간에서 신흥국 현지 통화 채권의 하락 폭은 금리 차보다 환율이 결정한다." },
  { key: "conditions", title: "조건", question: "언제 쓰고 언제 쓰지 않나", body: "쓰는 때: [작성 중]\n쓰지 않는 때: " },
  { key: "failures", title: "실패", question: "어디서 틀렸나", body: "" },
  { key: "tool", title: "도구", question: "도구와 사용법·한계", body: "" },
  { key: "follow_up", title: "후속", question: "후속 검증에서 확인된 것", body: "" },
];

const midtermClaims: Claim[] = [
  { id: "c1", mark: "fact", basis: "research", text: "중간선거 투표일은 11월 3일(현지)이다.", publisher: "연방선거위원회(자리표시)", url: "https://example.org/fec-calendar", quote: "General Election: November 3", accessedAt: "2026-11-02", asOf: "2026-11-02T09:00", verified: true },
  { id: "c2", mark: "reaction", basis: "research", text: "투표 전 주 10년물 금리는 [수치] 범위에서 움직였다.", publisher: "재무부 수익률 곡선(자리표시)", url: "https://example.org/treasury-yields", quote: "10 Yr — [value]", accessedAt: "2026-11-03", asOf: "2026-11-03T16:00", verified: true },
  { id: "c3", mark: "view", basis: "experienced", text: "의회 구성이 갈리면 재정 확장 속도가 먼저 달라진다고 본다.", publisher: null, url: null, quote: null, accessedAt: null, asOf: "2026-11-03T22:00", verified: true },
  { id: "c4", mark: "scenario", basis: "research", text: "상·하원 모두 한쪽 — 재정 확대 기대가 금리에 먼저 반영될 수 있다.", publisher: null, url: null, quote: null, accessedAt: null, asOf: "2026-11-03T22:00", verified: true },
];

const fomcClaims: Claim[] = [
  { id: "f1", mark: "fact", basis: "research", text: "의사록 공개 시각은 [일시] 이다.", publisher: "연준 일정(자리표시)", url: "https://example.org/fomc-calendar", quote: "Minutes of the FOMC — [date]", accessedAt: "2026-11-04", asOf: "2026-11-04T08:00", verified: true },
  { id: "f2", mark: "fact", basis: "research", text: "직전 회의에서 정책금리를 [수치]로 결정했다.", publisher: null, url: null, quote: null, accessedAt: null, asOf: null, verified: false },
  { id: "f3", mark: "reaction", basis: "research", text: "선물 시장은 다음 회의 인하 확률을 [수치]로 반영한다.", publisher: "선물 확률 집계(자리표시)", url: "https://example.org/fedwatch", quote: null, accessedAt: "2026-11-04", asOf: null, verified: false },
  { id: "f4", mark: "view", basis: "experienced", text: "의사록의 「인내」 표현이 빠지면 시장은 경로를 다시 그린다고 본다.", publisher: null, url: null, quote: null, accessedAt: null, asOf: "2026-11-04T09:30", verified: false },
];

export const PIECES: Piece[] = [
  {
    id: "P-1104",
    kind: "pre",
    title: "미국 중간선거 — 개표 전에 읽을 변수 다섯",
    slot: "2026-11-04T21:00",
    status: "in_review",
    gates: { G1: "passed", G2: "passed", G3: "waiting" },
    blocker: null,
    viewpoint: "의회 구성은 금리보다 재정 속도를 먼저 바꾼다 — 그 경로를 미리 그려 둔다.",
    stages: preStages("의회 구성이 재정 지출 속도를 정하고, 재정 속도가 장기 금리 기대를 움직인다."),
    claims: midtermClaims,
    cards: ["a-01", "a-02", "a-03", "a-04", "a-05", "a-06", "a-07"],
  },
  {
    id: "P-1105",
    kind: "pre",
    title: "FOMC 의사록 — 금리 경로 시나리오 셋",
    slot: "2026-11-05T20:00",
    status: "drafted",
    gates: { G1: "passed", G2: "blocked", G3: "todo" },
    blocker: "G2 · 출처 1개 없음 · 기준 시점 2개 비어 있음",
    viewpoint: "의사록의 표현 하나가 다음 회의 확률을 바꾼다 — 바뀌는 조건을 미리 적는다.",
    stages: preStages("다음 회의 전 마지막 공식 문서다. 표현 변화가 경로 기대를 바꾼다."),
    claims: fomcClaims,
  },
  {
    id: "A-1106",
    kind: "post",
    title: "중간선거 이후 — 세 시나리오는 어떻게 닫혔나",
    slot: "2026-11-06T21:00",
    status: "evidence_wait",
    gates: { G1: "passed", G2: "todo", G3: "todo" },
    blocker: "자료 대기 · 이전 편 시나리오 3개 중 0개 응답",
    viewpoint: "사전 시나리오 셋에 결과를 하나씩 대조한다 — 맞힌 것보다 틀린 이유가 핵심.",
    stages: postStages,
    claims: [],
    preIssueId: "P-1104",
  },
  {
    id: "R-1107",
    kind: "research",
    title: "달러 강세와 신흥국 채권 — 조건 편",
    slot: "2026-11-07T10:00",
    status: "drafted",
    gates: { G1: "passed", G2: "todo", G3: "todo" },
    blocker: null,
    viewpoint: "같은 금리 차라도 환율 구간에 따라 결과가 갈린다 — 쓰지 않는 때를 먼저 적는다.",
    stages: researchStages,
    claims: [],
  },
  {
    id: "R-1108",
    kind: "research",
    title: "가치주 vs 성장주 — 스레드 아이디어",
    slot: "2026-11-08T10:00",
    status: "idea",
    gates: { G1: "waiting", G2: "todo", G3: "todo" },
    blocker: null,
    viewpoint: "",
    stages: researchStages.map((s) => ({ ...s, body: "" })),
    claims: [],
  },
  {
    id: "S-W45",
    kind: "story",
    title: "이번 주의 변수 — 45주",
    slot: "2026-11-02T08:00",
    status: "published",
    gates: { G1: "passed", G2: "passed", G3: "passed" },
    blocker: null,
    viewpoint: "이번 주 일정과 무게를 한 장에.",
    stages: [],
    claims: [],
    hash: "9f3c1a7e",
  },
  {
    id: "P-1103",
    kind: "pre",
    title: "고용 보고서 — 숫자보다 수정치",
    slot: "2026-11-03T21:00",
    status: "published",
    gates: { G1: "passed", G2: "passed", G3: "passed" },
    blocker: null,
    viewpoint: "헤드라인보다 지난 두 달 수정치가 방향을 말한다.",
    stages: preStages("고용은 금리 경로의 첫 근거다."),
    claims: [],
    hash: "41be0d92",
  },
  {
    id: "A-1102",
    kind: "post",
    title: "ECB 이후 — 유지된 판단과 바뀐 판단",
    slot: "2026-11-02T21:00",
    status: "approved",
    gates: { G1: "passed", G2: "passed", G3: "passed" },
    blocker: null,
    viewpoint: "동결은 예상대로였고, 바뀐 것은 문구였다.",
    stages: postStages,
    claims: [],
    hash: "c07d55e1",
  },
];

export const WEEK_VARIABLES: WeekVariable[] = [
  { date: "2026-11-03", time: "06:00", tz: "KST", label: "미국 중간선거 투표", mark: "fact", source: "선거 일정(자리표시)", importance: "major", closedBy: "A-1106" },
  { date: "2026-11-05", time: "04:00", tz: "KST", label: "FOMC 의사록 공개", mark: "fact", source: "연준 일정(자리표시)", importance: "major" },
  { date: "2026-11-06", time: "22:30", tz: "KST", label: "미국 신규 실업수당 청구", mark: "fact", source: "노동부 일정(자리표시)", importance: "watch" },
  { date: "2026-11-07", time: "—", tz: "", label: "달러 강세 지속 여부", mark: "view", source: "운영자 해석", importance: "watch" },
];

export const EVENT_CANDIDATES: EventCandidate[] = [
  { id: "E-31", date: "2026-11-10", label: "미국 CPI 발표", questions: { a: true, b: true, c: true, d: false, e: true }, decision: null },
  { id: "E-32", date: "2026-11-11", label: "중국 무역수지", questions: { a: false, b: true, c: false, d: false, e: false }, decision: null },
  { id: "E-33", date: "2026-11-12", label: "OPEC 월간 보고서", questions: { a: false, b: true, c: true, d: false, e: false }, decision: "watch" },
];

export const QUEUE: QueueItem[] = [
  { pieceId: "P-1104", channel: "feed", approvedHash: null, currentHash: "7ab2e019", postedUrl: null },
  { pieceId: "A-1102", channel: "feed", approvedHash: "c07d55e1", currentHash: "c07d55e1", postedUrl: null },
  { pieceId: "P-1103", channel: "reels", approvedHash: "41be0d92", currentHash: "52aa9013", postedUrl: null },
  { pieceId: "S-W45", channel: "story", approvedHash: "9f3c1a7e", currentHash: "9f3c1a7e", postedUrl: "https://instagram.com/p/placeholder" },
];
