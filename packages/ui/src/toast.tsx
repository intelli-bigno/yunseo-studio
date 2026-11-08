"use client";
// 토스트 — 화면 아래 오른쪽에 잠깐 뜨는 알림. 요청이 실패했을 때 「다시 시도」 버튼을 달 수 있다.
// 클라이언트 전용이라 별도 입구("@yunseo/ui/toast"). ToastProvider 를 루트 레이아웃에 한 번 두고, 화면에서는 useToast() 로 부른다.
// Provider 밖에서 부르면 아무것도 하지 않는다(화면이 오류로 죽지 않게).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "./controls";
import { cx } from "./poly";
import { dismissToast, pushToast, toastMs, type ToastItem, type ToastTone } from "./toast-queue";

export interface ToastOptions {
  tone?: ToastTone;
  /** 누르면 실행하고 토스트를 닫는다 — 예: { label: "다시 시도", onAction: retry } */
  action?: { label: string; onAction: () => void };
  ms?: number;
}

export interface ToastApi {
  show(text: string, options?: ToastOptions): void;
  /** 실패 알림 — 붉은 줄 */
  error(text: string, options?: Omit<ToastOptions, "tone">): void;
  /** 완료 알림 */
  ok(text: string, options?: Omit<ToastOptions, "tone">): void;
}

const NOOP: ToastApi = { show: () => undefined, error: () => undefined, ok: () => undefined };
const ToastContext = createContext<ToastApi>(NOOP);

export const useToast = (): ToastApi => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.delete(id);
    setItems((cur) => dismissToast(cur, id));
  }, []);

  const show = useCallback(
    (text: string, options: ToastOptions = {}) => {
      const id = ++seq.current;
      const tone = options.tone ?? "accent";
      const ms = options.ms ?? toastMs(tone, options.action !== undefined);
      setItems((cur) => pushToast(cur, { id, text, tone, ms, ...(options.action ? { action: options.action } : {}) }));
      timers.current.set(id, setTimeout(() => dismiss(id), ms));
    },
    [dismiss],
  );

  useEffect(() => {
    const live = timers.current;
    return () => live.forEach(clearTimeout);
  }, []);

  const api = useMemo<ToastApi>(() => ({ show, error: (text, o) => show(text, { ...o, tone: "alert" }), ok: (text, o) => show(text, { ...o, tone: "accent" }) }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ui-toasts" role="region" aria-label="알림">
        {items.map((t) => (
          <div key={t.id} className={cx("ui-toast-item", `ui-toast-item-${t.tone}`)} role={t.tone === "alert" ? "alert" : "status"}>
            <span>{t.text}</span>
            <span className="ui-toast-actions">
              {t.action && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    dismiss(t.id);
                    t.action?.onAction();
                  }}
                >
                  {t.action.label}
                </Button>
              )}
              <Button variant="ghost" aria-label="닫기" onClick={() => dismiss(t.id)}>
                ×
              </Button>
            </span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
