"use client";
// 가상 목록 — 행이 수백 개여도 화면에 보이는 만큼(+여유)만 그린다. 행 높이는 토큰(layout.row) 하나로 고정이다.
// 스크롤은 React 이벤트(onScroll)로만 듣고, 크기 감시(ResizeObserver)는 언마운트에서 끊는다 — 남는 리스너가 없다.
import { layout } from "@yunseo/design-tokens";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { vars } from "./poly";
import { scrollToReveal, windowRange } from "./virtual-window";

const OVERSCAN = 4;
const FALLBACK_VIEWPORT = layout.row * 8; // 첫 측정 전(서버 렌더)에 그릴 행 수

export function VirtualList({ count, active, label, renderRow }: { count: number; active?: number; label: string; renderRow: (index: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(FALLBACK_VIEWPORT);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setViewport(el.clientHeight || FALLBACK_VIEWPORT);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el && active !== undefined && active >= 0) el.scrollTop = scrollToReveal(active, el.scrollTop, el.clientHeight, layout.row);
  }, [active]);

  const [first, last] = windowRange({ scrollTop, viewport, count, row: layout.row, overscan: OVERSCAN });
  const rows: ReactNode[] = [];
  for (let i = first; i < last; i += 1) rows.push(renderRow(i));

  return (
    <div
      ref={ref}
      className="ui-vlist"
      role="listbox"
      aria-label={label}
      onScroll={(e) => {
        // 행 경계를 넘을 때만 상태가 바뀐다 — 픽셀마다 다시 그리지 않는다
        const next = Math.floor(e.currentTarget.scrollTop / layout.row) * layout.row;
        setScrollTop((prev) => (prev === next ? prev : next));
      }}
    >
      <div className="ui-vlist-body" style={vars({ "--n": count })}>
        <div className="ui-vlist-window" style={vars({ "--y": first })}>
          {rows}
        </div>
      </div>
    </div>
  );
}
