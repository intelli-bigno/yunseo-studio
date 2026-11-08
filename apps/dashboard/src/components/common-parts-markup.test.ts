// 공통 부품 마크업 계약 — 한 부품으로 합친 입력·모달·끌기 칸·접기 버튼과 접근성 속성을 서버 렌더 결과로 본다(브라우저 없이).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AssetTile, Dialog, EmptyState, Lightbox, Notice, NumberField, Range, RefTile, StickerTile, Toast } from "@yunseo/ui";
import { ReelsToggle } from "@yunseo/ui/reels";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const noop = () => undefined;

describe("숫자 칸", () => {
  it("live(카드 편집기)는 소수 둘째 자리까지 보이고, 아니면(릴스 편집기) 값 그대로 보인다", () => {
    expect(html(createElement(NumberField, { label: "X", value: 1.23456, min: 0, max: 9, live: true, onChange: noop }))).toContain('value="1.23"');
    expect(html(createElement(NumberField, { label: "길이", value: 1.23456, min: 0, max: 9, step: 0.1, onChange: noop }))).toContain('value="1.23456"');
  });

  it("이름표·범위·잠금이 입력 칸에 붙는다", () => {
    const out = html(createElement(NumberField, { label: "길이 (초)", value: 2, min: 0.1, max: 9, step: 0.1, disabled: true, onChange: noop }));
    expect(out).toContain("길이 (초)");
    expect(out).toMatch(/type="number"[^>]*min="0.1"[^>]*max="9"|min="0.1"[^>]*max="9"[^>]*type="number"/);
    expect(out).toContain("disabled");
  });
});

describe("슬라이더", () => {
  it("값 표시는 display 가 먼저, 없으면 값이고 잠그면 disabled", () => {
    expect(html(createElement(Range, { label: "크기", value: 3, min: 0, max: 9, step: 1, display: "3.00배", onChange: noop }))).toContain("3.00배");
    expect(html(createElement(Range, { label: "크기", value: 3, min: 0, max: 9, step: 1, onChange: noop }))).toContain(">3<");
    expect(html(createElement(Range, { label: "크기", value: 3, min: 0, max: 9, step: 1, disabled: true, onChange: noop, onCommit: noop }))).toContain("disabled");
  });
});

describe("모달", () => {
  it("대화상자는 role=dialog·aria-modal·이름·포커스 받을 수 있는 틀이다", () => {
    const out = html(createElement(Dialog, { onClose: noop, label: "빠른 이동", children: "본문" }));
    expect(out).toContain('role="dialog"');
    expect(out).toContain('aria-modal="true"');
    expect(out).toContain('aria-label="빠른 이동"');
    expect(out).toContain('tabindex="-1"');
  });

  it("크게 보기도 같은 틀(role·aria-modal·tabindex)에 그림·제목·행동이 들어간다", () => {
    const out = html(createElement(Lightbox, { src: "/a.png", label: "레퍼런스 1", meta: "묶음", actions: "ACT", onClose: noop }));
    expect(out).toContain('role="dialog"');
    expect(out).toContain('aria-modal="true"');
    expect(out).toContain('tabindex="-1"');
    expect(out).toContain("ACT");
    expect(out).toContain('alt="레퍼런스 1"');
  });
});

describe("끌기 칸", () => {
  const tile = { label: "이름", onDragStart: noop, onClick: noop };
  it("자산·레퍼런스·스티커 칸은 같은 버튼 틀에 종류별 클래스와 접근 이름을 가진다", () => {
    const asset = html(createElement(AssetTile, { src: "/a", ...tile }));
    const ref = html(createElement(RefTile, { src: "/a", action: "크게 보기", ...tile }));
    const sticker = html(createElement(StickerTile, { src: "/a", ...tile }));
    for (const out of [asset, ref, sticker]) expect(out).toMatch(/<button type="button" class="[^"]+" title="이름" aria-label="[^"]+" draggable="true">/); // 앞에 이미지 preload <link> 가 올 수 있다(React 19)
    expect(asset).toContain('class="ui-asset"');
    expect(asset).toContain('aria-label="이름 넣기"');
    expect(ref).toContain('class="ui-ref"');
    expect(ref).toContain('aria-label="이름 크게 보기"');
    expect(sticker).toContain('class="ui-sticker-tile"');
    expect(sticker).toContain('aria-label="스티커 이름 넣기"');
  });
});

describe("접기·켬끔 버튼", () => {
  it("expanded 는 aria-expanded 로, pressed 는 aria-pressed 로 읽힌다", () => {
    const fold = html(createElement(ReelsToggle, { label: "패널 접기", expanded: true, onClick: noop, children: "▾" }));
    expect(fold).toContain('aria-expanded="true"');
    expect(fold).not.toContain("aria-pressed");
    const mute = html(createElement(ReelsToggle, { label: "음소거", pressed: true, onClick: noop, children: "M" }));
    expect(mute).toContain('aria-pressed="true"');
    expect(mute).not.toContain("aria-expanded");
  });
});

describe("알림·불러오는 중·토스트", () => {
  it("Notice 는 막힘이면 alert, 안내면 status", () => {
    expect(html(createElement(Notice, { children: "막힘" }))).toContain('role="alert"');
    expect(html(createElement(Notice, { tone: "accent", children: "안내" }))).toContain('role="status"');
  });

  it("EmptyState 는 busy 일 때만 status·aria-busy", () => {
    expect(html(createElement(EmptyState, { title: "불러오는 중", busy: true }))).toMatch(/role="status"[^>]*aria-busy="true"|aria-busy="true"[^>]*role="status"/);
    const idle = html(createElement(EmptyState, { title: "없음" }));
    expect(idle).not.toContain("aria-busy");
    expect(idle).not.toContain("role=");
  });

  it("Toast 는 정중한 live region", () => {
    expect(html(createElement(Toast, { children: "저장됨" }))).toContain('aria-live="polite"');
  });
});
