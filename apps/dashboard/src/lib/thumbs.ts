// 콘텐츠 목록 썸네일 — 미리보기(카드 수) → 그림 자리 모양과 장별 주소·대체 텍스트. 화면은 이 값만 그린다.
import type { PiecePreview } from "@yunseo/application";

export interface Slide {
  src: string;
  alt: string;
}

/** 그림 자리 모양 — 2장 이상은 넘겨 보기, 1장은 썸네일 한 장, 0장은 자리 표시(아직 렌더 전) */
export type FrameKind = "carousel" | "single" | "blank";

export const frameKind = (cards: number): FrameKind => (cards > 1 ? "carousel" : cards === 1 ? "single" : "blank");

/** 렌더한 n 번째(1부터) 카드 그림 — /api/pieces/[id]/cards/[n] */
export const cardSrc = (pieceId: string, n: number): string => `/api/pieces/${encodeURIComponent(pieceId)}/cards/${n}`;

/** 장별 주소·대체 텍스트. 대체 텍스트가 비면 제목 + 번호로 채운다 */
export function slidesOf(pieceId: string, title: string, preview: Pick<PiecePreview, "cards" | "alts">): Slide[] {
  return Array.from({ length: preview.cards }, (_, i) => ({ src: cardSrc(pieceId, i + 1), alt: preview.alts[i]?.trim() || `${title} ${i + 1}` }));
}
