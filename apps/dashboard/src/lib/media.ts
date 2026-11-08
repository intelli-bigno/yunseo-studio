// 이미지 최적화 주소 만들기 — next 의 이미지 최적화기(/_next/image: AVIF/WebP 변환·크기별 파일·디스크 캐시)를 쓰되,
// next/image 를 import 하지 않는다: 서버 컴포넌트에서 import 해도 그 클라이언트 컴포넌트(gzip 5.5KB)가 모든 화면 번들에 실린다(2026-11-04 실측).
// 결과는 ui 가 아는 Media 값이다(ui 는 next 를 모른다). 허용 폭은 image-config.ts 한 곳에서 온다.
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
  /** 고정 폭일 때 src 를 1x 로 두고 srcset 에는 2x 하나만 — 칸이 수백 개인 목록에서 같은 주소가 HTML·RSC 에 세 번 실리지 않게 한다(1x 는 src 가 맡는다) */
  lean?: boolean;
}

export function media(src: string, { width, height, sizes, priority = false, lean = false }: Options): Media {
  if (sizes) {
    const widths = DEVICE_SIZES;
    return { src: url(src, fit(width)), srcSet: widths.map((w) => `${url(src, w)} ${w}w`).join(", "), sizes, width, height, priority };
  }
  const one = fit(width);
  const two = fit(width * 2);
  if (lean && one !== two) return { src: url(src, one), srcSet: `${url(src, two)} 2x`, width, height, priority };
  return { src: url(src, two), srcSet: one === two ? undefined : `${url(src, one)} 1x, ${url(src, two)} 2x`, width, height, priority };
}

/** 빈 상태 일러스트 — 고정 폭(ui 가 정한 크기) */
export const emptyMedia = (): Media => media("/img/empty.jpg", { width: 128, height: 128 });

/** 최적화기가 받아 주는 레퍼런스 그림 — next.config.ts 의 허용 목록(remotePatterns·localPatterns)과 같다. 밖의 주소는 최적화기가 400 이라 원본 그대로 쓴다 */
export const optimizableRef = (src: string): boolean => /^https:\/\/i\.pinimg\.com\/736x\//.test(src) || (/^\/api\/refs\/[a-z0-9/_.-]+$/i.test(src) && !src.includes(".."));

const refMedia = (src: string, width: number, height: number, priority: boolean): Media =>
  optimizableRef(src) ? media(src, { width, height, priority, lean: true }) : { src, width, height, priority };

/** 레퍼런스 그리드 칸 — 폭 130~250px 라 1x 256 / 2x 448 WebP 면 충분하다. 원본(핀터레스트 736x JPEG 50~150KB, 저장소 캡처 ~180KB)을 그대로 받지 않는다 */
export const refThumb = (src: string, priority = false): Media => refMedia(src, 224, 280, priority);

/** 비교 칸(크게 보기) — 폭이 넓어 448/896 (원본보다 큰 폭은 최적화기가 키우지 않는다) */
export const refLarge = (src: string, priority = false): Media => refMedia(src, 448, 560, priority);

/** 첫 화면에서 즉시 받는 레퍼런스 칸 수 — 1440x900 에서 위 두 줄. 나머지는 화면에 가까워질 때 받는다 */
export const REF_PRIORITY_COUNT = 6;
