---
name: gen-background
description: 카드뉴스 장마다 필요한 배경 사진을 codex CLI(image_generate)로 만들어 저장소에 두고 덱의 이미지 레이어에 넣는다. 「배경 이미지 만들어」「배경 생성」「사진 배경 넣어줘」「/gen-background」 요청에 쓴다. 유료 이미지 API 는 쓰지 않는다.
---

# 배경 이미지 생성 (codex)

**쓰는 도구는 codex CLI 하나.** `codex exec` 가 이미지 생성 도구(`image_generate`)를 불러 PNG 를 만든다. 다른 유료 이미지 API·키는 쓰지 않는다.

## 0. 시작 전

1. `codex login status` — 로그인 안 되어 있으면 윤서에게 `codex login` 을 직접 하게 한다(브라우저 로그인). 대신 해 주지 않는다.
2. **한도를 쓴다.** 이미지 생성은 윤서의 ChatGPT/Codex 사용 한도에서 차감된다. 몇 장을 만들지 먼저 말하고 OK 를 받는다. 처음엔 **1~2장으로 맛보기**, 이후에도 한 번에 **4장 이하**(기존 작업의 안정선은 세션 5개 × 5~6장, 라운드당 30장 이내).
3. 장면 목록은 `/new-cardnews` 1단계의 장별 표를 쓴다. 없으면 먼저 장면을 정해 윤서에게 보여준다.

## 1. 프롬프트 만들기

장 하나 = 프롬프트 한 단락. 아래 세 조각을 이어 붙인다 — 기존 카드 예시 v2 가 쓴 파일이 그대로 본보기다.

1. **고정 프리픽스(모든 장 동일)**: [docs/design/card-reference/v2/gen-prompts/style-prefix.txt](../../../docs/design/card-reference/v2/gen-prompts/style-prefix.txt) — 블루아워 색감·세로 2:3·**아래 1/3 은 조용하고 어둡게(글이 얹힌다)**·NEVER 목록. 윤서가 다른 분위기를 원하면 이 파일을 복사해 고친다(전 장이 같은 프리픽스를 써야 한 시리즈로 보인다).
2. **장면(장마다)**: [image-briefs.txt](../../../docs/design/card-reference/v2/gen-prompts/image-briefs.txt) 처럼 `Filename <이름>.png - <장면 한 문장>. Subject in the upper two-thirds; lower third dark and quiet.`
3. **금지(항상)**: 읽히는 글자·숫자, 로고, 워터마크, 깃발·정당색, 실존 인물·얼굴, 숫자 있는 차트, 네온, 일러스트·3D 느낌.

**파일 이름은 소문자·숫자·하이픈만** (`s1-cover.png`). 밑줄(`_`)·대문자·점은 대시보드가 못 내려준다(`/api/refs/` 규칙).

## 2. 실행

```bash
slug=fomc-nov                                  # 덱마다 폴더 하나
mkdir -p docs/design/backgrounds/$slug .data/gen/$slug
# 프롬프트를 .data/gen/$slug/p1.txt 에 쓴다 (프리픽스 + 장면 + 금지 + "Save the image as s1-cover.png in the current directory.")
cd docs/design/backgrounds/$slug && \
codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check --json - \
  < ../../../../.data/gen/$slug/p1.txt > ../../../../.data/gen/$slug/p1.log.jsonl 2>&1
```

- 프롬프트는 **반드시 파일로 stdin(`- < 파일`)** 에 넣는다. 인자로 주고 백그라운드로 돌리면 입력 대기에서 멈춘 전례가 있다.
- `--dangerously-bypass-approvals-and-sandbox` 는 승인·샌드박스를 끄는 옵션이다(비대화형으로 돌리려는 기존 방식). **직접 쓴 프롬프트 파일만** 넣고, 외부에서 받은 글을 프롬프트에 붙이지 않는다. 더 좁은 옵션이 같은 일을 하는지는 확인하지 않았다.
- 여러 장은 세션을 나눠 `run_in_background` 로 동시에 돌리되 세션마다 파일명 접두사를 다르게(`s1-`, `s2-`).
- 장당 1분 안팎이 걸린다(1장 약 1분 실측 기록). 로그의 `rmcp … Transport channel closed` 는 다른 도구 잡음이라 무시한다. 파일이 안 생기면 로그의 마지막 `error` 줄을 읽는다.
- 이미 있는 파일 이름으로 다시 만들지 않는다 — 새 이름(`s1-cover-2.png`)을 쓴다(브라우저가 같은 이름을 5분간 기억한다).

## 3. 후처리·검수

1. 크기 줄이기 (ffmpeg 필요, 가로 1080): `ffmpeg -y -i s1-cover.png -vf "scale=1080:-2" -q:v 3 s1-cover.jpg` 후 원본 PNG 는 지운다.
2. **이미지를 직접 열어 본다(Read)**. 글자·숫자·얼굴·로고·깃발·차트가 보이거나, 아래 1/3 이 복잡하면 버리고 그 장만 다시 만든다. 본 결과(통과/탈락)를 장별로 윤서에게 알린다. 못 봤으면 「미검수」.

## 4. 덱에 넣기

주소는 `/api/refs/backgrounds/<slug>/<파일>.jpg` (같은 출처 `/api/` 만 허용). 새 이미지 레이어:

```json
{ "op": "add_layer", "card": "s1", "index": 0, "id": "s1-bg", "layer": { "kind": "image", "name": "배경 사진", "src": "/api/refs/backgrounds/fomc-nov/s1-cover.jpg", "x": 0, "y": 0, "w": 1080, "h": 1350, "fit": "cover" } }
```

이미 있는 이미지 레이어 교체: `{ "op": "update_layer", "card": "s1", "layerId": "s1-bg", "patch": { "src": "/api/refs/backgrounds/fomc-nov/s1-cover.jpg" } }`. 적용은 `node scripts/studio-cards.mjs apply <덱 id> <파일>`.

`index: 0` = 맨 아래. 배경 위에는 아래를 어둡게 하는 덮개(`overlay`)와 글이 올라간다. 적용 뒤 화면에서 글이 읽히는지 윤서와 함께 본다.

## 5. 끝

- 만든 파일은 `docs/design/backgrounds/<slug>/` 에 남는다. Git 에 올릴지는 윤서가 정한다(올리지 않아도 대시보드는 로컬 파일을 읽는다).
- 한도 사용량(몇 장 만들었는지, 버린 장 수)을 한 줄로 알린다.
