// 버튼·탭·세그먼트·표·목록·입력·대화상자·캘린더·카드 미리보기.
import type { ComponentPropsWithoutRef, ElementType, MouseEventHandler, ReactNode } from "react";
import { Img, type Media } from "./media";
import { cx, vars, type Poly } from "./poly";

type NoStyle<E extends ElementType> = Omit<ComponentPropsWithoutRef<E>, "className" | "style">;

export function Button<E extends ElementType = "button">({
  as,
  variant = "secondary",
  block = false,
  children,
  ...rest
}: Poly<E, { variant?: "primary" | "secondary" | "ghost"; block?: boolean; children: ReactNode }>) {
  const C = (as ?? "button") as ElementType;
  return (
    <C className={cx("ui-btn", `ui-btn-${variant}`, block && "ui-btn-block")} {...rest}>
      {children}
    </C>
  );
}

export function IconButton({ label, children, ...rest }: NoStyle<"button"> & { label: string; children: ReactNode }) {
  return (
    <button className="ui-icon-btn" aria-label={label} {...rest}>
      {children}
    </button>
  );
}

/** 링크 텍스트(→ 붙는 보조 이동) */
export function TextLink<E extends ElementType = "a">({ as, children, ...rest }: Poly<E, { children: ReactNode }>) {
  const C = (as ?? "a") as ElementType;
  return (
    <C className="ui-link" {...rest}>
      {children}
    </C>
  );
}

export function Tabs({ children, prev, next }: { children: ReactNode; prev?: string; next?: string }) {
  return (
    <nav className="ui-tabs" data-tabs data-prev={prev} data-next={next}>
      {children}
    </nav>
  );
}

export function Tab<E extends ElementType = "a">({ as, current = false, children, ...rest }: Poly<E, { current?: boolean; children: ReactNode }>) {
  const C = (as ?? "a") as ElementType;
  return (
    <C className="ui-tab" aria-current={current ? "page" : undefined} {...rest}>
      {children}
    </C>
  );
}

