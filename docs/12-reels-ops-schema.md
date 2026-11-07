# 12. 릴스 편집 명령 스키마 — `POST /api/reels/:id/ops`

상태: **설계안(구현 전)**. 작성 2026-11-07. 기능 범위·근거는 [11-palmier-feature-map.md](11-palmier-feature-map.md).

이 문서는 릴스 편집기의 **계약(인터페이스)** 이다. 화면(`ReelsEditor`)·에이전트(Claude Code·Codex·MCP 래퍼)·테스트가 모두 같은 JSON 명령으로 타임라인을 고친다. 지금의 「프로젝트 통째 PUT」은 남기되(가져오기·복구용), 편집은 전부 op 로 옮긴다.

## 0. 원칙

1. **명령 하나 = 실행취소 단위 하나 = revision 하나.** 여러 변경을 하나로 묶으려면 `batch`.
2. **전부 아니면 전무.** op(또는 batch 안 op 하나라도)가 실패하면 저장하지 않고 revision 도 그대로다.
3. **시간은 정수 ms**(v1 과 같음). 프레임 반올림은 렌더 때 한 번만 한다(Palmier `source:[초]` 반올림 빈틈 함정을 피함).
4. **공간은 캔버스 비율(0~1) + 중심점.** 픽셀은 렌더 어댑터만 안다.
5. **순수 함수.** op 적용은 `applyOp(project, op) → {project, inverse, effects}` 순수 함수(도메인 패키지). 라우트는 읽기 → 적용 → 검사 → 저장만 한다.
6. **id 는 호출자가 줄 수 있다.** 새 클립·트랙 id 를 요청에 넣으면 그대로 쓰고(멱등 재시도·batch 안 참조용), 없으면 서버가 만든다.

## 1. 타임라인 모델 (v2)

```ts
// packages/domain/src/reel/timeline.ts (신규 — 지금 apps/dashboard/src/lib/reels-timeline.ts 를 옮겨 온다)
type Ms = number;          // 정수, 0 이상
type Unit = number;        // 0~1 캔버스 비율

interface ReelsProjectV2 {
  version: 2;
  title: string;                       // 1~80자
  canvas: { width: 1080; height: 1920; fps: 30 };  // 지금은 고정(ReelPreset 값)
  tracks: Track[];                     // 배열 순서 = 아래→위 쌓임(뒤가 위)
  clips: Clip[];                       // ≤ 2000
}

type TrackKind = "video" | "text" | "subtitle" | "audio" | "overlay";

interface Track {
  id: string;            // ≤ 64자
  kind: TrackKind;
  name: string;          // ≤ 40자
  muted?: boolean;       // audio·video 의 소리
  hidden?: boolean;      // video·text·subtitle·overlay 의 그림
  locked?: boolean;      // true 면 이 트랙 클립을 고치는 op 가 TRACK_LOCKED
  volumeDb?: number;     // 트랙 전체 볼륨 −60~+12, 기본 0
}

interface Clip {
  id: string;
  trackId: string;
  start: Ms;             // 타임라인 시작
  in: Ms;                // 원본 안 시작점(v1 offset)
  out: Ms;               // 원본 안 끝점(배타). 원본 없는 클립(text·subtitle·component)은 in=0, out=길이
  speed: number;         // 0.25~4, 기본 1. 타임라인 길이 = round((out − in) / speed)
  sourceId?: string;     // video·image·audio 원본(ReelsSource.id)
  sourceKind?: "video" | "image" | "audio";
  sourceMs?: Ms;         // 원본 길이 — out 상한. image 는 없음(무한)
  text?: TextBody;       // text·subtitle 트랙
  component?: Component; // overlay 트랙
  transform?: Transform; // 그림이 있는 클립
  keyframes?: Keyframe[];
  color?: Color;         // video·overlay(image)
  audio?: { volumeDb: number; fadeInMs: Ms; fadeOutMs: Ms; fadeCurve: "linear" | "ease" };
  transition?: Transition; // 이 클립 「앞」 경계의 전환(같은 트랙 직전 클립과)
}

interface Transform { cx: Unit; cy: Unit; scale: number; rotation: number; opacity: number }
// 기본 {cx:.5, cy:.5, scale:1, rotation:0, opacity:1}. scale 은 「캔버스를 꽉 채운(cover) 크기」 대비 배율

type KeyProp = "cx" | "cy" | "scale" | "rotation" | "opacity" | "volumeDb";
interface Keyframe { id: string; prop: KeyProp; at: Ms /* 클립 시작 기준 */; value: number; ease: "linear" | "ease-in-out" | "hold" }

interface Color {
  brightness: number;   // −1~1, 기본 0
  contrast: number;     // −1~1, 기본 0
  saturation: number;   // −1~1, 기본 0 (−1 = 흑백)
  temperature: number;  // −1~1, 기본 0 (+ 따뜻)
  lut?: { id: string; strength: number /* 0~1 */ } | null; // id = 등록된 LUT 이름(서버 목록)
}

interface Transition { kind: "cut" | "crossfade" | "dip" | "slide"; durationMs: Ms; direction?: "left" | "right" | "up" | "down" }
// kind/기본 길이 = domain/reel/preset.ts REEL_TRANSITIONS · REEL_TRANSITION_SEC

interface TextBody {
  value: string;                  // ≤ 500자, 줄바꿈 \n
  style: string;                  // 자막·텍스트 프리셋 이름("viral-white" | "viral-yellow" | "card-title" …)
  runs?: { from: number; to: number; color?: string; bold?: boolean }[]; // P1 단어별 스타일
  box?: { cx: Unit; cy: Unit; w: Unit };                                // 없으면 프리셋 자리(자막 = subtitleBox)
}

type Component =
  | { type: "sticker";   assetId: string }
  | { type: "watermark"; assetId: string; corner: "tl" | "tr" | "bl" | "br"; marginPx?: number }
  | { type: "card";      sourceId: string }            // 렌더 카드 그림(4:5)을 위에 얹기
  | { type: "title" | "badge" | "cta"; text: string }; // v1 컴포넌트 3종(마이그레이션)
```

