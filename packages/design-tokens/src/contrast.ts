// WCAG 2.x 대비 계산. 토큰 테스트가 글자/바탕 쌍의 대비를 검사할 때 쓴다.

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) throw new Error(`#rrggbb 형식이 아님: ${hex}`);
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** #rrggbb → rgba(r, g, b, a). 캔버스·덮개 그라데이션이 쓴다(화면과 PNG 내보내기가 같은 식). hexToRgb 와 달리 형식이 틀려도 던지지 않는다 — 그리는 중에 죽지 않게 */
export const hexToRgba = (hex: string, a: number): string => `rgba(${Number.parseInt(hex.slice(1, 3), 16)}, ${Number.parseInt(hex.slice(3, 5), 16)}, ${Number.parseInt(hex.slice(5, 7), 16)}, ${a})`;
