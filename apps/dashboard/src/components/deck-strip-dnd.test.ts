// 장 목록(DeckStrip) — 장 3개가 모두 보이고, 썸네일을 끌어서 순서를 바꾸는 동작(끌기 시작 → 놓기 → 새 순서)을 확인한다.
// 브라우저 없이: 컴포넌트는 훅이 없어 함수로 직접 불러 요소 트리의 핸들러를 가짜 dataTransfer 로 호출한다.
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { addCard, createDeck, moveCardTo } from "@yunseo/domain";
import { DeckAction, DeckStrip, DeckThumb } from "@yunseo/ui";

const KEY = "text/x-cards-card";

/** 브라우저 dataTransfer 흉내 — setData 한 자료형이 types 에 나타난다 */
function fakeTransfer(store: Record<string, string> = {}) {
  return {
    store,
    dt: {
      setData: (k: string, v: string) => void (store[k] = v),
      getData: (k: string) => store[k] ?? "",
      get types() {
        return Object.keys(store);
      },
      effectAllowed: "uninitialized",
    },
  };
}

type Handlers = { onDragOver: (e: unknown) => void; onDragLeave: (e: unknown) => void; onDrop: (e: unknown) => void; children: ReactElement[] };
type DragProps = { onDragStart: (e: unknown) => void; draggable?: boolean };
const thumbEl = (index: number, onDropAt: (from: number, to: number) => void) => {
  const el = DeckThumb({ index, current: index === 0, label: `${index + 1}번째 장`, onClick: () => undefined, children: null, dragKey: KEY, onDropAt }) as ReactElement<Handlers>;
  const button = el.props.children[0] as ReactElement<DragProps>; // 썸네일 버튼(끌기 시작), 둘째는 번호·도구 줄
  return { wrap: el.props, button: button.props };
};
const classList = () => {
  const added: string[] = [];
  const removed: string[] = [];
  return { added, removed, el: { classList: { add: (c: string) => added.push(c), remove: (c: string) => removed.push(c) } } };
};

