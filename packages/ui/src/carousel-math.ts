// 캐러셀 계산(순수 함수) — 가로 스크롤 위치 ↔ 몇 번째 장인가. 화면(DOM) 없이 시험한다.

/** 스크롤 위치에서 가장 가까운 장(0부터). 폭·장 수가 비정상이면 0 */
export function slideIndex(scrollLeft: number, width: number, count: number): number {
  if (count <= 0 || !(width > 0) || !Number.isFinite(scrollLeft)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / width)));
}

/** 이전(-1)·다음(+1) 장. 끝에서 돌지 않고 멈춘다 */
export function stepIndex(index: number, dir: -1 | 1, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, index + dir));
}

/** 방향키 → 이동 방향. 좌우 화살표가 아니면 null */
export function keyDirection(key: string): -1 | 1 | null {
  return key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : null;
}

/** 점은 이 수까지만 찍는다 — 넘으면 「3 / 12」 숫자로 바꾼다 */
export const DOT_MAX = 8;
export const showsDots = (count: number): boolean => count > 1 && count <= DOT_MAX;
