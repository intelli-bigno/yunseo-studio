// CardRenderer 입구 — 콘텐츠 정본 → 카드 PNG 세트 + 캡션·해시태그·대체텍스트 (satori + resvg, 브라우저·외부 호출 없음).
// 네이티브 모듈(@resvg/resvg-js)을 쓰므로 대시보드(Next 번들)에서는 가져오지 않는다 — 가져오려면 next.config 의 serverExternalPackages 가 먼저 필요하다.
export * from "./card-renderer";
export { loadBackgroundDir, type Backgrounds } from "./backgrounds";
export { CARD_HEIGHT, CARD_WIDTH } from "./theme";