### 1.1 불변식(저장 전 검사 — 위반이면 `INVALID_PROJECT`)

| # | 규칙 |
| --- | --- |
| I1 | 한 트랙 안에서 클립이 겹치지 않는다. 단, `transition.kind != "cut"` 인 경계는 `durationMs` 만큼 겹치는 것을 허용한다 |
| I2 | 트랙 종류와 클립이 맞는다: video←video/image · audio←audio · text/subtitle←`text` · overlay←`component` 또는 image |
| I3 | `0 ≤ in < out`, `sourceMs` 가 있으면 `out ≤ sourceMs` |
| I4 | 타임라인 길이 `≥ 100ms`(REELS_MIN_CLIP_MS), 끝 `≤ 180000ms`(REELS_MAX_MS) |
| I5 | 키프레임 `0 ≤ at ≤ 타임라인 길이`, 같은 prop·at 중복 없음 |
| I6 | `fadeInMs + fadeOutMs ≤ 타임라인 길이`(Palmier 와 같은 규칙) |
| I7 | 전환 `durationMs ≤ min(앞 클립, 이 클립) / 2` |
| I8 | 자막 트랙 클립의 줄 수 ≤ 프리셋 `subtitle.maxLines`(기본 2) — 넘으면 거부가 아니라 `warnings` |

## 2. 요청·응답

```
POST /api/reels/:id/ops
Content-Type: application/json
```

요청:

```json
{
  "revision": 12,
  "clientId": "editor-7f3a",
  "requestId": "b8f0c1e2-0d4c-4d8e-9a55-1f2e3d4c5b6a",
  "op": { "op": "split", "clipId": "c-01", "at": 4200 }
}
```

| 필드 | 필수 | 뜻 |
| --- | --- | --- |
| `revision` | 예 | 호출자가 본 revision. 서버 값과 다르면 `409 REVISION_CONFLICT` |
| `op` | 예 | §4 의 op 하나(`batch` 도 하나) |
| `requestId` | 권장 | 멱등 키(UUID). 같은 키 재전송이면 저장 없이 **처음 응답을 그대로** 돌려준다(24시간 보관) |
| `clientId` | 아니오 | 누가 고쳤나(op 로그에 남김). `editor-*` · `agent:<이름>` |
| `dryRun` | 아니오 | true 면 적용 결과만 돌려주고 저장하지 않는다(에이전트 미리보기) |

성공 응답 `200`:

