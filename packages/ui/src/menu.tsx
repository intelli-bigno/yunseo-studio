"use client";
// 메뉴·팝오버 — 단추를 누르면 아래로 펼쳐지고, 바깥을 누르거나 Esc 를 누르면 닫힌다(닫으면 단추로 포커스가 돌아간다).
// Menu = 줄마다 행동(↑↓·Home·End 로 이동, 고르면 닫힘). Popover = 안내 같은 자유 내용(고른다고 닫히지 않음).
// 클라이언트 전용이라 별도 입구("@yunseo/ui/menu") — 서버 화면이 쓰는 barrel 에 클라이언트 경계가 끼지 않게 한다.
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { menuStep } from "./menu-math";
import { cx } from "./poly";

const CloseCtx = createContext<() => void>(() => undefined);

interface PopupProps {
  /** 보조기기 이름(아이콘 단추일 때 단추 이름도 이것) */
  label: string;
  /** 단추 안 글자·아이콘 */
  trigger: ReactNode;
  children: ReactNode;
  /** 펼친 면의 가로 기준 — start = 단추 왼쪽 맞춤, end = 오른쪽 맞춤 */
  align?: "start" | "end";
  variant?: "primary" | "secondary" | "ghost" | "icon";
  disabled?: boolean;
}

function Popup({ kind, label, trigger, children, align = "start", variant = "secondary", disabled = false }: PopupProps & { kind: "menu" | "panel" }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) root.current?.querySelector<HTMLElement>(".ui-menu-trigger")?.focus();
  }, []);
  // 단추가 꺼지면(저장 중 등) 열린 채로 두지 않는다
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation(); // 편집기 단축키(Esc 선택 해제)로 번지지 않게
      close(true);
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open, close]);
  // 메뉴는 열리면 첫 칸에 포커스(키보드로 바로 고른다)
  useEffect(() => {
    if (open && kind === "menu") panel.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
  }, [open, kind]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (kind !== "menu") return;
    if (e.key === "Tab") return close();
    const items = [...(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
    const next = menuStep(items.indexOf(document.activeElement as HTMLElement), items.length, e.key);
    if (next === null) return;
    e.preventDefault();
    items[next]?.focus();
  };

  return (
    <div ref={root} className={cx("ui-menu", align === "end" && "is-end")}>
      <button
        type="button"
        className={cx(variant === "icon" ? "ui-icon-btn" : cx("ui-btn", `ui-btn-${variant}`), "ui-menu-trigger")}
        aria-label={variant === "icon" ? label : undefined}
        title={variant === "icon" ? label : undefined}
        aria-haspopup={kind === "menu" ? "menu" : "dialog"}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
        {variant !== "icon" && kind === "menu" && <span aria-hidden>▾</span>}
      </button>
      {open && (
        <div ref={panel} id={id} className={cx("ui-menu-panel", kind === "panel" && "is-panel")} role={kind === "menu" ? "menu" : "dialog"} aria-label={label} onKeyDown={onKeyDown}>
          <CloseCtx.Provider value={close}>{children}</CloseCtx.Provider>
        </div>
      )}
    </div>
  );
}

export function Menu(props: PopupProps) {
  return <Popup kind="menu" {...props} />;
}

export function Popover(props: PopupProps) {
  return <Popup kind="panel" {...props} />;
}

/** 메뉴 한 줄 — 고르면 메뉴가 닫히고 onSelect 가 불린다. current = 지금 쓰는 것, tone alert = 되돌리기 어려운 행동 */
export function MenuItem({ onSelect, disabled = false, current = false, tone, children }: { onSelect: () => void; disabled?: boolean; current?: boolean; tone?: "alert"; children: ReactNode }) {
  const close = useContext(CloseCtx);
  return (
    <button
      type="button"
      role="menuitem"
      className={cx("ui-menu-item", current && "is-current", tone === "alert" && "is-alert")}
      aria-current={current ? "true" : undefined}
      disabled={disabled}
      onClick={() => {
        close();
        onSelect();
      }}
    >
      {children}
    </button>
  );
}

/** 메뉴 안 소제목(고를 수 없다) */
export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="ui-menu-label ui-t-label ui-tone-mute" role="presentation">
      {children}
    </div>
  );
}

export function MenuSep() {
  return <hr className="ui-menu-sep" />;
}
