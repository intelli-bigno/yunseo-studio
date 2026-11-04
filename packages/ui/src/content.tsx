// 글자·카드·지표·배지·진행 표시·빈 상태.
import type { ElementType, ReactNode } from "react";
import type { TypeStep } from "@yunseo/design-tokens";
import { cx, vars, type Poly, type Tone } from "./poly";

/** 글자 — 크기는 토큰 6단계(label·body·title·heading·metric·hero)만. */
export function Text<E extends ElementType = "span">({
  as,
  size = "body",
  tone = "default",
  mono = false,
  truncate = false,
  block = false,
  children,
  ...rest
}: Poly<E, { size?: TypeStep; tone?: Tone; mono?: boolean; truncate?: boolean; block?: boolean; children?: ReactNode }>) {
  const C = (as ?? "span") as ElementType;
  return (
    <C className={cx(`ui-t-${size}`, tone !== "default" && `ui-tone-${tone}`, mono && "ui-mono", truncate && "ui-truncate", block && "ui-block")} {...rest}>
      {children}
    </C>
  );
}

export function Heading({ children, level = 1 }: { children: ReactNode; level?: 1 | 2 }) {
  const C = level === 1 ? "h1" : "h2";
  return <C className={cx(level === 1 ? "ui-t-heading" : "ui-t-title", "ui-heading")}>{children}</C>;
}

/** 화면 머리 — 제목 하나(크게) + 오른쪽 행동. 설명 문구는 두지 않는다. */
export function PageHeader({ title, meta, actions }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="ui-page-head">
      <div className="ui-page-head-text">
        {meta && <div className="ui-t-label ui-tone-mute">{meta}</div>}
        <h1 className="ui-t-heading ui-heading">{title}</h1>
      </div>
      {actions && <div className="ui-page-head-actions">{actions}</div>}
    </div>
  );
}

export function Card<E extends ElementType = "section">({
  as,
  tone = "default",
  image,
  children,
  ...rest
}: Poly<E, { tone?: "default" | "feature" | "inset"; image?: string | undefined; children: ReactNode }>) {
  const C = (as ?? "section") as ElementType;
  return (
    <C className={cx("ui-card", `ui-card-${tone}`, image && "ui-card-image")} style={image ? vars({ "--card-image": `url(${image})` }) : undefined} {...rest}>
      {children}
    </C>
  );
}

export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="ui-card-head">
      <h2 className="ui-t-title ui-heading">{title}</h2>
      {action && <span className="ui-card-action">{action}</span>}
    </div>
  );
}

/** 카드 없이 머리선만 있는 구획 */
export function Section({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="ui-section">
      <div className="ui-section-head">
        <h2 className="ui-t-title ui-heading">{title}</h2>
        {action && <span className="ui-card-action">{action}</span>}
      </div>
      {children}
    </section>
  );
}

/** 핵심 숫자 — 크게. 라벨은 한두 단어. */
export function Metric({ value, unit, label, tone = "default", size = "metric" }: { value: ReactNode; unit?: ReactNode; label: string; tone?: Tone; size?: "metric" | "hero" }) {
  return (
    <div className="ui-metric">
      <div className={cx(`ui-t-${size}`, tone !== "default" && `ui-tone-${tone}`)}>
        {value}
        {unit != null && <span className="ui-metric-unit">{unit}</span>}
      </div>
      <div className="ui-t-label ui-tone-mute">{label}</div>
    </div>
  );
}

export function MetricRow({ children }: { children: ReactNode }) {
  return <div className="ui-metric-row">{children}</div>;
}

export type BadgeTone = "neutral" | "solid" | "accent" | "alert" | "brass";
export function Badge({ tone = "neutral", children, title }: { tone?: BadgeTone; children: ReactNode; title?: string }) {
  return (
    <span className={cx("ui-badge", `ui-badge-${tone}`)} title={title}>
      {children}
    </span>
  );
}

export type StepState = "done" | "wait" | "block" | "todo";
/** 게이트 같은 단계 묶음 — 상태는 모양(✓·●·×)과 색으로 함께 보인다 */
export function Steps({ items, size = "sm", label }: { items: { key: string; label: string; state: StepState; title?: string }[]; size?: "sm" | "md"; label: string }) {
  return (
    <span className={cx("ui-steps", size === "md" && "ui-steps-md")} aria-label={label}>
      {items.map((s) => (
        <span key={s.key} className={cx("ui-step", `ui-step-${s.state}`)} title={s.title}>
          {s.label}
        </span>
      ))}
    </span>
  );
}

/** 파이프라인 진행 막대(선정→발행) */
export function Progress({ items }: { items: { label: string; state: "done" | "now" | "todo" }[] }) {
  return (
    <div className="ui-progress" style={vars({ "--n": items.length })}>
      {items.map((s) => (
        <div key={s.label} className={cx("ui-progress-step", `is-${s.state}`)}>
          <span className="ui-progress-bar" />
          <span className="ui-t-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ image, title, action }: { image?: string; title: ReactNode; action?: ReactNode }) {
  return (
    <div className="ui-empty">
      {image && <img className="ui-empty-image" src={image} alt="" loading="lazy" />}
      <div className="ui-t-title">{title}</div>
      {action}
    </div>
  );
}

export function CheckList({ children }: { children: ReactNode }) {
  return <ul className="ui-checklist">{children}</ul>;
}

export function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className={cx("ui-check", ok ? "is-ok" : "is-bad")}>
      <span className="ui-check-mark" aria-hidden>
        {ok ? "✓" : "×"}
      </span>
      <span>{children}</span>
    </li>
  );
}

/** 구분 표시 기호(■ ▲ ◆ ○) */
export function Glyph({ children, title }: { children: string; title?: string }) {
  return (
    <span className="ui-glyph" title={title}>
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: string }) {
  return <kbd className="ui-kbd">{children}</kbd>;
}

export function KeyHint({ keys, label }: { keys: string[]; label?: string }) {
  return (
    <span className="ui-keyhint">
      {keys.map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
      {label && <span className="ui-t-label ui-tone-mute">{label}</span>}
    </span>
  );
}

export function Toast({ children }: { children: ReactNode }) {
  return (
    <div className="ui-toast" role="status">
      {children}
    </div>
  );
}