```json
{
  "revision": 13,
  "opId": "op-000013",
  "effects": { "created": ["c-01b"], "updated": ["c-01"], "removed": [] },
  "project": { "...": "전체 ReelsProjectV2 — return:\"diff\" 를 주면 생략" },
  "warnings": [],
  "undo": { "available": true, "redo": false }
}
```

- `effects` 는 화면이 부분 갱신하고, 에이전트가 새 id 를 알기 위한 것이다.
- 요청에 `"return": "diff"` 면 `project` 대신 `changed: { clips: Clip[], tracks: Track[] }`(바뀐 것만)를 준다.

실패 응답(전부 같은 모양, 저장 없음):

```json
{
  "error": { "code": "CLIP_OVERLAP", "message": "영상 트랙: c-02·c-03 겹침", "path": "op.start", "details": { "trackId": "t-video", "with": "c-03" } },
  "revision": 12
}
```

## 3. 오류 코드

| HTTP | code | 언제 |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | JSON 이 아니거나 `revision`·`op` 없음 |
| 400 | `UNKNOWN_OP` | `op` 이름이 목록에 없다 |
| 400 | `INVALID_ARGUMENT` | 인자 모양·범위 틀림(`path` 에 위치) |
| 404 | `PROJECT_NOT_FOUND` | `:id` 없음 |
| 404 | `CLIP_NOT_FOUND` / `TRACK_NOT_FOUND` / `KEYFRAME_NOT_FOUND` / `SOURCE_NOT_FOUND` | 대상 id 없음 |
| 409 | `REVISION_CONFLICT` | `revision` 이 낡았다. 응답 `revision` = 현재 값. 다시 읽고 재시도 |
| 409 | `ID_EXISTS` | 호출자가 준 새 id 가 이미 있다 |
| 409 | `NOTHING_TO_UNDO` / `NOTHING_TO_REDO` | 스택이 비었다 |
| 422 | `TRACK_KIND_MISMATCH` | I2 위반(예: 자막을 영상 트랙에) |
| 422 | `TRACK_LOCKED` | 잠긴 트랙을 고치려 함 |
| 422 | `CLIP_OVERLAP` | I1 위반 |
| 422 | `OUT_OF_RANGE` | I3·I4·I5·I6·I7 위반(시간·원본 범위) |
| 422 | `SPLIT_AT_EDGE` | 자르는 점이 클립 시작·끝에서 100ms 안 |
| 422 | `INVALID_PROJECT` | 적용 결과가 §1.1 을 어긴다(위 코드로 못 좁힌 나머지) |
| 422 | `SRT_PARSE_ERROR` | `import_srt` 본문을 못 읽음(`details.line`) |
| 422 | `BATCH_FAILED` | batch 안 op 실패. `details.index` = 몇 번째, `details.cause` = 그 op 의 error |
| 413 | `TOO_LARGE` | 요청 1MB 초과·batch 200개 초과 |

## 4. op 목록

공통: 모든 op 는 `{ "op": "<이름>", ... }`. 시간 인자는 정수 ms. `ripple: true` 를 받는 op 는 같은 트랙의 뒤 클립을 함께 민다(다른 트랙은 안 민다 — 잠금·연결은 P1 `link_clips`).

