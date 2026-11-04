// 이미지 최적화 주소 만들기 — next 의 이미지 최적화기(/_next/image: AVIF/WebP 변환·크기별 파일·디스크 캐시)를 쓰되,
// next/image 를 import 하지 않는다: 서버 컴포넌트에서 import 해도 그 클라이언트 컴포넌트(gzip 5.5KB)가 모든 화면 번들에 실린다(2026-11-04 실측).
// 결과는 ui 가 아는 Media 값이다(ui 는 next 를 모른다). 크기는 토큰(breakpoint)에서 온다.
import { breakpoint } from "@yunseo/design-tokens";
import type { Media } from "@yunseo/ui";
import { DEVICE_SIZES, IMAGE_QUALITY, IMAGE_SIZES } from "./image-config";

const ALLOWED = [...IMAGE_SIZES, ...DEVICE_SIZES].sort((a, b) => a - b);
const url = (src: string, w: number) => `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=${IMAGE_QUALITY}`;
/** 요청 폭 이상인 가장 작은 허용 폭 (없으면 가장 큰 폭) */
const fit = (px: number) => ALLOWED.find((w) => w >= px) ?? ALLOWED[ALLOWED.length - 1]!;

interface Options {
  width: number;
  height: number;
  /** 폭이 고정이 아니라 화면 비율로 변하면 sizes 를 준다(w 기준 srcset). 고정 폭이면 생략(1x·2x) */
  sizes?: string;
  priority?: boolean;
}

export function media(src: string, { width, height, sizes, priority = false }: Options): Media {
  if (sizes) {
    const widths = DEVICE_SIZES;
    return { src: url(src, fit(width)), srcSet: widths.map((w) => `${url(src, w)} ${w}w`).join(", "), sizes, width, height, priority };
  }
  const one = fit(width);
  const two = fit(width * 2);
  return { src: url(src, two), srcSet: one === two ? undefined : `${url(src, one)} 1x, ${url(src, two)} 2x`, width, height, priority };
}

/** 오늘 화면 히어로 — 본문 8/12 칸(넓은 화면), 좁으면 전체 폭. 첫 화면 이미지라 우선순위를 높인다 */
export const heroMedia = (src: string, ratio: { width: number; height: number }, priority = false): Media =>
  media(src, { ...ratio, sizes: `(min-width: ${breakpoint.rail}px) 60vw, 100vw`, priority });

/** 빈 상태 일러스트 — 고정 폭(ui 가 정한 크기) */
export const emptyMedia = (): Media => media("/img/empty.jpg", { width: 128, height: 128 });
