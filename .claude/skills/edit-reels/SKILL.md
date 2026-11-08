---
name: edit-reels
description: 릴스(9:16, 1080x1920) 타임라인을 JSON 명령(ops)으로 편집하고 MP4+SRT 로 내보낸다. 「릴스 편집」「릴스 만들어줘」「자막 넣어줘」「컷 자르기」「/edit-reels」 요청에 쓴다. 게시는 하지 않는다.
---

# 릴스 편집

릴스 편집기(`http://127.0.0.1:8930/reels`)의 모든 편집은 `POST /api/reels/:id/ops` 한 곳으로 모인다. 윤서는 화면에서, 너는 JSON 으로 같은 일을 한다. 명령 목록·오류 코드·타임라인 모델은 [docs/12-reels-ops-schema.md](../../../docs/12-reels-ops-schema.md) (먼저 §1 모델과 §4 op 표를 읽는다), 기능 범위는 [docs/11-palmier-feature-map.md](../../../docs/11-palmier-feature-map.md).

## 0. 필요한 것

- 서버: `bash scripts/start.sh --detach`
- **ffmpeg·ffprobe** (내보내기용). 없으면 `bash scripts/setup.sh --check` 가 경고한다.
- **편집 소스(sourceId)**: 아무 파일이나 못 쓴다. 편집기 「소스」 패널에 보이는 것만 쓴다.
  - 만들어 둔 쇼츠 영상·카드 그림: id 모양 `<원고id>/<renderId>/video`, `<원고id>/<renderId>/<카드파일>` (`/shorts` 와 콘텐츠 파이프라인에서 렌더한 것)
  - 오디오: `assets/audio/bgm/` · `assets/audio/narration/` 안에 윤서가 직접 mp3·wav·m4a·ogg·flac 파일을 넣는다(파일명은 영문·숫자·`-`·`_`·`.`, 64자 이하). id 는 `audio/bgm/<파일>` · `audio/narration/<파일>`.
  - 소스가 하나도 없으면 먼저 윤서에게 무엇을 쓸지 묻는다. 소스를 지어내지 않는다.

## 1. 프로젝트 만들기·읽기

```bash
BASE=http://127.0.0.1:8930
curl -s $BASE/api/reels/projects                                    # 목록 { projects: [...] }
curl -s -X POST $BASE/api/reels/projects -H 'content-type: application/json' -d '{}'   # 빈 프로젝트 → { id, revision }
curl -s $BASE/api/reels/<id>/ops                                    # 현재 project + revision
```

## 2. 편집 (ops)

```bash
curl -s $BASE/api/reels/<id>/ops | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).revision'   # 지금 revision
curl -s -X POST $BASE/api/reels/<id>/ops -H 'content-type: application/json' --data @.data/ops/reel-1.json
```

`.data/ops/reel-1.json` 의 모양 (문서 §2) — `revision` 에 위에서 읽은 값을 넣는다:

```json
{ "revision": 12, "clientId": "agent:claude", "requestId": "<새 UUID>", "dryRun": true,
  "op": { "op": "batch", "label": "컷 정리", "ops": [ { "op": "split", "clipId": "c-01", "at": 4200 } ] } }
```

- `revision` 은 방금 읽은 값. 다르면 `409 REVISION_CONFLICT` — 다시 읽고 재시도한다.
- 처음엔 **`dryRun: true` 로 미리보기** → 오류(`error.code`·`error.path`)가 없으면 `dryRun` 을 빼고 보낸다. 실패하면 아무것도 저장되지 않는다(전부 아니면 전무).
- 시간은 **정수 ms**, 위치·크기는 캔버스 비율(0~1). 여러 변경은 `batch`(≤200) 로 묶어 실행취소 한 번에 되돌릴 수 있게 한다.
- 자주 쓰는 op: `add_clip` · `trim` · `split` · `ripple_delete` · `move` · `set_speed` · `add_text` · `import_srt` · `auto_place_subtitles` · `set_volume` · `set_fade` · `set_transition` · `set_color` · `undo` / `redo`. 인자는 문서 §4 표 그대로 쓴다.
- 자막 글은 투자 권유·금지 표현(`presets/compliance/banned-expressions.yaml`)을 피하고, 확인 안 된 수치는 `[…]` 자리표시로 둔다.

## 3. 내보내기

```bash
curl -s -X POST $BASE/api/reels/<id>/export     # → { revision, video, srt, durationMs, warnings, … } (ffmpeg 합성 — 수십 초 걸릴 수 있다)
```

- 응답의 `video`(MP4)·`srt` 경로가 결과물이다. `warnings` 는 윤서에게 그대로 전한다. `RENDER_FAILED`·「원본 파일이 없는 클립」이면 sourceId 가 실제 있는지, ffmpeg 가 있는지부터 본다.
- 끝나면 `ffprobe` 로 길이·해상도(1080×1920)를 재서 말한다. 영상을 눈으로 못 봤으면 「화면 미확인」.
- **업로드(Instagram·YouTube)는 하지 않는다.** 파일 위치를 윤서에게 알려 주고 끝낸다.