export function Segmented({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="ui-seg" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function SegmentedItem<E extends ElementType = "button">({ as, current = false, children, ...rest }: Poly<E, { current?: boolean; children: ReactNode }>) {
  const C = (as ?? "button") as ElementType;
  return (
    <C className="ui-seg-item" aria-current={current ? "page" : undefined} {...rest}>
      {children}
    </C>
  );
}

/** 표 단 폭 — 임의 px 대신 이름으로 고른다 */
export type Col = "xs" | "sm" | "md" | "lg" | "fill" | "auto";
const COL: Record<Col, string> = { xs: "var(--sp-7)", sm: "calc(var(--sp-8) + var(--sp-3))", md: "calc(var(--sp-8) + var(--sp-6))", lg: "calc(var(--sp-8) * 2 + var(--sp-6))", fill: "minmax(0, 1fr)", auto: "auto" };

export function Table({ columns, children }: { columns: Col[]; children: ReactNode }) {
  return (
    <div className="ui-table" role="table" style={vars({ "--cols": columns.map((c) => COL[c]).join(" ") })}>
      {children}
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <div className="ui-tr ui-thead" role="row">
      {children}
    </div>
  );
}

export function TableRow<E extends ElementType = "div">({ as, current = false, children, ...rest }: Poly<E, { current?: boolean; children: ReactNode }>) {
  const C = (as ?? "div") as ElementType;
  return (
    <C className={cx("ui-tr", as && "is-link", current && "is-current")} role="row" {...rest}>
      {children}
    </C>
  );
}

/** 목록 한 줄 — 앞 표시 · 제목(+한 줄 메타) · 뒤 표시 */
export function ListItem<E extends ElementType = "div">({
  as,
  leading,
  title,
  meta,
  trailing,
  current = false,
  children,
  ...rest
}: Poly<E, { leading?: ReactNode; title: ReactNode; meta?: ReactNode; trailing?: ReactNode; current?: boolean; children?: ReactNode }>) {
  const C = (as ?? "div") as ElementType;
  return (
    <C className={cx("ui-li", as && "is-link", current && "is-current")} aria-current={current ? "true" : undefined} {...rest}>
      {leading != null && <span className="ui-li-lead">{leading}</span>}
      <span className="ui-li-body">
        <span className="ui-li-title">{title}</span>
        {meta != null && <span className="ui-li-meta">{meta}</span>}
        {children}
      </span>
      {trailing != null && <span className="ui-li-trail">{trailing}</span>}
    </C>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <div className="ui-list">{children}</div>;
}

/** 날짜 칩(목록 앞) — 큰 숫자 + 요일 */
export function DateTile({ day, sub }: { day: string; sub: string }) {
  return (
    <span className="ui-datetile">
      <span className="ui-t-title">{day}</span>
      <span className="ui-t-label ui-tone-mute">{sub}</span>
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="ui-field">
      <span className="ui-t-label ui-tone-mute">{label}</span>
      {children}
    </label>
  );
}

export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="ui-field-row">{children}</div>;
}

export function Input({ invalid = false, mono = false, ...rest }: NoStyle<"input"> & { invalid?: boolean; mono?: boolean }) {
  return <input className={cx("ui-input", invalid && "is-invalid", mono && "ui-mono")} {...rest} />;
}

export function Textarea({ invalid = false, tall = false, ...rest }: NoStyle<"textarea"> & { invalid?: boolean; tall?: boolean }) {
  return <textarea className={cx("ui-input", "ui-textarea", tall && "is-tall", invalid && "is-invalid")} {...rest} />;
}

export function Select(props: NoStyle<"select">) {
  return <select className="ui-input ui-select" {...props} />;
}

export function Checkbox({ label, lead, ...rest }: NoStyle<"input"> & { label: ReactNode; lead?: ReactNode }) {
  return (
    <label className={cx("ui-checkbox", rest.disabled && "is-disabled")}>
      <input type="checkbox" {...rest} />
      {lead != null && <span className="ui-t-label ui-tone-mute ui-mono">{lead}</span>}
      <span>{label}</span>
    </label>
  );
}

export function Notice({ tone = "alert", children }: { tone?: "alert" | "accent"; children: ReactNode }) {
  return <div className={cx("ui-notice", `ui-notice-${tone}`)}>{children}</div>;
}

/* ── 대화상자 · 빠른 이동 ── */
export function Dialog({ onClose, label, children }: { onClose: () => void; label: string; children: ReactNode }) {
  return (
    <div className="ui-overlay" onMouseDown={onClose}>
      <div className="ui-dialog" role="dialog" aria-modal="true" aria-label={label} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ title, aside }: { title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="ui-dialog-head">
      <span className="ui-t-title">{title}</span>
      {aside}
    </div>
  );
}

export function DialogBody({ children }: { children: ReactNode }) {
  return <div className="ui-dialog-body">{children}</div>;
}

export function CommandInput(props: NoStyle<"input">) {
  return <input className="ui-command-input" {...props} />;
}

export function CommandList({ children }: { children: ReactNode }) {
  return (
    <div className="ui-command-list" role="listbox">
      {children}
    </div>
  );
}

export function CommandItem({ selected, tag, hint, children, onClick, onMouseEnter, href }: { selected: boolean; tag: string; hint?: string | undefined; children: ReactNode; href: string; onClick: MouseEventHandler<HTMLAnchorElement>; onMouseEnter: () => void }) {
  return (
    <a className="ui-command-item" href={href} role="option" aria-selected={selected} onClick={onClick} onMouseEnter={onMouseEnter}>
      <span className="ui-t-label ui-tone-mute ui-mono">{tag}</span>
      <span className="ui-truncate">{children}</span>
      <span className="ui-t-label ui-tone-mute">{hint}</span>
    </a>
  );
}

/* ── 캘린더 ── */
export function Calendar({ compact = false, children }: { compact?: boolean; children: ReactNode }) {
  return <div className={cx("ui-cal", compact && "is-compact")}>{children}</div>;
}

export function CalendarDay({ num, dow, state = "default", children }: { num: number; dow: string; state?: "today" | "past" | "default"; children?: ReactNode }) {
  return (
    <div className={cx("ui-cal-day", state !== "default" && `is-${state}`)}>
      <div className="ui-cal-head">
        <span className="ui-t-heading">{num}</span>
        <span className="ui-t-label ui-tone-mute">{dow}</span>
      </div>
      {children}
    </div>
  );
}

export function Slot<E extends ElementType = "a">({ as, time, gate, title, solid = false, children, ...rest }: Poly<E, { time: string; gate: string; title?: ReactNode; solid?: boolean; children?: ReactNode }>) {
  const C = (as ?? "a") as ElementType;
  return (
    <C className={cx("ui-slot", solid && "is-solid")} {...rest}>
      <span className="ui-slot-head ui-t-label ui-mono">
        <span>{time}</span>
        <span>{gate}</span>
      </span>
      {title != null && <span className="ui-slot-title">{title}</span>}
      {children}
    </C>
  );
}

export function EmptySlot({ children }: { children: ReactNode }) {
  return <span className="ui-slot is-empty ui-t-label">{children}</span>;
}

/* ── 카드 미리보기 ── */
export function Paper({ children }: { children: ReactNode }) {
  return <div className="ui-paper">{children}</div>;
}

export function CardStage({ children }: { children: ReactNode }) {
  return <div className="ui-card-stage">{children}</div>;
}

export function CardFrame({ media, alt, aspect = "4 / 5" }: { media: Media; alt: string; aspect?: string }) {
  return (
    <div className="ui-card-frame" style={{ aspectRatio: aspect }}>
      <Img media={media} alt={alt} className="ui-card-frame-img" />
    </div>
  );
}

export function Thumbs({ children }: { children: ReactNode }) {
  return <div className="ui-thumbs">{children}</div>;
}

export function Thumb({ media, current, label, onClick }: { media: Media; current: boolean; label: string; onClick: () => void }) {
  return (
    <button className="ui-thumb" aria-current={current} aria-label={label} onClick={onClick}>
      <Img media={media} className="ui-thumb-img" />
    </button>
  );
}
