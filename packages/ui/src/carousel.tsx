"use client";
// 캐러셀 — 카드 안에서 좌우로 넘겨 본다. 스와이프·트랙패드는 브라우저 스크롤 스냅이 맡고(JS 없이 동작),
// 이 컴포넌트는 화살표·점·방향키와 「몇 번째인가」 표시만 더한다. 장(children)은 서버에서 그려 넘긴다 — 링크 컴포넌트를 props 로 건널 수 없어서다.
// 클라이언트 전용이라 별도 입구("@yunseo/ui/carousel") — 서버 화면이 쓰는 barrel 에 클라이언트 경계가 끼지 않게 한다.
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { DOT_MAX, keyDirection, showsDots, slideIndex, stepIndex } from "./carousel-math";

function Chevron({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg className="ui-car-chevron" viewBox="0 0 24 24" aria-hidden>
      <path d={dir === "prev" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Carousel({ count, label, children }: { count: number; label: string; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const goTo = (i: number) => {
    const el = track.current;
    if (!el) return;
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: i * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
  };
  const step = (dir: -1 | 1) => goTo(stepIndex(index, dir, count));
  const onScroll = () => {
    const el = track.current;
    if (el) setIndex(slideIndex(el.scrollLeft, el.clientWidth, count));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = keyDirection(e.key);
    if (dir === null) return;
    e.preventDefault();
    step(dir);
  };

  return (
    <div className="ui-car" role="group" aria-roledescription="carousel" aria-label={label}>
      <div ref={track} className="ui-car-track" tabIndex={0} onScroll={onScroll} onKeyDown={onKeyDown} aria-label={`${label} ${index + 1} / ${count}`}>
        {children}
      </div>
      {index > 0 && (
        <button type="button" className="ui-car-arrow is-prev" aria-label="이전 카드" onClick={() => step(-1)}>
          <Chevron dir="prev" />
        </button>
      )}
      {index < count - 1 && (
        <button type="button" className="ui-car-arrow is-next" aria-label="다음 카드" onClick={() => step(1)}>
          <Chevron dir="next" />
        </button>
      )}
      {showsDots(count) ? (
        <div className="ui-car-dots">
          {Array.from({ length: count }, (_, i) => (
            <button key={i} type="button" className="ui-car-dot" aria-label={`${i + 1}번째 카드`} aria-current={i === index} onClick={() => goTo(i)} />
          ))}
        </div>
      ) : (
        count > DOT_MAX && <span className="ui-t-label ui-car-count">{`${index + 1} / ${count}`}</span>
      )}
    </div>
  );
}
