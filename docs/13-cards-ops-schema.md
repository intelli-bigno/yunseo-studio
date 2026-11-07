# 13. 카드뉴스 편집 명령 스키마 — `POST /api/cards/:id/ops`

상태: **구현됨**. 작성 2026-11-07. 형식은 릴스 명령([12-reels-ops-schema.md](12-reels-ops-schema.md))과 같다 — 봉투(`revision`·`op`·`requestId`·`clientId`·`dryRun`·`return`), 오류 모양(`{ error: { code, message, path?, details? }, revision }`), `effects`, `undo`.

카드 편집기(`/cards`)에서 손으로 하는 편집(장 만들기·복제·삭제·순서, 텍스트·덮개·이미지·스티커 놓기와 속성)은 전부 이 JSON 명령으로도 할 수 있다. AI(Claude Code·Codex·MCP 래퍼)는 덱을 이 명령으로 만든 뒤 사람이 화면에서 이어 고친다.

- 코드: 도메인 `packages/domain/src/cards-editor/ops.ts`(순수 적용기 `applyCardOp`) · 유스케이스 `packages/application/src/cards-editor/ops.ts` · 라우트 `apps/dashboard/src/app/api/cards/[file]/ops/route.ts`(폴더 이름 `[file]` 은 같은 단계 기존 라우트와 슬러그를 맞추려는 것 — 값은 덱 id).
- 덱 만들기는 기존 `POST /api/cards-decks {title?, preset?}` → `{ deck: { id }, revision: 1 }`. 그 id 로 ops 를 보낸다.

## 0. 원칙

1. **명령 하나 = 실행취소 단위 하나 = revision 하나.** 여러 변경을 하나로 묶으려면 `batch`.
2. **전부 아니면 전무.** 적용 뒤 덱 전체를 저장 검사(`parseDeck`)로 다시 본다. 하나라도 틀리면 저장하지 않고 revision 도 그대로다.
3. **좌표·크기는 카드 원본 픽셀**(규격 폭·높이 기준 — 4:5 = 1080×1350, 1:1 = 1080×1080, 9:16 = 1080×1920). 레이어 배열은 아래 → 위(0 이 맨 아래).
4. **id 는 호출자가 줄 수 있다**(`id`). 주면 그대로 쓰고(batch 안에서 뒤 op 가 참조), 없으면 서버가 만든다. 이미 있으면 `ID_EXISTS`.
5. **장 지정 `card`** 는 번호(0부터) 또는 장 id. batch 안에서 방금 만든 장은 id 로 가리킨다.
6. **장마다 독립.** 텍스트·덮개는 장의 레이어라 장마다 따로 고친다(덱 공통은 워터마크뿐).

## 1. 요청·응답

```
GET  /api/cards/:id/ops   → { id, revision, deck, undo: {available, redo}, stickers: [{id, name, group, aspect, hasLabel, label}] }
POST /api/cards/:id/ops   (Content-Type: application/json)
```

```json
{ "revision": 3, "clientId": "agent:claude", "requestId": "b8f0c1e2-…", "op": { "op": "add_card", "id": "c-2" } }
```

| 필드 | 필수 | 뜻 |
| --- | --- | --- |
| `revision` | 예 | 호출자가 본 revision. 다르면 `409 REVISION_CONFLICT`(응답 `revision` = 현재 값) |
| `op` | 예 | §3 의 op 하나(`batch` 도 하나) |
| `requestId` | 권장 | 멱등 키. 같은 덱·같은 키 재전송이면 저장 없이 처음 응답을 그대로 준다(서버 메모리 24시간) |
| `clientId` | 아니오 | 누가 고쳤나 — `editor-*` · `agent:<이름>` |
| `dryRun` | 아니오 | true 면 적용 결과(`deck`)만 주고 저장하지 않는다 |
| `return` | 아니오 | `"diff"` 면 응답에서 `deck` 을 뺀다(`effects` 만) |

성공 `200`:

```json
{ "revision": 4, "opId": "op-000004", "effects": { "created": ["c-2"], "updated": [], "removed": [] }, "deck": { "…": "전체 CardDeck" }, "warnings": [], "undo": { "available": true, "redo": false } }
```

