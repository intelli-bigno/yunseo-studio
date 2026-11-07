// 카드 편집기 도구줄 — 한 줄에 필요한 조작이 다 있고, 메뉴·도움말은 닫힌 채 시작한다(화면 높이를 아낀다)
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Menu, MenuItem, Popover } from "@yunseo/ui/menu";
import { CardsToolbar, SHORTCUTS, type CardsToolbarProps } from "./CardsToolbar";

const noop = () => undefined;
const props = (over: Partial<CardsToolbarProps> = {}): CardsToolbarProps => ({
  title: "새 카드뉴스",
  onTitle: noop,
  preset: "4:5",
  onPreset: noop,
  size: "1080×1350",
  cardCount: 3,
  isNew: true,
  dirty: false,
  busy: false,
  msg: null,
  canUndo: false,
  canRedo: false,
  onUndo: noop,
  onRedo: noop,
  canSave: true,
  onSave: noop,
  decks: [{ id: "d1", title: "첫 덱", cardCount: 5, updatedAt: "2026-11-08T01:02:03Z" }],
  currentId: null,
  onOpen: noop,
  onNew: noop,
  onRemove: noop,
  canDeselect: false,
  onAddText: noop,
  onAddOverlay: noop,
  onAddGradient: noop,
  onDeselect: noop,
  onExportOne: noop,
  onExportAll: noop,
  ...over,
});
const render = (over: Partial<CardsToolbarProps> = {}) => renderToStaticMarkup(createElement(CardsToolbar, props(over)));

describe("도구줄 — 한 줄", () => {
  it("도구줄 하나에 덱 제목 입력·규격·상태·실행취소·저장이 있다", () => {
    const html = render();
    expect(html.match(/role="toolbar"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="덱 제목"');
    expect(html).toContain('value="새 카드뉴스"');
    expect(html).toContain('aria-label="카드 규격"');
    expect(html).toContain("3장 · 1080×1350 · 새 덱");
    expect(html).toContain('aria-label="실행취소 (⌘Z)"');
    expect(html).toContain('aria-label="다시실행 (⇧⌘Z)"');
    expect(html).toContain("저장");
  });

  it("저장된 덱 열기 선택·덱 삭제·PNG 단추는 줄에 펼쳐 두지 않고 메뉴 단추 뒤에 접혀 있다", () => {
    const html = render();
    expect(html).not.toContain("저장된 덱 열기");
    expect(html).not.toContain("덱 삭제");
    expect(html).not.toContain("이 장 PNG");
    expect(html).not.toContain('role="menuitem"');
    expect(html.match(/aria-haspopup="menu"/g)).toHaveLength(3); // 추가 · 내보내기 · 덱
    expect(html.match(/aria-expanded="false"/g)?.length).toBeGreaterThanOrEqual(4); // 위 셋 + ? 도움말
  });

  it("단축키 안내는 ? 도움말 안에만 있다 — 줄에는 풀어 쓴 안내 글이 없다", () => {
    const html = render();
    expect(html).toContain('aria-label="단축키 도움말"');
    expect(html).not.toContain("Delete");
    expect(html).not.toContain("붙기 끄기");
    expect(SHORTCUTS.map(([, label]) => label)).toEqual(expect.arrayContaining(["선택한 요소 삭제", "실행취소", "다시실행", "선택 해제"]));
  });

  it("저장 안 됨·알림은 같은 줄에 글자로 나온다(알림은 실패면 role=alert)", () => {
    expect(render({ dirty: true, isNew: false })).toContain("저장 안 됨");
    const bad = render({ msg: { tone: "alert", text: "저장하지 못했습니다" } });
    expect(bad).toContain('role="alert"');
    expect(bad).toContain("저장하지 못했습니다");
    expect(render({ msg: { tone: "accent", text: "저장했습니다" } })).toContain('role="status"');
  });

  it("저장은 저장할 게 없으면 꺼진다, 실행취소는 기록이 있어야 켜진다", () => {
    expect(render({ canSave: false })).toMatch(/<button[^>]*disabled=""[^>]*>저장<\/button>/);
    expect(render({ canUndo: false })).toMatch(/<button[^>]*aria-label="실행취소 \(⌘Z\)"[^>]*disabled=""|<button[^>]*disabled=""[^>]*aria-label="실행취소 \(⌘Z\)"/);
    expect(render({ canUndo: true })).not.toMatch(/aria-label="실행취소 \(⌘Z\)"[^>]*disabled/);
  });

  it("저장·내보내기 중(busy)에는 내보내기·덱 메뉴 단추가 꺼진다", () => {
    const html = render({ busy: true });
    expect(html.match(/ui-menu-trigger[^>]*disabled=""/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("메뉴·팝오버 — 닫힌 첫 모습", () => {
  it("Menu 는 단추만 그리고(aria-expanded=false) 면은 열릴 때만 그린다", () => {
    const html = renderToStaticMarkup(createElement(Menu, { label: "덱", trigger: "덱", children: createElement(MenuItem, { onSelect: noop, children: "새 덱" }) }));
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("ui-menu-panel");
    expect(html).not.toContain("새 덱");
  });

  it("아이콘 Popover 는 이름을 aria-label 로 갖고 대화상자 용도를 알린다", () => {
    const html = renderToStaticMarkup(createElement(Popover, { label: "단축키 도움말", trigger: "?", variant: "icon", children: "내용" }));
    expect(html).toContain('aria-label="단축키 도움말"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("ui-icon-btn");
    expect(html).not.toContain("내용");
  });
});
