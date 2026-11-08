---
name: new-cardnews
description: 새 카드뉴스 한 편을 만든다 — 레퍼런스의 구조(질문→한 줄 답→근거)를 받아 덱을 만들고, ops 로 장·레이어를 채운다. 「새 카드뉴스」「카드뉴스 만들어줘」「이 주제로 카드」「/new-cardnews」 요청에 쓴다. 배경 이미지는 /gen-background, 레퍼런스 추가는 /add-reference.
---

# 새 카드뉴스

덱 하나 = 카드뉴스 한 편. 장·글·덮개·이미지·스티커를 **ops(JSON 명령)** 로 채우고, 윤서가 화면에서 이어 고친다. 명령 계약은 [docs/13-cards-ops-schema.md](../../../docs/13-cards-ops-schema.md).

## 0. 시작 전 (한 번에 묻는다)

윤서에게 아래를 **한 번에** 묻고, 이미 말한 건 다시 묻지 않는다.

1. 주제 한 줄 (예: 「11월 FOMC 앞두고 시장이 묻는 것」)
2. 장 수 (기본 6~8장, 최대 30) · 판형 (기본 `4:5` 피드 / `1:1` / `9:16` 스토리)
3. 참고 레퍼런스 (없으면 `http://127.0.0.1:8930/references` 에서 1~3장 고르게 한다)

서버가 꺼져 있으면 켠다: `bash scripts/start.sh --detach` (이미 켜져 있으면 샘플 덱만 확인하고 끝난다).

## 1. 구조 잡기

- 레퍼런스 id 의 `takeaway`·`tags` 를 `docs/design/card-reference/refs.json` 에서 읽는다. 기준 구조는 [docs/design/card-reference/template-spec.md](../../../docs/design/card-reference/template-spec.md): **한 장 = 질문 하나 → 한 줄 답 → 근거 문단**, 출처·기준 시점은 장마다(마지막 장에 출처).
- 레퍼런스에서 가져오는 것은 **배치·위계·장치뿐**. 사진·문구·로고·계정명은 쓰지 않는다.
- 장별 표(번호 · 역할 · 질문 · 한 줄 답 · 배경 장면)를 만들어 윤서에게 **한 번** 보여주고 OK 를 받은 뒤 만든다. 배경이 필요한 장은 장면 설명까지 적는다(`/gen-background` 가 쓴다).

## 2. 덱 만들기

```bash
node scripts/studio-cards.mjs create "덱 제목" --preset 4:5     # → id 가 나온다
```

새 덱에는 빈 장이 한 장 있다(`card: 0`). 나머지는 `add_card` 로 `id` 를 줘서 만든다(batch 안에서 그 id 로 가리킬 수 있다).

## 3. 장 채우기 (ops)

1. 작업 파일은 `.data/ops/<덱슬러그>-<번호>.json` 에 쓴다 (`.data/` 는 Git 에 안 올라간다). 형식은 op 배열 → 도우미가 batch 로 묶는다. **템플릿은 [docs/handoff/sample-deck.json](../../../docs/handoff/sample-deck.json)** (표지·질문→답·시나리오·출처 4장) — 복사해서 글·id 만 바꾼다.
2. 먼저 미리보기: `node scripts/studio-cards.mjs apply <덱 id> .data/ops/x.json --dry-run` → 오류 없으면 `--dry-run` 을 뺀다.
3. 한 번에 2~4장씩 나눠 적용한다 (한 batch 최대 200 op, 덱은 30장·장당 레이어 40개 한도).
4. 레이어 id 는 덱 안에서 겹치지 않게 `s3-title` 처럼 장 번호를 앞에 붙인다. 겹치면 `ID_EXISTS`.

레이아웃 감각 (4:5 = 1080×1350 기준, 좌표는 원본 픽셀):

| 요소 | 값 |
| --- | --- |
| 좌우 여백 | x 96, 폭 888 |
| 사진 배경 | 이미지 `x0 y0 w1080 h1350 fit cover` + 아래 덮개(`gradient to-top`, `opacity 0.85~0.9`, `gradFrom 0`, `gradTo 0.65~0.75`) |
| 글 자리 | 아래 40% (y 780~1250). 제목·질문 serif 70~92 · weight 800 / 답·본문 sans 40~44 · lineHeight 1.45 |
| 태그 | 스티커 `tag-kicker` (`label` 에 SAMPLE·Q1 등) |
| 텍스트 박스 높이 | 글자 크기 × 줄 수 × 1.3 보다 크게. 넘치면 화면에서 잘린다 |

## 4. 글 규칙

- 금지 표현(`presets/compliance/banned-expressions.yaml`: 「수익 보장」「무조건」「무료」「비밀 정보」 등)과 투자 권유·목표가·확률을 쓰지 않는다.
- 확인 안 된 수치·날짜·출처는 지어내지 않는다: `[기준 시점 입력]` `[링크 입력]`. 채널명·운영자·면책은 미정이라 확정하지 않는다. 초안 카드에는 `SAMPLE` 태그.
- 한 장 글은 짧게: 제목 2줄 이하, 한 줄 답 1~2줄, 근거 문단은 3줄 안팎.

## 5. 확인·마무리

1. `node scripts/studio-cards.mjs get <덱 id>` — 장 수와 레이어가 계획과 같은지 본다.
2. 윤서에게 `http://127.0.0.1:8930/cards?deck=<덱 id>` 를 알려준다. 화면 확인 없이 「보기 좋다」고 말하지 않는다 — 직접 보지 못했으면 「화면 미확인」이라고 쓴다.
3. 배경 사진이 필요하면 `/gen-background`. 끝나면 「내보내기 → PNG」 안내.
4. 오류가 나면 응답의 `code`·`path` 를 그대로 읽고 그 op 만 고친다 (`REVISION_CONFLICT` 는 도우미가 매번 최신 revision 을 읽으니 다시 실행하면 된다 — 윤서가 화면을 열어 고치는 중이었는지 확인).
