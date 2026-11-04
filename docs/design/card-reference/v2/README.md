# 카드 예시 v2 — 레퍼런스의 시각 문법을 따른 사진 배경판 (내부 참고 전용)

사용자 반려(2026-11-04): v1(PR #5)은 「사진 대신 도식만 · 말풍선 대신 직각 상자」로 레퍼런스 룩을 버렸다. v2 는 **구조가 아니라 룩까지** 레퍼런스에 가깝게 되돌린 판이다. 레퍼런스의 로고·계정명·문구·사진 원본은 쓰지 않는다.

- 비교: [compare.html](compare.html) — 장별 나란히 + 맞춘 점 / 일부러 다르게 둔 점
- 조판: [cards-v2.html](cards-v2.html) → 렌더 [render/v2-01.png … v2-08.png](render/) (1080×1350)
- 배경: [bg/](bg/) 7장(생성형, 스타일 바이블 [style-bible.md](style-bible.md) 공유) · 프롬프트 [gen-prompts/](gen-prompts/)
- 재렌더: `bash docs/design/card-reference/v2/render.sh` (로컬 파일만 Chrome headless 로 캡처)
- v1 시안 A·B(도식 중심)는 그대로 둔다. **v2 를 기본안으로 제안**한다.

## 구성 (8장)

| # | 슬롯 | 배경 장면 | 질문 → 답 |
| --- | --- | --- | --- |
| 1 | cover | 블루아워 의사당(수면 반영) | — (제목) |
| 2 | why_it_matters | 투표함에 빈 투표지를 넣는 손 | Why does a vote move prices? → Because it changes what's expected |
| 3 | market_expectation | 어두운 모니터가 있는 분석 책상 + 차트 자리표시 패널 | What's already in the price? → A baseline, set before the result |
| 4 | scenarios ① 조건 | 서로 다르게 빛나는 세 개의 문 | What if the result differs? → Three outcomes, not predictions |
| 5 | scenarios ② 읽는 법 | 접힌 신문과 커피 | And how would each one read? → Same data, three stories |
| 6 | transmission | 세 갈래로 갈라지는 물길(항공) | How does it reach prices? → Through three paths |
| 7 | after_checks | 빈 노트와 펜 | What do I check afterwards? → Three signals you can verify |
| 8 | sources | (종이색 · 사진 없음) | Where does this come from? → Every claim keeps its source and time |

## 지킨 규칙

- 사실 수치·채널명·운영자·고지 문구는 자리표시. 모든 카드에 `As of [..]`·`[Channel TBD]`·`SAMPLE`. 발행 불가.
- 투자 권유·확률·목표가 없음(금지 표현 검사 `card-example-v2.test.ts`).
- 이미지에 읽히는 글자·얼굴·깃발·정당색 없음(스타일 바이블 금지 목록, 생성 뒤 눈으로 검수). 유료 이미지 API 미사용 — codex `image_generate` 만.

## 결정이 필요한 것

| # | 항목 | 제안 |
| --- | --- | --- |
| V1 | 글 영역 바탕 | 어두운 네이비 페이드(현 v2) / 레퍼런스처럼 흰색 페이드. 같은 사진·마크업에서 CSS 만 바꿔 만들 수 있다 — 제안: 현 v2 유지 |
| V2 | 판형 | 4:5(현) / 3:4(레퍼런스, 프로필 격자) — 기존 R1 과 같은 결정 |
| V3 | 생성형 사진의 사용 | 실존 장소(의사당)를 AI 로 그린 이미지 — 게시 전 「AI 생성 이미지」 표기 여부 정책 필요(D8 고지와 함께) |
