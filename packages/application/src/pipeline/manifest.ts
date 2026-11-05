// [L7] 카드 렌더 매니페스트 — L1(렌더)이 카드 폴더에 쓰고, L3(릴스 CLI)·사람이 읽는 파일 하나. 이름·모양을 여기서만 정한다.
// 모양 = CardRenderResult 그대로, 단 cards[].path 는 매니페스트가 있는 폴더 기준 상대 경로(폴더를 옮겨도 읽힌다).
import type { CardRenderResult } from "./contracts";

export const RENDER_MANIFEST = "render.json";

export interface RenderManifest extends Omit<CardRenderResult, "cards"> {
  cards: { name: string; path: string; bytes: number; sha256: string }[];
}

/** 렌더 결과 → 매니페스트(카드 경로를 파일 이름으로) */
export function toRenderManifest(result: CardRenderResult): RenderManifest {
  return { ...result, cards: result.cards.map(({ name, bytes, sha256 }) => ({ name, path: name, bytes, sha256 })) };
}