실패(저장 없음):

```json
{ "error": { "code": "BATCH_FAILED", "message": "2번째 op 실패 — 레이어 t-9 없음", "path": "op.ops[2]", "details": { "index": 2, "cause": { "code": "LAYER_NOT_FOUND", "message": "…" } } }, "revision": 3 }
```

## 2. 오류 코드

| HTTP | code | 언제 |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | JSON 아님·`revision`/`op` 없음 |
| 400 | `UNKNOWN_OP` | op 이름이 목록에 없다 |
| 400 | `INVALID_ARGUMENT` | 인자 모양 틀림(`path` 에 위치) — 예: 모르는 스티커 id, `to` 범위 밖 |
| 404 | `DECK_NOT_FOUND` / `CARD_NOT_FOUND` / `LAYER_NOT_FOUND` | 대상 없음 |
| 409 | `REVISION_CONFLICT` | revision 이 낡았다 — GET 으로 다시 읽고 재시도 |
| 409 | `ID_EXISTS` | 준 id 가 이미 있다 |
| 409 | `NOTHING_TO_UNDO` / `NOTHING_TO_REDO` | 스택이 비었다 |
| 413 | `TOO_LARGE` | 요청 1MB 초과·batch 200개 초과 |
| 422 | `LIMIT_EXCEEDED` | 장 30장·장당 레이어 40개 초과, 마지막 장 삭제 |
| 422 | `INVALID_DECK` | 적용 결과가 덱 검사를 어긴다(값 범위·색 형식·이미지 주소). `details.errors` 에 칸 목록 |
| 422 | `BATCH_FAILED` | batch 안 op 실패. `details.index`·`details.cause` |

## 3. op 목록

| op | 인자 | 비고 |
| --- | --- | --- |
| `set_deck` | `title?, preset?("4:5"\|"1:1"\|"9:16"), watermark?(Partial<Watermark> \| null)` | 워터마크는 기존 값에 덮어쓴다, null = 끔 |
| `add_card` | `after?:CardRef, id?, background?:"#rrggbb"` | after 를 빼면 맨 뒤 |
| `duplicate_card` | `card, id?` | 바로 뒤에. 레이어 id 는 새로 받는다(`effects.created`) |
| `remove_card` | `card` | 마지막 한 장은 `LIMIT_EXCEEDED` |
| `move_card` | `card, to:number` | 끌어서 순서 바꾸기와 같다(to = 새 자리) |
| `set_card` | `card, background` | 장 바탕색 |
| `add_layer` | `card, layer:NewLayer, id?, index?` | index 를 빼면 맨 위 |
| `update_layer` | `card, layerId, patch` | `id`·`kind` 는 바꿀 수 없다(무시) |
| `remove_layer` | `card, layerId` | |
| `duplicate_layer` | `card, layerId, id?` | 바로 위에 24px 비켜서 |
| `reorder_layer` | `card, layerId, to:"front"\|"back"\|"forward"\|"backward"\|number` | |
| `batch` | `ops:Op[]`(≤200), `label?` | 중첩 batch·안쪽 undo/redo 금지 |
| `undo` / `redo` | — | 서버 메모리 기록(덱별 100단계). 통째 저장(PUT)이 끼면 기록을 버린다 |

### 3.1 레이어 칸 (`layer` 와 `patch` 에 쓰는 값)

공통: `name`(≤40) · `x, y, w, h`(원본 픽셀, w·h ≥ 24) · `rotation`(−180~180) · `hidden` · `locked`.

