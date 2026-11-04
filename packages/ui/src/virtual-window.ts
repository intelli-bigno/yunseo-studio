// 가상화 창 계산(순수 함수) — 긴 목록에서 화면에 그릴 행의 범위만 정한다.
export interface WindowInput {
  scrollTop: number;
  viewport: number;
  count: number;
  row: number;
  overscan: number;
}

/** [first, last) — 보이는 행 앞뒤로 overscan 행을 더 그린다 */
export function windowRange({ scrollTop, viewport, count, row, overscan }: WindowInput): [number, number] {
  const first = Math.max(0, Math.floor(scrollTop / row) - overscan);
  const last = Math.min(count, Math.ceil((scrollTop + viewport) / row) + overscan);
  return [first, Math.max(first, last)];
}

/** active 행이 보이도록 필요한 scrollTop. 이미 보이면 그대로 */
export function scrollToReveal(active: number, scrollTop: number, viewport: number, row: number): number {
  const top = active * row;
  if (top < scrollTop) return top;
  if (top + row > scrollTop + viewport) return top + row - viewport;
  return scrollTop;
}
