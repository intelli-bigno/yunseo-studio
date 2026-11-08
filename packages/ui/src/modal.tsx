"use client";
// 모달 — 대화상자(Dialog)와 크게 보기(Lightbox)가 같은 동작을 쓴다: Esc 로 닫기 · 열리면 안으로 포커스 · Tab 이 밖으로 새지 않기 · 닫히면 열기 전 자리로 포커스 복귀.
// 바깥 클릭·모양은 각 부품이 따로 둔다(모양이 다르다).
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useModal<E extends HTMLElement>(onClose: () => void) {
  const ref = useRef<E>(null);
  // 연 쪽(포커스 가 있던 요소)은 그리기 전에 잡는다 — 안쪽 autoFocus 가 먼저 포커스를 가져가므로 effect 에서는 이미 늦다
  const [opener] = useState(() => (typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null));
  useEffect(() => {
    const node = ref.current;
    // 이미 안에 포커스가 있으면(autoFocus 한 입력·닫기 버튼) 뺏지 않는다
    if (node && !node.contains(document.activeElement)) (node.querySelector<HTMLElement>(FOCUSABLE) ?? node).focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [opener]);
  const onKeyDown = (e: KeyboardEvent<E>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return e.preventDefault();
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return { ref, onKeyDown };
}

export function Dialog({ onClose, label, children }: { onClose: () => void; label: string; children: ReactNode }) {
  const modal = useModal<HTMLDivElement>(onClose);
  return (
    <div className="ui-overlay" onMouseDown={onClose}>
      <div className="ui-dialog" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onMouseDown={(e) => e.stopPropagation()} {...modal}>
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

/** 크게 보기 — 화면 가운데에 그림 하나. 바깥을 누르거나 Esc 로 닫는다(닫기 버튼에 포커스가 가 있다) */
export function Lightbox({ src, label, meta, actions, onClose }: { src: string; label: string; meta?: ReactNode; actions: ReactNode; onClose: () => void }) {
  const modal = useModal<HTMLDivElement>(onClose);
  return (
    <div className="ui-lightbox" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onClick={(e) => e.target === e.currentTarget && onClose()} {...modal}>
      <div className="ui-lightbox-panel">
        <img className="ui-lightbox-img" src={src} alt={label} draggable={false} />
        <div className="ui-lightbox-foot">
          <div className="ui-lightbox-text">
            <span className="ui-truncate">{label}</span>
            {meta && <span className="ui-t-label ui-tone-mute ui-truncate">{meta}</span>}
          </div>
          <div className="ui-lightbox-actions">{actions}</div>
        </div>
      </div>
    </div>
  );
}
