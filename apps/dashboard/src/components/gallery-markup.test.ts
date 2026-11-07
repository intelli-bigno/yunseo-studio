// [W4] 갤러리 카드·캐러셀 마크업 구조 — 서버 렌더 결과로 본다(브라우저 없이).
// 핵심: 링크(<a>) 안에 버튼을 넣지 않는다(잘못된 HTML), 장 링크는 탭 순서에서 빠지고 제목 링크 하나만 남는다, 처음엔 이전 화살표가 없다.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MediaCard, MediaGrid, MediaSlide } from "@yunseo/ui";
import { Carousel } from "@yunseo/ui/carousel";

const slides = (n: number) => Array.from({ length: n }, (_, i) => createElement(MediaSlide, { key: i, href: "/content/P-1", src: `/api/pieces/P-1/cards/${i + 1}`, alt: `카드 ${i + 1}` }));
const carousel = (n: number) => renderToStaticMarkup(createElement(Carousel, { count: n, label: "FOMC 전" }, ...slides(n)));

describe("캐러셀 마크업", () => {
  it("장 수만큼 그림을 그리고, 처음엔 이전 화살표 없이 다음 화살표만 있다", () => {
    const html = carousel(3);
    expect(html.match(/<img /g)).toHaveLength(3);
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).toContain('aria-label="다음 카드"');
    expect(html).not.toContain('aria-label="이전 카드"');
  });

  it("점은 장 수만큼이고 첫 점이 현재다", () => {
    const html = carousel(3);
    const dots = html.match(/<button[^>]*class="ui-car-dot"[^>]*>/g) ?? [];
    expect(dots).toHaveLength(3);
    expect(dots[0]).toContain('aria-current="true"');
    expect(dots[1]).toContain('aria-current="false"');
  });

  it("장이 많으면(8 초과) 점 대신 「1 / N」 숫자", () => {
    const html = carousel(10);
    expect(html).not.toContain("ui-car-dot");
    expect(html).toContain("1 / 10");
  });

  it("링크 안에 버튼이 들어가지 않는다", () => {
    const anchors = carousel(4).match(/<a [^>]*>[\s\S]*?<\/a>/g) ?? [];
    expect(anchors).toHaveLength(4);
    for (const a of anchors) expect(a).not.toContain("<button");
  });
});

describe("갤러리 카드 마크업", () => {
  const card = renderToStaticMarkup(
    createElement(MediaGrid, null, createElement(MediaCard, { href: "/content/P-1", title: "FOMC 전", meta: "11.06 금 21:00", frame: createElement(Carousel, { count: 2, label: "FOMC 전" }, ...slides(2)) })),
  );

  it("장 링크는 탭 순서에서 빠지고(tabindex -1) 제목 링크만 탭으로 닿는다", () => {
    const links = card.match(/<a [^>]*>/g) ?? [];
    expect(links).toHaveLength(3); // 장 2 + 제목 1
    expect(links.filter((a) => a.includes('tabindex="-1"'))).toHaveLength(2);
    expect(links.filter((a) => a.includes("ui-mcard-title"))).toHaveLength(1);
  });

  it("제목·보조 줄이 카드 몸통에 있다", () => {
    expect(card).toContain("FOMC 전");
    expect(card).toContain("11.06 금 21:00");
  });

  it("그림 없는 장은 자리 표시를 그린다(이미지 없음)", () => {
    const blank = renderToStaticMarkup(createElement(MediaSlide, { href: "/x" }, "렌더 전"));
    expect(blank).toContain("is-blank");
    expect(blank).not.toContain("<img");
    expect(blank).toContain("렌더 전");
  });
});
