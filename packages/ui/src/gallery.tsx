// 갤러리 카드 — 썸네일 그리드 한 칸. 그림 자리(frame)는 장 하나(MediaSlide)이거나 넘겨 보는 캐러셀("@yunseo/ui/carousel")이다.
// 캐러셀은 클라이언트 전용이라 여기서 import 하지 않는다 — 화면이 골라 frame 으로 꽂는다.
import type { ElementType, ReactNode } from "react";
import { cx, type Poly } from "./poly";

/** 갤러리 그리드 — 칸 폭은 토큰(--l-tile), 열 수는 화면 폭이 정한다(폰 2열 → 와이드 여러 열) */
export function MediaGrid({ children }: { children: ReactNode }) {
  return <div className="ui-mgrid">{children}</div>;
}

/** 그림 한 장 — 상세로 가는 링크. src 가 없으면 자리 표시(children)를 그린다(아직 렌더 전인 편) */
export function MediaSlide<E extends ElementType = "a">({
  as,
  src,
  alt = "",
  children,
  ...rest
}: Poly<E, { src?: string | undefined; alt?: string | undefined; children?: ReactNode }>) {
  const C = (as ?? "a") as ElementType;
  return (
    <C className={cx("ui-mslide", !src && "is-blank")} tabIndex={-1} {...rest}>
      {src ? <img className="ui-mslide-img" src={src} alt={alt} loading="lazy" decoding="async" draggable={false} /> : children}
    </C>
  );
}

/** 카드 한 칸 — 위에 그림 자리, 아래에 제목(상세 링크)·보조 줄·덧붙임 */
export function MediaCard<E extends ElementType = "a">({
  as,
  frame,
  title,
  meta,
  aspect = "portrait",
  children,
  ...rest
}: Poly<E, { frame: ReactNode; title: ReactNode; meta?: ReactNode; aspect?: "portrait" | "square" | "story"; children?: ReactNode }>) {
  const C = (as ?? "a") as ElementType;
  return (
    <article className="ui-mcard">
      <div className={cx("ui-mcard-frame", `is-${aspect}`)}>{frame}</div>
      <div className="ui-mcard-body">
        <C className="ui-t-body ui-mcard-title" {...rest}>
          {title}
        </C>
        {meta && <span className="ui-t-label ui-tone-mute ui-truncate">{meta}</span>}
        {children}
      </div>
    </article>
  );
}
