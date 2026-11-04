// 이미지 — 화면은 주소 문자열이 아니라 Media(크기·srcset 이 정해진 값)를 넘긴다.
// 최적화(포맷 변환·크기별 파일)는 앱이 만들어 주는 값이고, ui 는 next 를 모른 채 그대로 그린다.
export interface Media {
  src: string;
  srcSet?: string | undefined;
  sizes?: string | undefined;
  /** 원본이 아니라 그릴 크기의 비율 근거 — 자리를 미리 잡아 화면이 밀리지 않게 한다(CLS) */
  width: number;
  height: number;
  /** 첫 화면(LCP) 이미지면 true: 즉시·높은 우선순위로 받는다. 아니면 화면에 가까워질 때 받는다 */
  priority?: boolean | undefined;
}

export function Img({ media, alt = "", className }: { media: Media; alt?: string; className: string }) {
  return (
    <img
      className={className}
      src={media.src}
      srcSet={media.srcSet}
      sizes={media.sizes}
      width={media.width}
      height={media.height}
      alt={alt}
      decoding="async"
      loading={media.priority ? "eager" : "lazy"}
      fetchPriority={media.priority ? "high" : "auto"}
    />
  );
}
