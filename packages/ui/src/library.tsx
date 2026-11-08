// 보관함 화면 조각 — 레퍼런스 그리드·쇼츠 플레이어·앱 아이콘·자리 표시(스켈레톤).
import type { ElementType, ReactNode } from "react";
import { cx, type Poly } from "./poly";

/** 썸네일 그리드 — 칸 폭은 토큰(--l-tile) 하나, 줄 간격은 그리드 거터. masonry 는 칸마다 그림 비율대로 높이가 달라 쌓인다(자르지 않음) */
export function TileGrid({ children, wide = false, masonry = false }: { children: ReactNode; wide?: boolean; masonry?: boolean }) {
  return <div className={cx("ui-tiles", wide && "is-wide", masonry && "is-masonry")}>{children}</div>;
}

/** 칸 틀 — portrait·square·story 는 고정 비율로 채워 자르고, natural 은 그림 비율 그대로, fit 은 화면 안에 통째로 들어오게 맞춘다 */
export type TileAspect = "portrait" | "square" | "story" | "natural" | "fit";

/** 썸네일 한 칸 — 그림 + 제목 + 보조 한 줄. srcSet 은 앱이 만든 크기별 파일(없으면 src 하나), priority 는 첫 화면(LCP) 칸만 */
export function Tile<E extends ElementType = "a">({
  as,
  src,
  srcSet,
  priority = false,
  alt,
  title,
  meta,
  aspect = "portrait",
  current = false,
  children,
  ...rest
}: Poly<E, { src: string; srcSet?: string | undefined; priority?: boolean | undefined; alt: string; title: ReactNode; meta?: ReactNode; aspect?: TileAspect; current?: boolean; children?: ReactNode }>) {
  const C = (as ?? "a") as ElementType;
  return (
    <C className={cx("ui-tile", current && "is-current")} {...rest}>
      <span className={cx("ui-tile-frame", `is-${aspect}`)}>
        <img className="ui-tile-img" src={src} srcSet={srcSet} alt={alt} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" referrerPolicy="no-referrer" />
      </span>
      <span className="ui-tile-body">
        <span className="ui-t-body ui-tile-title">{title}</span>
        {meta && <span className="ui-t-label ui-tone-mute ui-truncate">{meta}</span>}
        {children}
      </span>
    </C>
  );
}

/** 9:16 세로 영상 — 브라우저 기본 컨트롤, 처음엔 메타데이터만 받는다 */
export function StoryPlayer({ src, poster, label }: { src: string; poster?: string | undefined; label: string }) {
  return (
    <span className="ui-story">
      <video className="ui-story-video" src={src} poster={poster} controls preload="metadata" playsInline aria-label={label} />
    </span>
  );
}

/** 앱 아이콘 + 이름 — 아이콘은 설치된 앱에서 뽑은 그림(없으면 첫 글자) */
export function AppIcon({ src, name, size = "md" }: { src?: string | undefined; name: string; size?: "sm" | "md" }) {
  return (
    <span className={cx("ui-appicon", `is-${size}`)} title={name}>
      {src ? <img className="ui-appicon-img" src={src} alt="" loading="lazy" decoding="async" /> : <span className="ui-appicon-fallback">{name.slice(0, 1)}</span>}
    </span>
  );
}

export function AppGrid({ children }: { children: ReactNode }) {
  return <div className="ui-appgrid">{children}</div>;
}

export function AppCell({ src, name, meta }: { src?: string | undefined; name: string; meta?: ReactNode }) {
  return (
    <div className="ui-appcell">
      <AppIcon src={src} name={name} />
      <span className="ui-appcell-text">
        <span className="ui-t-body ui-truncate">{name}</span>
        {meta && <span className="ui-t-label ui-tone-mute ui-truncate">{meta}</span>}
      </span>
    </div>
  );
}

export type Platform = "instagram" | "youtube";
const PLATFORM_NAME: Record<Platform, string> = { instagram: "Instagram", youtube: "YouTube" };

/** 플랫폼 공식 글리프(Instagram 카메라·YouTube 재생 버튼) — 브랜드 색 그대로 */
export function PlatformIcon({ platform, label = false }: { platform: Platform; label?: boolean }) {
  return (
    <span className="ui-platform" title={PLATFORM_NAME[platform]}>
      <svg className="ui-platform-svg" viewBox="0 0 24 24" aria-hidden>
        {platform === "instagram" ? (
          <>
            <defs>
              <radialGradient id="ui-ig" cx="0.3" cy="1.07" r="1.3">
                <stop offset="0" stopColor="#FFDD55" />
                <stop offset="0.1" stopColor="#FFDD55" />
                <stop offset="0.5" stopColor="#FF543E" />
                <stop offset="1" stopColor="#C837AB" />
              </radialGradient>
            </defs>
            <rect x="1" y="1" width="22" height="22" rx="6" fill="url(#ui-ig)" />
            <rect x="5.5" y="5.5" width="13" height="13" rx="4" fill="none" stroke="#fff" strokeWidth="1.8" />
            <circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" strokeWidth="1.8" />
            <circle cx="16.2" cy="7.8" r="1" fill="#fff" />
          </>
        ) : (
          <>
            <rect x="1" y="4.5" width="22" height="15" rx="4.2" fill="#FF0000" />
            <path d="M10 8.6v6.8l5.8-3.4z" fill="#fff" />
          </>
        )}
      </svg>
      {label && <span className="ui-t-label">{PLATFORM_NAME[platform]}</span>}
    </span>
  );
}

/** 불러오는 동안의 자리 — 실제 화면과 같은 머리·칸 배치(밀림 없음) */
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <main className="ui-page" aria-busy="true">
      <div className="ui-page-head">
        <span className="ui-skel ui-skel-title" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="ui-skel ui-skel-block" />
      ))}
    </main>
  );
}