| op | P | 인자 | inverse(실행취소에 저장) |
| --- | --- | --- | --- |
| `add_clip` | P0 | `trackId, sourceId?, start?, in?, out?, id?, mode:"place"\|"insert"` | `remove_clip` |
| `remove_clip` | P0 | `clipId, ripple?` | `add_clip`(원본 그대로) |
| `trim` | P0 | `clipId, edge:"start"\|"end", to:Ms, ripple?` | 이전 start/in/out |
| `split` | P0 | `clipId, at:Ms(타임라인), newId?` | 두 조각 합치기 |
| `ripple_delete` | P0 | `trackIds?:string[], ranges:[{from,to}]` | 지운 조각·밀린 시간 복원 |
| `move` | P0 | `clipId, start:Ms, trackId?` | 이전 start/trackId |
| `set_speed` | P0 | `clipId, speed, keepEnd?:false` | 이전 speed |
| `set_transform` | P0 | `clipId, transform:Partial<Transform>` | 이전 transform |
| `add_text` | P0 | `trackId, start, durationMs, text:TextBody, id?` | `remove_clip` |
| `update_text` | P0 | `clipId, text:Partial<TextBody>` | 이전 text |
| `import_srt` | P0 | `trackId, srt:string, offsetMs?, style?, replace?:false` | 넣은 클립 지우기(+replace 면 이전 클립 복원) |
| `auto_place_subtitles` | P0 | `trackId, script:string, audioClipId, style?, maxLines?:2, silence?:{noiseDb:-38, minMs:100}` | 같음 |
| `set_volume` | P0 | `clipId? \| trackId?, volumeDb` | 이전 값 |
| `set_fade` | P0 | `clipId, inMs?, outMs?, curve?` | 이전 값 |
| `add_component` | P0 | `trackId, start, durationMs, component:Component, transform?, id?` | `remove_clip` |
| `set_transition` | P0 | `clipId, transition:Transition \| null` | 이전 값 |
| `set_color` | P0 | `clipId, color:Partial<Color>` | 이전 color |
| `add_keyframe` | P0 | `clipId, prop, at, value, ease?, id?` (같은 prop·at 이면 값 교체) | `remove_keyframe` 또는 이전 값 |
| `remove_keyframe` | P0 | `clipId, keyframeId` | `add_keyframe` |
| `add_track` / `remove_track` / `set_track` | P0 | `kind, name?, id?, index?` / `trackId` / `trackId, muted?, hidden?, locked?, name?, index?, volumeDb?` | 반대 op |
| `undo` | P0 | — (또는 `steps?:1`) | — |
| `redo` | P0 | — | — |
| `batch` | P0 | `ops: Op[]`(≤200, `undo`·`redo`·`batch` 중첩 금지), `label?` | 안 op 들의 inverse 를 거꾸로 |

### 4.1 op 별 예시

아래 예시는 요청의 `op` 칸만 적는다(봉투는 §2). 응답은 특별한 것만 적는다.

**add_clip** — 빈 곳에 놓기. `start` 를 빼면 트랙 끝에 붙인다. `in`·`out` 을 빼면 원본 전체(영상) 또는 기본 길이(이미지 3000ms, `REELS_DEFAULT_MS`).
```json
{ "op": "add_clip", "trackId": "t-video", "sourceId": "S-251104-ab12/9f3c2a/video", "start": 0, "in": 2000, "out": 7000, "id": "c-01" }
```
```json
{ "revision": 13, "opId": "op-000013", "effects": { "created": ["c-01"], "updated": [], "removed": [] }, "warnings": [] }
```
`mode:"insert"` 면 `start` 뒤 클립들을 이 클립 길이만큼 민다. `place` 에서 겹치면 `CLIP_OVERLAP`(자동으로 빈 곳을 찾지 않는다 — 화면은 `firstFreeStart` 로 미리 계산해서 보낸다).

**trim** — 앞을 4200ms 로 당긴다(원본 `in` 도 같은 양 × speed 만큼 움직인다).
```json
{ "op": "trim", "clipId": "c-01", "edge": "start", "to": 4200 }
```

**split** — 타임라인 4200ms 에서 자르기. 오른쪽 조각이 `newId`. 키프레임은 시간대로 나눠 갖고, 앞 조각의 `transition` 은 앞 조각에 남는다.
```json
{ "op": "split", "clipId": "c-01", "at": 4200, "newId": "c-01b" }
```
```json
{ "revision": 14, "effects": { "created": ["c-01b"], "updated": ["c-01"], "removed": [] } }
```

**ripple_delete** — 여러 트랙에서 같은 구간을 잘라내고 뒤를 당긴다. `trackIds` 를 빼면 잠기지 않은 모든 트랙.
```json
{ "op": "ripple_delete", "ranges": [{ "from": 3000, "to": 3800 }, { "from": 9100, "to": 9400 }] }
```

**move**
```json
{ "op": "move", "clipId": "c-03", "start": 12000, "trackId": "t-video-2" }
```

**set_speed** — 길이는 `(out−in)/speed`. `keepEnd:true` 면 끝 시각을 고정하고 start 를 옮긴다. 결과가 뒤 클립과 겹치면 `CLIP_OVERLAP`.
```json
{ "op": "set_speed", "clipId": "c-02", "speed": 1.5 }
```

**set_transform**
```json
{ "op": "set_transform", "clipId": "c-05", "transform": { "cx": 0.5, "cy": 0.35, "scale": 1.2 } }
```

