---
name: add-reference
description: 카드뉴스 레퍼런스(마음에 든 카드 이미지)를 대시보드 레퍼런스 목록(refs.json)에 추가한다. 「레퍼런스 추가」「이 카드 레퍼런스에 넣어줘」「참고 카드 저장」「/add-reference」 요청에 쓴다. 내부 참고 전용 — 게시·재배포 금지.
---

# 레퍼런스 추가

목록 정본은 `docs/design/card-reference/refs.json` (JSON 배열). 대시보드 `/references` 와 카드 편집기의 「레퍼런스」 이미지 목록이 이 파일을 읽는다. 수집 규칙·현황은 [docs/design/card-reference/collection.md](../../../docs/design/card-reference/collection.md).

## 원칙

- **내부 참고 전용.** 그림 파일을 저장소에 복사하지 않는다 — 원 이미지 주소(`https://…`)만 적는다. 재게시·상업 이용 금지, 구조(배치·위계·장치)만 차용한다.
- 로그인이 필요한 페이지를 대신 열거나 계정으로 무언가를 하지 않는다. 윤서가 준 링크·이미지 주소만 쓴다.

## 한 건의 모양

```json
{
  "id": "ref-120",
  "set": "사진 전면 표지",
  "source": "pinterest",
  "title": "계정 또는 한 줄 제목",
  "takeaway": "표지 · 인물 · 하단 그라데이션 · 굵은 고딕",
  "tags": ["표지", "하단 그라데이션", "4:5"],
  "thumb": "https://i.pinimg.com/736x/xx/xx/xx/xxxxxxxx.jpg",
  "href": "https://원본 게시물 주소"
}
```

| 칸 | 규칙 |
| --- | --- |
| `id` | 필수·겹치지 않게. 기존 마지막 번호 + 1 (`ref-NNN`) |
| `set` | 묶음 이름 — 기존 묶음(`사진 전면 표지`·`사진+질문답 본문`·`질문·답 말풍선` 등)에 맞으면 그대로, 아니면 새로 |
| `source` | `instagram` 또는 `pinterest` (둘 다 아니면 `pinterest` 로 읽힌다) |
| `thumb` | **`https://` 로 시작해야 한다.** 편집기 캔버스에 넣을 수 있는 건 `https://i.pinimg.com/` 그림뿐이다 (다른 주소는 목록에서 보이기만 하고 덱에는 못 넣는다) |
| `href` | 필수 `https://`. 원본 게시물 (없으면 `pin` 칸에 핀 주소를 넣어도 된다) |
| `title` | 길면 줄여도 되지만 **글자(코드포인트) 단위로** 자른다 — `slice`·`[:N]` 은 이모지를 반으로 갈라 깨진 글자(`\ud83e`)를 남긴다. 자를 땐 `[...title].slice(0, N).join("").trimEnd()` |
| `takeaway` | 구조를 한 줄로: 무엇이 어디에 어떤 위계로 — 카피 문구를 옮겨 적지 않는다 |
| `tags` | 많이 쓰이는 태그를 재사용한다 (`/references` 필터가 태그별로 모은다) |

## 절차

1. 윤서에게 받은 것(링크·이미지 주소·한 줄 메모)으로 항목을 만든다. 모르는 칸을 지어내지 않는다 — `thumb`·`href` 가 없으면 윤서에게 되묻는다.
2. `refs.json` 끝에 항목을 **추가**만 한다 (기존 항목은 고치지 않는다). 들여쓰기·형식은 기존 파일과 맞춘다.
3. JSON 이 깨지지 않았는지 확인: `node -e "const a=JSON.parse(require('fs').readFileSync('docs/design/card-reference/refs.json','utf8'));console.log(a.length,'건')"`
4. **서버를 다시 켠다** (`bash scripts/start.sh --stop && bash scripts/start.sh --detach`) — 목록을 프로세스 안에 기억해 두기 때문에 파일만 고치면 안 보인다.
5. `http://127.0.0.1:8930/references` 에서 새 항목이 보이는지 확인하고 윤서에게 알린다. 확인 못 했으면 「화면 미확인」.
6. 수집 건수가 달라졌으면 [collection.md](../../../docs/design/card-reference/collection.md) 수집 기록 표에 한 줄 덧붙인다(기존 줄 수정 금지, 날짜 포함).
