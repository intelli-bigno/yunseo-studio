// 레퍼런스 우선 오른쪽 패널 — 폭 조절 경계·속성 시트(요소를 골랐을 때만)·메이슨리 칸·크게 보기의 마크업
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditorLayout, Lightbox, RefGrid, RefTile, Tile } from "@yunseo/ui";

const layout = (over: Partial<Parameters<typeof EditorLayout>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(EditorLayout, {
      left: "L",
      stage: "S",
      strip: "T",
      right: "R-GRID",
      leftOpen: true,
      rightOpen: true,
      onToggleLeft: () => undefined,
      onToggleRight: () => undefined,
      leftLabel: "스티커",
      rightLabel: "레퍼런스",
      ...over,
    }),
  );

describe("오른쪽 패널", () => {
  it("폭 조절 경계가 있고 비율을 주면 CSS 변수로 들어간다", () => {
    const html = layout({ rightRatio: 0.5, onRightRatio: () => undefined });
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain("--ed-right:50.0%");
  });

  it("비율을 안 주면 변수 없이 기본(CSS 40%)이고, 조절 함수가 없으면 경계도 없다", () => {
    expect(layout({ onRightRatio: () => undefined })).not.toContain("--ed-right");
    expect(layout({ onRightRatio: () => undefined })).toContain('aria-valuenow="40"');
    expect(layout()).not.toContain("separator");
  });

  it("범위 밖 비율은 잘려 들어간다", () => {
    expect(layout({ rightRatio: 0.99, onRightRatio: () => undefined })).toContain("--ed-right:70.0%");
  });

  it("요소를 안 골랐으면 시트 없이 그리드만 패널 전체", () => {
    const html = layout();
    expect(html).toContain("R-GRID");
    expect(html).not.toContain("ui-sheet");
  });

  it("요소를 골랐으면 패널 위에 시트가 뜨고, 접으면 머리 줄만 남는다", () => {
    const open = layout({ sheet: "PROPS", sheetTitle: "속성 — 글자", sheetOpen: true, onToggleSheet: () => undefined });
    expect(open).toContain("R-GRID");
    expect(open).toContain("ui-sheet");
    expect(open).toContain("PROPS");
    const shut = layout({ sheet: "PROPS", sheetTitle: "속성 — 글자", sheetOpen: false, onToggleSheet: () => undefined });
    expect(shut).toContain("is-collapsed");
    expect(shut).toContain('aria-expanded="false"');
    expect(shut).not.toContain("PROPS");
    expect(shut).toContain("R-GRID"); // 접어도 그리드는 그대로
  });

  it("패널을 접으면 그리드·시트·경계 모두 그리지 않는다", () => {
    const html = layout({ rightOpen: false, sheet: "PROPS", onRightRatio: () => undefined });
    expect(html).not.toContain("R-GRID");
    expect(html).not.toContain("PROPS");
    expect(html).not.toContain("separator");
  });
});

describe("레퍼런스 칸·크게 보기", () => {
  const noop = () => undefined;
  it("그림은 자르지 않는 지연 로딩이고, 눌러서 크게 보기·끌어서 캔버스로", () => {
    const html = renderToStaticMarkup(createElement(RefGrid, null, createElement(RefTile, { src: "https://i.pinimg.com/x.jpg", label: "표지", action: "크게 보기", onDragStart: noop, onClick: noop })));
    expect(html).toContain("ui-refgrid");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('draggable="true"');
    expect(html).toContain('aria-label="표지 크게 보기"');
  });

  it("크기별 파일(srcSet)을 받고, 첫 화면 칸(priority)만 즉시·높은 우선순위로 받는다", () => {
    const mk = (props: object) => renderToStaticMarkup(createElement(RefTile, { src: "/a.webp", label: "표지", action: "크게 보기", onDragStart: noop, onClick: noop, ...props }));
    const lazy = mk({ srcSet: "/a1.webp 1x, /a2.webp 2x" });
    expect(lazy).toContain('srcSet="/a1.webp 1x, /a2.webp 2x"');
    expect(lazy).toContain('loading="lazy"');
    expect(lazy).not.toContain('fetchPriority="high"');
    const first = mk({ priority: true });
    expect(first).toContain('loading="eager"');
    expect(first).toContain('fetchPriority="high"');
    const tile = (props: object) => renderToStaticMarkup(createElement(Tile, { src: "/a.webp", alt: "표지", title: "표지", aspect: "natural", ...props }));
    expect(tile({ srcSet: "/a1.webp 1x, /a2.webp 2x", priority: true })).toMatch(/srcSet="\/a1\.webp 1x, \/a2\.webp 2x"[^>]*loading="eager"[^>]*fetchPriority="high"/);
    expect(tile({})).toContain('loading="lazy"');
  });

  it("크게 보기는 대화상자이고 동작 버튼을 받는다", () => {
    const html = renderToStaticMarkup(createElement(Lightbox, { src: "/a.jpg", label: "표지", meta: "표지 묶음", actions: "ACT" as ReactNode, onClose: noop }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("ACT");
    expect(html).toContain("표지 묶음");
  });
});
