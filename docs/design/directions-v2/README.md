# 대시보드 방향 v2 — 새 3안 (2026-11-04, 내부 참고 전용)

11/4 반려(「싹 다 별로」) 된 [references/](../references/index.html) 의 안 1 Broadsheet · 안 2 Terminal · 안 3 Swiss 와 그 무드보드를 **기반으로 쓰지 않고** 새로 수집해 다시 그렸다.
목표 톤(사용자 요지): 개인용 카드뉴스·콘텐츠 제작 스튜디오 — 돈 많은 남성 비즈니스 오너의 간지, 댄디·컴팩트·그럴듯하게, **단 직관적이고 쓰기 편하게**.

입구: [index.html](index.html) (3안 비교 + 추천) · [moodboard.html](moodboard.html) (레퍼런스 28) · 데이터 [refs.json](refs.json)

## 수집

- Aside(읽기만)로 Pinterest 10개 검색어 225개 + Dribbble 5개 검색어 111개 후보 → 실제 제품 화면 위주 28개 선정.
- 검색어: private banking app · wealth management dashboard · luxury watch / car configurator · executive dashboard · premium fintech dark green · luxury e-commerce admin · bloomberg terminal redesign · burgundy dark dashboard 등.
- 이미지는 저장하지 않고 썸네일 주소만 기록한다. 화면을 옮기지 않고 원리만 가져왔다(각 항목 `takeaway`).

## 3안

| | A — Atelier Noir | B — Club Green | C — Graphite Cockpit |
| --- | --- | --- | --- |
| 인상 | 시계 부티크·자동차 쇼룸 | 프라이빗 뱅크·테일러링 | 고성능 차 계기판·프로 도구 |
| 구조 | 가로 메뉴, 오늘의 한 편이 주인공 · 편집 = 구성기(가운데 카드, 아래 장 줄) | 왼쪽 메뉴 + 벤토 칸 · 편집 = 장 목록 / 폰 미리보기 / 문장·점검 | 아이콘 레일 + ⌘K · KPI 게이지 + 우선순위 큐 · 편집 = 큰 카드 + 문장 바로 편집 + 단축키 |
| 색 | 무광 블랙 · 브라스 #C9A36A | 딥그린 #0A1612 · 아이보리 · 버건디 #7A2633(막힘만) | 차콜 4단계 · 시그널 오렌지 #FF6B1A(지금 할 일만) |
| 서체(시스템) | Didot + Avenir Next | Optima + Apple SD Gothic Neo | DIN Alternate + SF |
| 레퍼런스 | 01 03 04 08 09 11 13 14 16 24 27 28 | 02 07 10 12 18 19 22 26 | 05 06 15 17 20 21 23 25 |
| 약점 | 정보 밀도 낮음, 블랙+골드 흔함 | 넓은 녹색 면 — 미리보기 바탕은 중립으로 | 댄디함 약함 |

**추천: B — Club Green.** 댄디(과시 없는 고급) · 컴팩트(한 화면에 할 일·막힘·게이트) · 직관(칸 크기 = 우선순위, 인스타 그대로의 폰 미리보기)을 같이 채운다. A 의 Didot 큰 숫자, C 의 ⌘K·번호 단축키는 B 위에 섞을 수 있다.

## 파일

| 파일 | 내용 |
| --- | --- |
| `a-atelier-noir.html` · `b-club-green.html` · `c-graphite-cockpit.html` | 안별 정적 시안(스크립트·외부 자원 없음), 화면 2개(`#home` · `#editor`) |
| `render/<a|b|c>-home.png` · `render/<a|b|c>-editor.png` | 1600×1000 의 2배(3200×2000) 렌더 — PNG 가 기준 |
| `render.sh` | HTML → PNG 다시 만들기(로컬 Chrome headless, 로컬 파일만) |

카드 미리보기는 [card-reference/v2](../card-reference/v2/README.md) 렌더 PNG 를 상대 경로로 넣었다(SAMPLE, 게시 불가).

## 한계

- 서체는 macOS 시스템 서체 — 다른 기기에서 HTML 은 대체 서체로 보일 수 있다. 최종 서체는 결정 D5.
- 문구·사건명·수치는 자리표시. 실제 데이터·실제 폰 화면 확인은 하지 않았다.
- 동시에 도는 구현 작업(dashboard-redesign)과 별개 — apps 코드는 건드리지 않았다. 고른 안으로 구현을 다시 맞춘다.
