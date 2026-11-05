// 9:16 캔버스 안의 배치 — 4:5 카드와 자막 상자를 안전영역 안에 놓는다(순수 계산).
import type { ReelPreset } from "./preset";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ReelLayout {
  canvas: { width: number; height: number };
  /** 플랫폼 UI 를 피한 안쪽 영역 */
  safe: Rect;
  /** 카드(4:5)가 놓이는 칸 */
  card: Rect;
  /** 자막 상자(안쪽 여백 포함) */
  subtitleBox: Rect;
  /** 카드 뒤 배경이 덮는 영역 = 캔버스 전체 */
  background: Rect;
  /** 카드가 이보다 좁으면 위반(px) */
  minCardWidth: number;
}

const even = (n: number) => Math.floor(n / 2) * 2;

/**
 * 안전영역 안을 위에서부터 [카드 | 간격 | 자막 상자]로 나눈다.
 * 카드는 남는 칸에 4:5 를 유지한 채 가장 크게(contain) 넣고 가로 가운데에 둔다.
 */
export function computeReelLayout(p: ReelPreset): ReelLayout {
  const { canvas, safeArea: s, subtitle: sub, cardSource } = p;
  const safe: Rect = { x: s.left, y: s.top, w: canvas.width - s.left - s.right, h: canvas.height - s.top - s.bottom };

  const subtitleH = Math.ceil(sub.fontSize * sub.lineHeightEm * sub.maxLines + sub.padPx * 2);
  const subtitleBox: Rect = { x: safe.x, y: safe.y + safe.h - subtitleH, w: safe.w, h: subtitleH };

  const slot: Rect = { x: safe.x, y: safe.y, w: safe.w, h: subtitleBox.y - sub.gapPx - safe.y };
  const scale = Math.min(slot.w / cardSource.width, slot.h / cardSource.height);
  // 짝수로 맞춘다 — yuv420 은 홀수 크기를 못 다룬다
  const w = even(cardSource.width * scale);
  const h = even(cardSource.height * scale);
  const card: Rect = { x: even(slot.x + (slot.w - w) / 2), y: slot.y, w, h };

  return { canvas: { width: canvas.width, height: canvas.height }, safe, card, subtitleBox,
    background: { x: 0, y: 0, w: canvas.width, h: canvas.height },
    minCardWidth: Math.round(canvas.width * p.cardMinWidthRatio),
  };
}

const inside = (inner: Rect, outer: Rect) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** 배치 규칙 위반을 말로 돌려준다. 빈 배열이면 정상 */
export function reelLayoutIssues(layout: ReelLayout): string[] {
  const issues: string[] = [];
  if (layout.card.w <= 0 || layout.card.h <= 0) issues.push("카드가 놓일 칸이 없다 — 안전영역이 너무 좁다");
  else if (layout.card.w < layout.minCardWidth) issues.push(`카드가 너무 작다(${layout.card.w}px < ${layout.minCardWidth}px) — 안전영역·자막 줄 수를 줄이거나 자막을 작게`);
  if (!inside(layout.card, layout.safe)) issues.push("카드가 안전영역 밖으로 나간다");
  if (!inside(layout.subtitleBox, layout.safe)) issues.push("자막 상자가 안전영역 밖으로 나간다");
  if (overlap(layout.card, layout.subtitleBox)) issues.push("카드와 자막 상자가 겹친다");
  return issues;
}

/** 점 목록(예: 영상 프레임에서 찾은 밝은 픽셀의 경계 상자)이 안전영역 안인지 */
export function insideSafeArea(box: Rect, layout: ReelLayout): boolean {
  return inside(box, layout.safe);
}