| kind | 칸 |
| --- | --- |
| `text` | `text`(≤2000, `\n` 줄바꿈) · `font`("sans"\|"serif"\|"mono") · `size`(12~400) · `weight`(300~900, 100 단위) · `letterSpacing`(−50~200) · `lineHeight`(0.8~3) · `color` · `align`("left"\|"center"\|"right") · `vAlign`("top"\|"middle"\|"bottom") · `margin`·`padding`(0~1000) · `boxColor` · `boxOpacity`(0~1, 0 = 배경 상자 없음) |
| `overlay` | `color` · `opacity`(0~1) · `gradient`("none"\|"to-top"\|"to-bottom"\|"to-left"\|"to-right"\|"radial") · `gradFrom`·`gradTo`(0~1, from < to — 진한 구간 끝 → 투명해지는 끝. radial 은 가운데 투명 → 가장자리 진함) · `blend`("normal"\|"multiply"\|"screen"\|"overlay"\|"soft-light"\|"darken"\|"lighten"\|"color") |
| `image` | `src`(필수, 같은 출처 `/api/…` 만) · `fit`("cover"\|"contain") · `posX`·`posY`(0~1 보이는 자리) · `zoom`(1~4) · `brightness`·`contrast`·`saturation`(0~2, 1 = 원본) · `blur`(0~50) · 만들 때만 `aspect?`(가로÷세로) `cx?, cy?`(가운데) `scale?`(카드 폭 대비) |
| `sticker` | `sticker`(필수, 라이브러리 id — GET 의 `stickers`) · `label`(≤80, `\n` 줄바꿈, 두 칸 스티커는 `왼쪽\|오른쪽`) · `fill`("#rrggbb"\|"none") · `labelColor` · `stroke` · `strokeWidth`(0~60) · `radius`(0~1) · `shadow`(0~1) · `opacity`(0~1) · 만들 때만 `cx?, cy?` |

색은 모두 `#rrggbb`(저장할 때 소문자).

### 3.2 스티커 라이브러리

`packages/domain/src/cards-editor/sticker-library.ts` — 10갈래 56종. 갈래: `tag`(라벨 태그) · `ribbon`(리본) · `number`(숫자 배지·등락 수치) · `quote`(인용) · `arrow`(화살표) · `highlight`(형광펜·밑줄·동그라미) · `bubble`(말풍선) · `stamp`(도장) · `frame`(프레임) · `accent`(장식). 모두 SVG 로 그려(외부 자원 없음) 화면과 PNG 내보내기가 같다. 예전 덱의 도형 스티커(`sticker: ""` + `shape`)는 그대로 읽고 그린다.

## 4. 예시 — AI 가 표지 한 장을 만든다

```json
{
  "revision": 1,
  "clientId": "agent:claude",
  "op": {
    "op": "batch",
    "label": "표지",
    "ops": [
      { "op": "set_deck", "title": "11월 FOMC 정리" },
      { "op": "add_layer", "card": 0, "id": "bg", "layer": { "kind": "image", "src": "/api/cards/01-cover.png" } },
      { "op": "add_layer", "card": 0, "id": "dim", "layer": { "kind": "overlay", "color": "#000000", "opacity": 0.85, "gradient": "to-top", "gradFrom": 0, "gradTo": 0.6 } },
      { "op": "add_layer", "card": 0, "id": "title", "layer": { "kind": "text", "text": "금리는 멈췄다\n시장은 아직이다", "font": "serif", "size": 96, "weight": 800, "y": 860, "h": 300 } },
      { "op": "add_layer", "card": 0, "id": "kicker", "layer": { "kind": "sticker", "sticker": "tag-kicker", "label": "FOMC", "cx": 260, "cy": 800 } },
      { "op": "add_card", "id": "p2" },
      { "op": "add_layer", "card": "p2", "layer": { "kind": "sticker", "sticker": "num-up", "label": "+0.25%p" } }
    ]
  }
}
```

텍스트 하나만 고치기:

```json
{ "revision": 2, "op": { "op": "update_layer", "card": 0, "layerId": "title", "patch": { "color": "#ffe14d", "letterSpacing": -2 } } }
```

## 5. 화면과의 관계

- 화면 편집기는 지금 덱 전체를 로컬에서 고치고 「저장」 때 `PUT /api/cards-decks/:id` 로 통째 저장한다(로컬 실행취소). 같은 순수 연산(`addCard`·`duplicateCard`·`moveCardTo`·`updateLayer`…)을 ops 적용기와 같이 쓴다.
- 화면이 열려 있는 동안 AI 가 ops 로 고치면 화면 저장이 `409` 로 막힌다 → 덱을 다시 불러온다. ops 쪽은 화면이 PUT 하면 실행취소 기록을 버린다.
