// 카드 계획 — 콘텐츠 정본(종마다 다른 모양)을 「카드 몇 장, 장마다 무엇」이라는 하나의 모양으로 바꾼다.
// 레이아웃(layout/)은 이 모양만 안다. 종이 늘어도 레이아웃은 그대로다.
import type { Strings } from "../strings";

/** ■ 보도된 사실 · ▲ 시장 반응 · ◆ 운영자 해석 · ○ 시나리오 (docs/01 §5) */
export type Marker = "fact" | "market" | "view" | "scenario";

export interface Para {
  t: "para";
  marker?: Marker;
  /** `**핵심 구**` 는 굵게 + 밑줄 */
  text: string;
  /** 다음 장으로 넘기는 강조색 한 줄 */
  next?: boolean;
}
export interface BoxRow {
  /** 번호(❶❷❸). 없으면 번호 칸을 비운다 */
  n?: number;
  /** 굵은 머리 구 */
  title?: string;
  text: string;
}
/** 번호 목록 상자 */
export interface Box {
  t: "box";
  rows: BoxRow[];
}
export interface Checks {
  t: "checks";
  items: { title: string; hint?: string }[];
}
/** 닫는 강조 상자 (독자가 손에 쥘 것) */
export interface Close {
  t: "close";
  text: string;
}
export interface SourceRow {
  marker: Marker;
  title: string;
  detail: string;
  note?: string;
}
export interface Sources {
  t: "sources";
  rows: SourceRow[];
}
/** 점선 자리 상자 — 비어 있는 칸(운영자 해석·고지 문구) */
export interface Placeholder {
  t: "placeholder";
  text: string;
}
/** 검은 띠 한 줄 — 다음 편 안내 */
export interface Banner {
  t: "banner";
  text: string;
}
export type Block = Para | Box | Checks | Close | Sources | Placeholder | Banner;

export interface CardPage {
  /** 배경 이미지 슬롯 이름: cover · <stage> · <stage>-2 … · sources */
  slot: string;
  kind: "cover" | "qa" | "sources";
  /** 표지 제목 */
  title?: string;
  question?: string;
  answer?: string;
  blocks: Block[];
}

/** 카드 계획에 들어가는 공통 입력 */
export interface PlanContext {
  /** 발행 언어에 맞는 고정 문구 */
  s: Strings;
  /** 확정된 고지 문구(없으면 null) */
  disclosure: string | null;
  /** 포맷 프리셋의 카드 장면(질문 Q·기본 답 A) 조회 — 슬롯과 장 번호(0부터) */
  page(slot: string, index: number): { q: string; a: string | null };
}

/** 슬롯의 장 번호별 배경 슬롯 이름: 첫 장은 슬롯 그대로, 둘째부터 `<슬롯>-<n>` */
export function pageSlot(slot: string, index: number): string {
  return index === 0 ? slot : `${slot}-${index + 1}`;
}
