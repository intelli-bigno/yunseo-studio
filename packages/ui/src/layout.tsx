// 레이아웃 — 셸·페이지·정렬(Stack)·12단 그리드·본문+레일.
import type { ElementType, ReactNode } from "react";
import { cx, type Gap, type Poly } from "./poly";

export function Shell({ sidebar, top, children }: { sidebar: ReactNode; top: ReactNode; children: ReactNode }) {
  return (
    <div className="ui-shell">
      {sidebar}
      <div className="ui-main">
        {top}
        {children}
      </div>
    </div>
  );
}

export function Sidebar({ brand, children, foot }: { brand: ReactNode; children: ReactNode; foot?: ReactNode }) {
  return (
    <aside className="ui-side">
      {brand}
      {children}
      {foot && <div className="ui-side-foot">{foot}</div>}
    </aside>
  );
}

export function Brand({ mark, logo, name }: { mark?: string; logo?: string; name: string }) {
  return (
    <div className="ui-brand">
      {logo ? (
        <img className="ui-crest ui-crest-img" src={logo} alt="" aria-hidden />
      ) : (
        <span className="ui-crest" aria-hidden>
          {mark}
        </span>
      )}
      <span className="ui-brand-name">{name}</span>
    </div>
  );
}

export function NavList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav className="ui-nav" aria-label={label}>
      {children}
    </nav>
  );
}

export function NavItem<E extends ElementType = "a">({
  as,
  current = false,
  disabled = false,
  count,
  alert = false,
  children,
  ...rest
}: Poly<E, { current?: boolean; disabled?: boolean; count?: number | undefined; alert?: boolean; children: ReactNode }>) {
  const C = (disabled ? "span" : (as ?? "a")) as ElementType;
  return (
    <C className={cx("ui-nav-item", disabled && "is-disabled")} aria-current={current ? "page" : undefined} aria-disabled={disabled || undefined} {...(disabled ? {} : rest)}>
      <span className="ui-nav-dot" aria-hidden />
      <span className="ui-nav-label">{children}</span>
      {count ? <span className={cx("ui-nav-count", alert && "is-alert")}>{count}</span> : null}
    </C>
  );
}

export function TopBar({ children }: { children: ReactNode }) {
  return <header className="ui-top">{children}</header>;
}

/** fit: 화면 높이(헤더 아래 남은 100dvh)에 고정한다 — 편집 화면처럼 스크롤 없이 한 화면에 조작해야 할 때. 안쪽 칸(패널)이 따로 스크롤한다 */
export function Page({ children, fit = false }: { children: ReactNode; fit?: boolean }) {
  return <main className={cx("ui-page", fit && "is-fit")}>{children}</main>;
}

type Align = "start" | "center" | "end" | "baseline" | "stretch";
type Justify = "start" | "center" | "end" | "between";

export function Stack<E extends ElementType = "div">({
  as,
  direction = "column",
  gap = 3,
  align,
  justify,
  wrap = false,
  grow = false,
  children,
  ...rest
}: Poly<E, { direction?: "row" | "column"; gap?: Gap; align?: Align; justify?: Justify; wrap?: boolean; grow?: boolean; children?: ReactNode }>) {
  const C = (as ?? "div") as ElementType;
  return (
    <C
      className={cx("ui-stack", direction === "row" && "ui-row", `ui-gap-${gap}`, align && `ui-align-${align}`, justify && `ui-justify-${justify}`, wrap && "ui-wrap", grow && "ui-grow")}
      {...rest}
    >
      {children}
    </C>
  );
}

/** 12단 그리드. 칸 폭은 Cell span 으로만 나눈다(좁은 화면에서 전부 12단). */
export function Grid({ children }: { children: ReactNode }) {
  return <div className="ui-grid">{children}</div>;
}

export type Span = 3 | 4 | 5 | 6 | 7 | 8 | 12;
export function Cell({ span, rows = 1, children }: { span: Span; rows?: 1 | 2; children: ReactNode }) {
  return <div className={cx("ui-cell", `ui-span-${span}`, rows === 2 && "ui-rows-2")}>{children}</div>;
}

/** 본문 + 오른쪽 레일(좁은 화면에서 아래로) */
export function Split({ children, rail }: { children: ReactNode; rail: ReactNode }) {
  return (
    <div className="ui-split">
      <div className="ui-split-main">{children}</div>
      <aside className="ui-split-rail">{rail}</aside>
    </div>
  );
}

export function Divider() {
  return <hr className="ui-divider" />;
}

/** 문서 뼈대 — 서체 변수 클래스(next/font)를 html 에 붙인다 */
export function Html({ fonts, head, children }: { fonts: string[]; head?: ReactNode; children: ReactNode }) {
  return (
    <html lang="ko" className={fonts.join(" ")}>
      <head>{head}</head>
      <body>{children}</body>
    </html>
  );
}