describe("장 목록 — 장 3개", () => {
  const deck = addCard(addCard(createDeck("d", "덱", "4:5", "c1"), "c2"), "c3");

  it("3장이 모두 목록 항목이고 끌 수 있다(순서 = 장 순서)", () => {
    const thumbs = deck.cards.map((c, i) => createElement(DeckThumb, { key: c.id, index: i, current: i === 1, label: `${i + 1}번째 장`, onClick: () => undefined, dragKey: KEY, onDropAt: () => undefined, children: null }));
    const html = renderToStaticMarkup(createElement(DeckStrip, { label: "장 목록(끌어서 순서 바꾸기)", actions: createElement("span", null, "장 추가"), children: thumbs }));
    expect(html.match(/role="listitem"/g)).toHaveLength(3);
    expect(html.match(/draggable="true"/g)).toHaveLength(3);
    for (const n of ["1번째 장", "2번째 장", "3번째 장"]) expect(html).toContain(`aria-label="${n}"`);
    expect(html.match(/aria-current="true"/g)).toHaveLength(1); // 현재 장 하나
    expect(html).toContain(">01<");
    expect(html).toContain(">03<");
    expect(html).toContain("장 추가"); // 줄 오른쪽 끝 동작 버튼
  });

  it("끌기 키를 주지 않으면 끌 수 없다", () => {
    const html = renderToStaticMarkup(createElement(DeckThumb, { index: 0, current: true, label: "1번째 장", onClick: () => undefined, children: null }));
    expect(html).not.toContain("draggable");
  });

  it("첫 장을 끌어 세 번째 장에 놓으면 onDropAt(0, 2) 이고 새 순서는 c2, c3, c1", () => {
    const onDropAt = vi.fn();
    const { dt, store } = fakeTransfer();
    // 1) 첫 장 썸네일에서 끌기 시작 — 자료에 자기 번호(0)를 싣는다
    thumbEl(0, onDropAt).button.onDragStart({ dataTransfer: dt });
    expect(store[KEY]).toBe("0");
    expect(dt.effectAllowed).toBe("move");
    // 2) 세 번째 장 위를 지나면 놓을 자리 표시(is-drop)가 붙고 놓기를 허용한다
    const target = thumbEl(2, onDropAt).wrap;
    const over = classList();
    const prevented = vi.fn();
    target.onDragOver({ dataTransfer: dt, currentTarget: over.el, preventDefault: prevented });
    expect(over.added).toEqual(["is-drop"]);
    expect(prevented).toHaveBeenCalledOnce();
    // 3) 놓으면 (from=0, to=2) 가 올라가고 표시가 지워진다
    const drop = classList();
    target.onDrop({ dataTransfer: dt, currentTarget: drop.el, preventDefault: vi.fn() });
    expect(drop.removed).toEqual(["is-drop"]);
    expect(onDropAt).toHaveBeenCalledExactlyOnceWith(0, 2);
    const [from, to] = onDropAt.mock.calls[0] as [number, number];
    expect(moveCardTo(deck, from, to).cards.map((c) => c.id)).toEqual(["c2", "c3", "c1"]);
  });

  it("세 번째 장을 끌어 첫 장에 놓으면 c3, c1, c2", () => {
    const onDropAt = vi.fn();
    const { dt } = fakeTransfer();
    thumbEl(2, onDropAt).button.onDragStart({ dataTransfer: dt });
    thumbEl(0, onDropAt).wrap.onDrop({ dataTransfer: dt, currentTarget: classList().el, preventDefault: vi.fn() });
    expect(onDropAt).toHaveBeenCalledExactlyOnceWith(2, 0);
    expect(moveCardTo(deck, 2, 0).cards.map((c) => c.id)).toEqual(["c3", "c1", "c2"]);
  });

  it("다른 자료(파일·자산 끌기)는 장 순서로 받지 않는다 — 놓기를 허용하지도 처리하지도 않는다", () => {
    const onDropAt = vi.fn();
    const { dt } = fakeTransfer({ "text/x-cards-asset": "card:a" });
    const target = thumbEl(1, onDropAt).wrap;
    const prevented = vi.fn();
    const over = classList();
    target.onDragOver({ dataTransfer: dt, currentTarget: over.el, preventDefault: prevented });
    expect(prevented).not.toHaveBeenCalled();
    expect(over.added).toEqual([]);
    target.onDrop({ dataTransfer: dt, currentTarget: classList().el, preventDefault: prevented });
    expect(onDropAt).not.toHaveBeenCalled();
  });

  it("끌다가 벗어나면 놓을 자리 표시가 지워진다", () => {
    const left = classList();
    thumbEl(1, vi.fn()).wrap.onDragLeave({ currentTarget: left.el });
    expect(left.removed).toEqual(["is-drop"]);
  });
});

describe("장 목록 동작 단추 — 줄이 좁을 때는 아이콘만", () => {
  it("이름(aria-label·title)은 항상 있고 글자는 따로 감싸 CSS 가 숨긴다", () => {
    const html = renderToStaticMarkup(createElement(DeckAction, { icon: "+", label: "장 추가", primary: true, onClick: () => undefined }));
    expect(html).toContain('aria-label="장 추가"');
    expect(html).toContain('title="장 추가"');
    expect(html).toContain("ui-btn-primary");
    expect(html).toContain('<span class="ui-deck-action-icon" aria-hidden="true">+</span>');
    expect(html).toContain('<span class="ui-deck-action-text">장 추가</span>');
  });

  it("끌 수 없는 상태(disabled)가 그대로 전달된다", () => {
    expect(renderToStaticMarkup(createElement(DeckAction, { icon: "×", label: "장 삭제", disabled: true }))).toContain("disabled");
  });
});