**add_text**
```json
{ "op": "add_text", "trackId": "t-text", "start": 0, "durationMs": 2600, "text": { "value": "아… 허리야", "style": "viral-yellow", "box": { "cx": 0.5, "cy": 0.3, "w": 0.86 } }, "id": "x-01" }
```

**update_text**
```json
{ "op": "update_text", "clipId": "x-01", "text": { "value": "아… 허리야\n욕조 닦기 너무 힘들어" } }
```

**import_srt** — SRT 큐 하나 = 자막 클립 하나. `replace:true` 면 그 트랙의 기존 클립을 먼저 지운다. 파서는 `domain/reel/srt.ts` 를 쓴다.
```json
{ "op": "import_srt", "trackId": "t-sub", "srt": "1\n00:00:00,170 --> 00:00:02,810\n아… 허리야\n\n2\n00:00:02,900 --> 00:00:05,400\n욕조 닦기 진짜 힘들죠\n", "style": "viral-white", "replace": true }
```
```json
{ "revision": 15, "effects": { "created": ["sub-0001", "sub-0002"], "updated": [], "removed": [] }, "warnings": [] }
```

**auto_place_subtitles** — 대본 원문을 음성 클립의 무음 경계로 나눠 놓는다(음성 인식 아님 — ss-shorts-edit 규칙). 서버가 ffmpeg `silencedetect` 로 문장 구간을 재고, 한 문장 안 조각은 글자 수 비례로 나눈다. 대본 문장 수와 무음 구간 수가 다르면 `warnings` 에 적고 가까운 쪽으로 맞춘다.
```json
{ "op": "auto_place_subtitles", "trackId": "t-sub", "audioClipId": "a-voice", "script": "아… 허리야.\n욕조 닦기 진짜 힘들죠.\n그래서 이걸로 바꿨거든요.", "style": "viral-white", "maxLines": 2 }
```
```json
{ "revision": 16, "effects": { "created": ["sub-0003", "sub-0004", "sub-0005"] }, "warnings": ["subtitle/segments: 대본 3문장 · 무음 구간 4개 — 마지막 두 구간을 합침"] }
```
P0 는 동기 처리(음성 3분 이하). 오래 걸리면 P1 에서 `202 + jobId` 로 바꾼다.

**set_volume** — 클립 또는 트랙 하나(둘 다 주면 `INVALID_ARGUMENT`).
```json
{ "op": "set_volume", "trackId": "t-bgm", "volumeDb": -18 }
```

**set_fade**
```json
{ "op": "set_fade", "clipId": "a-bgm", "inMs": 500, "outMs": 1500, "curve": "ease" }
```

**add_component** — 스티커·워터마크·카드. `assetId` 는 서버가 등록한 그림(P0: 저장소 `assets/` 목록, 업로드 P1).
```json
{ "op": "add_component", "trackId": "t-overlay", "start": 0, "durationMs": 30000, "component": { "type": "watermark", "assetId": "logo-white", "corner": "br", "marginPx": 48 } }
```
```json
{ "op": "add_component", "trackId": "t-overlay-2", "start": 9600, "durationMs": 3000, "component": { "type": "card", "sourceId": "S-251104-ab12/9f3c2a/03-key-point.png" }, "transform": { "cx": 0.5, "cy": 0.42, "scale": 0.8 } }
```

**set_transition** — 클립 「앞」 경계. `null` 이면 컷.
```json
{ "op": "set_transition", "clipId": "c-02", "transition": { "kind": "crossfade", "durationMs": 500 } }
```
전환을 걸면 앞 클립 끝과 이 클립 시작이 `durationMs` 만큼 겹치도록 **이 클립과 뒤 클립을 당긴다**(ripple). 원본 여유(in/out)가 모자라면 `OUT_OF_RANGE`.

**set_color**
```json
{ "op": "set_color", "clipId": "c-01", "color": { "brightness": 0.05, "contrast": 0.1, "saturation": -0.1, "temperature": 0.15, "lut": { "id": "film-warm", "strength": 0.6 } } }
```

