// 쓰기 API 본문 상한 — Next route 파일은 정해진 이름(GET·dynamic 등)만 export 할 수 있어 상수는 여기 둔다.
import { KB } from "./http";

/** 덱 상한(DECK_LIMITS: 카드 30 × 레이어 40 × 글 2000자, 한글 3바이트) 최악값 ≈ 7.2MB 에 여유를 둔 값 */
export const CARD_DECK_MAX_BYTES = 8 * KB * KB;
