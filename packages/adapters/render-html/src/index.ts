// 어댑터 계층: render-html — application 포트를 구현한다.
// - 이 입구(`@yunseo/adapters-render-html`): CardAssets — 렌더된 카드 PNG 읽기(대시보드 미리보기). 가볍다: 네이티브 모듈을 끌고 오지 않는다.
// - `@yunseo/adapters-render-html/renderer`: CardRenderer — 콘텐츠 정본 → 카드 PNG 세트(satori + resvg).
//   네이티브 래스터 모듈(.node)을 쓰므로 Next 번들(대시보드)이 실수로 끌어오지 않게 입구를 나눴다 — CLI·워커가 이쪽을 쓴다.
export * from "./card-assets";
