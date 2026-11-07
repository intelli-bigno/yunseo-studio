// [W4] 콘텐츠 목록 썸네일 — 편마다 「지금 내용으로 렌더한 카드가 몇 장인가 · 릴스가 있나」만 돌려준다.
// 파이프라인 기록(PipelineRecord)은 내용 해시와 함께 저장되므로, 해시가 다른(낡은) 산출물은 없는 것으로 친다.
import type { PipelineRecord } from "./ports";

export interface PiecePreview {
  /** 지금 내용으로 렌더한 카드 수(없으면 0). 카드 n 번째 그림은 /api/pieces/<id>/cards/<n> */
  cards: number;
  /** 카드마다 대체 텍스트(cards 와 같은 순서). 렌더러가 안 채웠으면 빈 문자열 */
  alts: string[];
  /** 지금 내용으로 합성한 릴스가 있다 */
  reel: boolean;
}

export const NO_PREVIEW: PiecePreview = { cards: 0, alts: [], reel: false };

/** 기록 하나 → 미리보기. 기록이 없거나 해시가 다르면(낡음) 비어 있다 */
export function previewOf(rec: PipelineRecord | null, hash: string): PiecePreview {
  if (!rec || rec.contentHash !== hash) return NO_PREVIEW;
  const cards = rec.render?.cards.length ?? 0;
  return { cards, alts: Array.from({ length: cards }, (_, i) => rec.render?.altTexts[i] ?? ""), reel: !!rec.reel };
}
