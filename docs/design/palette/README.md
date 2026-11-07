# 색 체계 교체 — Ink & Brass (2026-11-07)

계기: 사용자 피드백 「전부 녹색이라 색감 별로」. 옛 Club Green(딥그린+민트)을 버린다.

## 시안 3개 (compare.png, Aside 캡처)

| 안 | 바탕 | 글자 | 강조 1색 | 판정 |
|---|---|---|---|---|
| **A Ink & Brass** | 잉크 블랙 #0E0F11 | 웜 아이보리 #EDE6D6 | 황동 #C9A46A | **채택** |
| B Charcoal & Oxblood | 차콜 #121212 | 아이보리 #EFE8DA | 옥스블러드 #D0948A | 막힘 표시(버건디)와 색이 겹쳐 강조·경고가 구분 안 됨 |
| C Graphite & Steel | 그래파이트 #101317 | 아이보리 #ECE7DC | 스틸 블루 #9DB4CF | 차갑고 흔한 SaaS 톤 — 「댄디」와 거리 |

## 채택 이유
- 잉크 블랙+아이보리+황동은 테일러링·프라이빗 뱅크 문법 — 고급·댄디 톤에 가장 가깝고 녹색이 하나도 없다.
- 강조가 따뜻한 금속색이라 경고(버건디)와 색상환에서 떨어져 있어 의미가 섞이지 않는다.
- 대비: 모든 글자/바탕 쌍 4.5 이상(`packages/design-tokens/src/tokens.test.ts` 가 검사).

## 기준(SoT)
색은 `packages/design-tokens/src/tokens.ts` 한 곳만 바꾼다. `@yunseo/ui` 스타일은 CSS 변수(`--c-*`)만 쓴다.
남은 리터럴 색은 의도된 것뿐이다: 인스타·유튜브 공식 아이콘 색(`packages/ui/src/library.tsx`), 카드 원본 위 검정 덮개(`.ui-canvas-overlay`, 카드 콘텐츠 색이라 테마 밖).