**add_keyframe** — 줌(spec `zoom:[1.25, 1.08, 0.5, 0.35]`)은 batch 로 4개.
```json
{ "op": "batch", "label": "줌 아웃", "ops": [
  { "op": "add_keyframe", "clipId": "c-01", "prop": "scale", "at": 0,    "value": 1.25, "ease": "ease-in-out" },
  { "op": "add_keyframe", "clipId": "c-01", "prop": "scale", "at": 1067, "value": 1.08 },
  { "op": "add_keyframe", "clipId": "c-01", "prop": "cx",    "at": 0,    "value": 0.5,  "ease": "hold" },
  { "op": "add_keyframe", "clipId": "c-01", "prop": "cy",    "at": 0,    "value": 0.35, "ease": "hold" }
] }
```

**undo / redo**
```json
{ "op": "undo" }
```
```json
{ "revision": 18, "opId": "op-000018", "effects": { "created": [], "updated": ["c-01"], "removed": [] }, "undo": { "available": true, "redo": true } }
```

**batch** — 실패 예:
```json
{ "error": { "code": "BATCH_FAILED", "message": "2번째 op 실패", "details": { "index": 1, "cause": { "code": "CLIP_NOT_FOUND", "message": "c-99 없음" } } }, "revision": 17 }
```

## 5. 버전·동시성

| 항목 | 규칙 |
| --- | --- |
| revision | 프로젝트마다 정수, op 성공 1회 = +1(batch 도 +1, undo·redo 도 +1). 저장소 `reels_projects.revision`(이미 있음, `ReelsRevisionConflictError`)을 그대로 쓴다 |
| 낙관적 잠금 | 요청 `revision` ≠ 현재 → `409 REVISION_CONFLICT`. 서버가 자동 병합(rebase)하지 않는다 — 화면은 다시 읽고 사용자 의도를 다시 보낸다. 에이전트는 `GET` → 재계산 → 재전송(최대 3회) |
| 멱등 | `requestId` 가 같으면 처음 응답 재생. revision 검사보다 **먼저** 본다(네트워크 재시도가 409 로 바뀌지 않게) |
| op 로그 | 새 테이블 `reels_ops(project_id, revision, op_id, client_id, request_id, op_json, inverse_json, created_at)`. undo·이력·감사·「누가 고쳤나」의 정본 |
| undo 스택 | 프로젝트 단위 한 줄(사람·에이전트 공용 — Palmier 와 다름, [11](11-palmier-feature-map.md) §4). `undo` = 가장 최근의 되돌리지 않은 op 의 inverse 를 새 op 로 적용. 새 op(undo·redo 아님)가 들어오면 redo 스택을 비운다. 깊이 상한 200 |
| 스키마 버전 | 프로젝트 JSON `version` 으로 판단. 서버는 v1 을 읽으면 §6 대로 v2 로 올려 쓴다(읽을 때 변환, 첫 op 저장 때 v2 로 기록) |
| 통째 저장 | 기존 `PUT /api/reels/projects/:id {project, revision}` 은 유지하되 op 로그에 `{op:"replace_project"}` 로 남겨 undo 가능하게 한다. 화면 편집은 W5 부터 ops 만 쓴다 |

## 6. 현재 코드와의 차이·마이그레이션 메모

읽은 코드: `apps/dashboard/src/app/reels/page.tsx` · `apps/dashboard/src/lib/reels-timeline.ts`(모델·연산·검사) · `apps/dashboard/src/server/reels.ts`·`server/studio.ts`(저장소) · `app/api/reels/projects/[id]/route.ts`(PUT revision) · `packages/domain/src/reel/*`(preset·layout·plan·srt·text) · `packages/adapters/video/src/composer.ts`(ffmpeg 합성기).

| 현재(v1) | v2 | 메모 |
| --- | --- | --- |
| 모델·연산이 `apps/dashboard/src/lib/reels-timeline.ts`(앱 안) | `packages/domain/src/reel/timeline.ts` + `ops.ts` | 클린 아키텍처([04](04-architecture.md)): 편집 규칙은 도메인. 앱은 화면·라우트만. 이미 있는 `addClip`·`moveClip`·`splitClip`·`trimClip`·`firstFreeStart`·`overlaps`·`projectIssues` 를 옮기고 op 적용기로 감싼다. 기존 `reels-timeline.test.ts` 는 함께 옮긴다 |
| `version: 1` | `version: 2` + `canvas` | 읽을 때 변환 |
| `clip.offset` + `clip.duration` | `in` + `out` + `speed` | `in = offset`, `out = offset + duration`, `speed = 1` |
| 트랙 `component` | 트랙 `overlay` | `kind` 이름만 바꾼다 |
| `clip.component: "title"\|"badge"\|"cta"` + `clip.text` | `component: {type, text}` | `{type: c.component, text: c.text ?? ""}` |
| text·subtitle 클립 `text: string` | `text: TextBody` | `{value: c.text, style: kind==="subtitle" ? "subtitle-default" : "text-default"}` |
| `muted` 만 | `muted·hidden·locked·volumeDb` | 없으면 기본값 |
| 겹침은 저장 전에만 검사(`overlaps`) | op 마다 불변식 I1~I8 | 전환 겹침 허용(I1 예외)이 새로 생긴다 |
| 저장 = 프로젝트 통째 `PUT` | `POST /ops` + op 로그 | revision 테이블은 그대로, `reels_ops` 테이블 추가(레인 전용 — `/cards`·`cards_decks` 는 건드리지 않는다) |
| 화면 실행취소 없음(UI 상태) | 서버 undo/redo | `ReelsEditor` 는 op 를 보내고 응답 `effects` 로 갱신 |
| 합성기 `createFfmpegReelComposer` 입력 = 카드 세트(`CardRenderResult`) → `planReel` 로 장면 계획 | 입력 = `ReelsProjectV2` | 새 어댑터 함수 `composeTimeline(project, sources, outDir)` 를 추가하고 기존 `compose(cards)` 는 「카드 → v2 타임라인 자동 생성 → composeTimeline」으로 바꾼다. 도메인 `planReel` 은 **카드 세트에서 v2 타임라인 초안을 만드는 함수**(`draftTimelineFromCards`)로 쓰임새를 옮긴다 — 장면 길이·전환 길이·자막 줄바꿈 계산은 그대로 재사용 |
| 전환은 합성 전체에 하나(`options.transition`) | 클립마다 `transition` | 초안 생성 때 전 경계에 프리셋 전환을 넣는다 |
| 자막 = `buildSrt` + ASS(`buildAss`)로 굽기 | subtitle 트랙 클립 → ASS | `buildAss` 입력을 cue 목록에서 subtitle 트랙 클립 목록으로. 프리셋 `subtitle.*` 이 `style:"subtitle-default"` 의 값 |
| 안전영역·카드 배치(`computeReelLayout`) | `TextBody.box` 기본값·`card` 컴포넌트 기본 transform | `reelLayoutIssues` 는 export 전 검사로 유지 |
| 색·키프레임·속도·볼륨 없음 | 있음 | ffmpeg 필터 대응: speed→`setpts`/`atempo` · color→`eq`(brightness·contrast·saturation)+`colortemperature` · lut→`lut3d` · keyframe(scale·cx·cy)→`zoompan` 또는 `scale`+`crop` 식 · opacity→`format=rgba,colorchannelmixer` · volume/fade→`volume`·`afade` · 전환→`xfade`(crossfade=`fade`, dip=`fadeblack`, slide=`slideleft` 등) — 실측은 구현 차수에서 Windows 로 |

마이그레이션 순서(구현 차수 제안 — 이 문서 범위 밖):

1. 도메인으로 모델·연산 이동 + `migrateV1toV2` + 테스트(값 보존: v1 → v2 → 화면 표시 결과 동일).
2. `applyOp` 순수 함수 + op 별 단위 테스트(정상·오류 코드·inverse 왕복 `apply(inverse(apply(p,op))) == p`).
3. `reels_ops` 저장소 + `POST /api/reels/:id/ops` 라우트(멱등·409).
4. `ReelsEditor` 를 ops 호출로 전환.
5. 합성기 `composeTimeline`.

## 7. 정해야 할 것(미정)

| 항목 | 기본안 |
| --- | --- |
| 자막·텍스트 스타일 프리셋 이름·값 | `subtitle-default`(현행 프리셋) · `viral-white` · `viral-yellow`(ss-shorts-edit viral 값) 3종으로 시작 |
| LUT 목록·파일 위치 | 저장소 `assets/luts/*.cube`, id = 파일명. 업로드는 P1 |
| 실시간 공동 편집(다른 창 변경 알림) | P1 — `GET /api/reels/:id/ops?since=<revision>` 폴링. 서버 푸시는 하지 않는다 |
