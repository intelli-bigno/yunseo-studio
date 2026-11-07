# 11. Palmier Pro 기능 역분석 → 릴스 편집기 기능 지도

목적: `/reels` 편집기(W3)를 「사람 + 에이전트가 같은 명령으로 고치는 편집기」로 키울 때, 기준 제품인 Palmier Pro 가 어떤 기능을 어떤 단위로 나눴는지 정리하고, 우리가 무엇을 언제(P0/P1) 만들고 무엇을 뺄지(제외) 정한다. 명령 계약은 [12-reels-ops-schema.md](12-reels-ops-schema.md).

작성 2026-11-07. 기준 버전 **Palmier Pro 0.12.1 (build 91, macOS 26 이상)**.

## 1. 근거 출처

GUI 는 띄우거나 조작하지 않았다(포커스 뺏기 금지). 아래 정적 근거만 썼다.

| 기호 | 출처 | 무엇을 봤나 |
| --- | --- | --- |
| **[P]** | `/Applications/PalmierPro.app/Contents/Info.plist` | 버전 0.12.1, 문서 형식 `io.palmier.project`(패키지), URL 스킴 `palmier://`, 마이크 권한 문구 「Record voice-over audio directly into your timeline.」 |
| **[R]** | `Contents/Resources/` 목록 | Metal 셰이더 `ChromaKey`·`Clarity`·`EdgeRounding`·`Glow`·`GradeCurves`·`Grain`·`HighlightsShadows`·`HueCurves`·`Levels`·`LUTTetra`·`Vignette`·`Wheels`·`WorkingSpace` `.metallib`, `Models/`, `AgentRuntimes/OpenCode`, `palmier-pro.mcpb` |
| **[C]** | `Resources/Changelog/changelog.json` (0.12.0, 2026-10-29) | Headless 편집(창 없이 MCP 로 여러 프로젝트), 타임라인별 편집 이력·스냅샷(History 패널), 자막 프리셋 21종·단어별 스타일, 색 관리(Apple Log·DaVinci Wide Gamut·입력 색공간), HDR 타임라인(SDR/HLG/PQ), 음성 복제·Voice Changer·영상 동기 효과음 |
| **[M]** | `palmier-pro.mcpb` (manifest 0.2.0, `server/index.js`) | stdio→HTTP 심. 실제 MCP 서버는 앱 안 `http://127.0.0.1:19789/mcp`(Streamable HTTP, `Mcp-Session-Id`). 작성 시점에 포트 닫힘(앱 미실행) → `tools/list` 실측 **미확인** |
| **[B]** | 실행 파일 `Contents/MacOS/PalmierPro` 의 문자열(`strings`) | MCP 도구 이름·도구 설명문(아래 §2). 도구 이름은 문자열 존재만 확인 — 인자 스키마 전체는 **미확인** |
| **[S]** | `~/.claude/skills/ss-shorts-edit/` (SKILL.md · `scripts/pm.py`·`build.py` · `examples/*.spec.json`) | 실제로 부른 도구(`get_timeline`·`import_media`·`add_clips`·`add_texts`·`set_clip_properties`·`set_keyframes`·`manage_tracks`·`manage_project`·`organize_media`·`get_media`·`export_project`·`manage_exports`·`inspect_timeline`)와 실측 함정 |
| **[W]** | 공식 변경 이력 URL `https://palmier.io/changelog`(changelog.json 안 링크) | 이번에 열어 보지 않음 — **미확인** |

## 2. MCP 도구 목록 (문자열 근거 [B], 실사용 [S] 표시)

| 묶음 | 도구 |
| --- | --- |
| 프로젝트·타임라인 | `manage_project`[S] · `create_timeline` · `set_project_settings` · `get_timeline`[S] · `inspect_timeline`[S](격자 덧그린 미리보기 이미지) · `manage_snapshots` · `manage_markers` |
| 미디어 | `import_media`[S](경로 **참조**, 복사 아님) · `get_media`[S] · `inspect_media` · `search_media` · `organize_media`[S] · `get_assets`·`manage_assets` |
| 컷 편집 | `add_clips`[S] · `insert_clips` · `remove_clips` · `move_clips` · `split_clips` · `ripple_delete_ranges`(「Cuts one or more ranges out and closes the gaps in one undoable action」) · `manage_tracks`[S] · `manage_clip_links`(영상·음성 묶기) · `manage_multicam`·`get_multicam` |
| 속성·애니메이션 | `set_clip_properties`[S](transform·속도·볼륨·페이드) · `set_keyframes`[S] · `manage_masks` · `set_overlay` · `apply_layout`(분할 화면·PIP·격자를 한 번에) |
| 텍스트·자막 | `add_texts`[S] · `update_text` · `add_captions`(「Transcribe the dialogue, phrase it for readability, and place text clips locked to the speech」) · `get_transcript` · `remove_words`(말 단위 컷) · `remove_silence` |
| 색·효과 | `apply_color`(1차 보정 + `.cube` LUT 「replaces any prior LUT」) · `inspect_color` · `apply_effect` |
| AI 생성 | `generate_image` · `generate_video`(draft 해상도 지원) · `generate_audio` · `list_models` · AI 전환 생성(「Create AI Transition」) |
| 내보내기 | `export_project`[S] · `manage_exports`[S] |
| 계정 | `get_account`·`manage_account`·`get_usage` |
| 실행취소 | 에이전트 편집마다 `actionId` 를 돌려주고, `undo` 는 그 `actionId` 로 되돌린다. 「refuses when newer work touched the same timeline」 |

설계에 옮길 핵심 관찰 4가지:

1. **명령 하나 = 실행취소 단위 하나.** `ripple_delete_ranges`·`apply_layout` 처럼 여러 변경을 「one undoable action」으로 묶는다 → 우리 `batch` op.
2. **되돌리기는 결과 id 기반 + 충돌 거부.** 뒤에 같은 대상을 고친 작업이 있으면 거부한다 → 우리 `undo` 의 `REVISION_CONFLICT`/`UNDO_BLOCKED`.
3. **시간은 프레임, 위치는 캔버스 비율.** `set_keyframes` 의 `scale` 은 배율이 아니라 캔버스 대비 폭·높이(0~1), `position` 은 좌상단[S]. → 우리는 사람이 읽기 쉬운 쪽(중심점·배율)을 정본으로 두고, Palmier 로 내보낼 일이 생기면 어댑터에서 바꾼다.
4. **초 단위 소스 지정은 반올림 빈틈을 만든다**[S](`source:[s,e]` → 1프레임 검은 화면). → 우리는 정수 ms 로 저장하고, 렌더 때 프레임 경계로 한 번만 반올림한다.

## 3. 기능 표

우선순위: **P0** = 다음 구현(W5)에서 op 로 만든다 · **P1** = 계약에 자리만 두고 다음 차수 · **제외** = 만들지 않는다(이유 적음).
「대응 op」는 [12](12-reels-ops-schema.md) §4 의 이름.

| 영역 | Palmier 기능 | 근거 | 우리 구현 여부 | 대응 op |
| --- | --- | --- | --- | --- |
| 레이아웃 | 프로젝트·타임라인 생성, 캔버스 크기·비율·fps 설정 | [B] `create_timeline`·`set_project_settings` · [S] 1080×1920·30fps | P0 (9:16·30fps 고정, 값은 `ReelPreset`) | — (프로젝트 생성은 기존 `POST /api/reels/projects`) |
| 레이아웃 | 트랙 추가·삭제·음소거·순서 | [B]/[S] `manage_tracks` | P0 (이미 있음: `addTrack`·`removeTrack`·`toggleMute`) | `add_track`·`remove_track`·`set_track` |
| 레이아웃 | 분할 화면·PIP·격자 한 번에 배치 | [B] `apply_layout` | P1 | `batch`(+`set_transform`) |
| 레이아웃 | 클립 위치·크기·회전(transform) | [S] `set_clip_properties.transform{width,height,centerX,centerY}` | P0 | `set_transform` |
| 레이아웃 | 마스크 | [B] `manage_masks` | 제외 — 카드·쇼츠 소재에 필요한 장면 없음 | — |
| 레이아웃 | 멀티캠 | [B] `manage_multicam` | 제외 — 촬영 원본이 없다 | — |
| 컷 편집 | 클립 놓기(빈 곳)·끼워 넣기(뒤를 밀기) | [B] `add_clips`·`insert_clips` | P0 / 끼워 넣기 P1 | `add_clip`(`mode:"place"\|"insert"`) |
| 컷 편집 | 앞·뒤 다듬기 | [B]/[S] trim · 이미 `trimClip` | P0 | `trim` |
| 컷 편집 | 자르기(split) | [B] `split_clips` · 이미 `splitClip` | P0 | `split` |
| 컷 편집 | 이동(트랙 간 포함) | [B] `move_clips` · 이미 `moveClip` | P0 | `move` |
| 컷 편집 | 삭제 / 구간 잘라내고 틈 메우기 | [B] `remove_clips`·`ripple_delete_ranges` | P0 | `remove_clip`·`ripple_delete` |
| 컷 편집 | 속도(일정) · 속도 곡선 | [B] 「Edit Speed」「Add / Remove Speed Point」 | 일정 P0 / 곡선 제외(영상·음성 싱크 깨짐 — Palmier 도 「Clips with speed curves can't be synchronized」) | `set_speed` |
| 컷 편집 | 영상·음성 묶기 | [B] `manage_clip_links` | P1 | `link_clips` |
| 컷 편집 | 무음 자동 제거 · 말 단위 컷 | [B] `remove_silence`·`remove_words` | P1 (음성 트랙 생긴 뒤) | `ripple_delete`(범위 계산은 서버 도우미) |
| 컷 편집 | 마커 | [B] `manage_markers` | P1 | `set_marker` |
| 텍스트/자막 | 텍스트 클립 추가·수정(글꼴·크기·색·테두리) | [B] `add_texts`·`update_text` · [S] PostScript 글꼴 이름 | P0 | `add_text`·`update_text` |
| 텍스트/자막 | 자막 파일 가져오기 | 우리 쪽 `buildSrt`·`domain/reel/srt.ts` (Palmier 쪽 SRT 가져오기 근거 없음) | P0 | `import_srt` |
| 텍스트/자막 | 음성 인식 자막 자동 배치 | [B] `add_captions`·`get_transcript` | P0 = **대본 원문 + 무음 경계 배치**([S] 규칙 「자막은 음성 인식이 아니라 대본 원문」) / STT 는 P1 | `auto_place_subtitles` |
| 텍스트/자막 | 자막 프리셋 21종·단어별 스타일 | [C] | 프리셋 P0(2~3종: viral 흰·노랑 굵은 테두리 등) / 단어별 P1 | `add_text.style`·`update_text.runs` |
| 오디오 | 볼륨(dB)·트랙 음소거 | [B] 「Volume in decibels」 | P0 | `set_volume` |
| 오디오 | 페이드 인·아웃(길이·곡선) | [B] 「fadeInFrames + fadeOutFrames must not exceed…」「Curve for the fade in」 | P0 (곡선은 linear/ease 2종) | `set_fade` |
| 오디오 | 크로스페이드 | [B] 「Cross Fade ( 0dB)」 | P1 | `set_transition`(오디오 트랙) |
| 오디오 | 녹음(내레이션) | [P] 마이크 권한 | 제외 — 성우 파일을 받아 쓴다 | — |
| 오디오 | 음성 생성·복제·Voice Changer·효과음 | [C]·[B] `generate_audio` | 제외 — 유료 API·승인 필요(ElevenLabs 규칙). 생성물은 파일로 가져온다 | `add_clip`(audio) |
| 컴포넌트 | 이미지 오버레이(스티커·워터마크·카드) | [S] PNG 를 `add_clips` 로 새 트랙에 쌓고 transform 명시 | P0 | `add_component(sticker\|watermark\|card)` |
| 컴포넌트 | 기존 컴포넌트(제목·배지·CTA) | 우리 `REELS_COMPONENTS` | P0 (마이그레이션 대상) | `add_component` |
| 전환 | 컷·크로스페이드·딥·슬라이드 | 우리 `REEL_TRANSITIONS` (Palmier 전환 이름은 [B] 근거 부족 — **미확인**) | P0 (4종) | `set_transition` |
| 전환 | AI 전환 생성 | [B] 「Create AI Transition」 | 제외 — 생성 비용·검수 부담 | — |
| 색감 | 1차 보정(밝기·대비·채도·색온도) | [R] `Levels`·`Wheels`·`GradeCurves` · [B] `apply_color` | P0 (4값) | `set_color` |
| 색감 | LUT(.cube) | [R] `LUTTetra` · [B] 「replaces any prior LUT」 | P0 (등록된 LUT 이름만, 파일 업로드 P1) | `set_color.lut` |
| 색감 | 커브·HSL·하이라이트/섀도·클래리티·비네트·그레인·글로 | [R] 각 `.metallib` · [B] `apply_effect` | P1 (`vignette`·`grain` 2종만) | `set_effect` |
| 색감 | 크로마키 | [R] `ChromaKey` | P1 (codex 삽화가 #00FF00 배경 — [S]) | `set_effect` |
| 색감 | 색 관리·HDR(Log·DWG·HLG/PQ) | [C] | 제외 — 출력이 SDR 인스타·Shorts 뿐 | — |
| 줌/키프레임 | 위치·배율·불투명도 키프레임 | [B]/[S] `set_keyframes` | P0 | `add_keyframe`·`remove_keyframe` |
| 줌/키프레임 | 줌 인·아웃 프리셋(시작배율·끝배율·중심) | [S] spec `zoom:[z0,z1,cx,cy]`·`punch` | P0 (`add_keyframe` 두 개로 표현, 도우미 `zoom`) | `batch`(add_keyframe ×2) |
| 줌/키프레임 | 보간 곡선 | [B] 「Change Fade Interpolation」·`BezierPathKeyframe` | P0 linear/ease-in-out · 베지어 제외 | `add_keyframe.ease` |
| 실행취소 | 편집 단위 실행취소·다시 실행 | [B] `actionId`·「Can't undo actionId」 | P0 | `undo`·`redo` |
| 실행취소 | 타임라인별 이력·스냅샷 저장·복원 | [C]·[B] `manage_snapshots` | P1 (op 로그가 곧 이력 — 스냅샷은 이름 붙인 revision) | `snapshot`(P1) |
| 내보내기 | MP4 렌더·내보내기 목록 관리 | [B]/[S] `export_project`·`manage_exports` | P0 (기존 ffmpeg 합성기를 타임라인 입력으로 확장) | — (`POST /api/reels/:id/export`, ops 밖) |
| 내보내기 | 미리보기 정지 화면 | [S] `inspect_timeline` | P1 | — (`GET /api/reels/:id/frame?t=`) |
| AI/MCP | MCP 서버(HTTP 127.0.0.1:19789, 세션 id) | [M] | P0 = **HTTP `ops` 엔드포인트가 곧 에이전트 인터페이스**. MCP 래퍼는 P1 | 전 op |
| AI/MCP | 창 없는(Headless) 여러 프로젝트 동시 편집 | [C] | P0 (서버 저장이라 원래 창 없음 — revision 으로 동시성) | — |
| AI/MCP | 앱 내 에이전트 대화(OpenCode 런타임)·사용량 대시보드 | [R] `AgentRuntimes/OpenCode` · [C] | 제외 — 우리 에이전트는 Claude Code/Codex 바깥에서 붙는다 | — |
| AI/MCP | 이미지·영상 생성 | [B] `generate_image`·`generate_video` | 제외 — 비용·승인 경로가 따로(Higgsfield 규칙) | — |

## 4. Palmier 에서 그대로 따르지 않는 것

| Palmier | 우리 | 이유 |
| --- | --- | --- |
| 시간 = 프레임 | 시간 = 정수 ms(현행 v1 과 같음) | v1 데이터·UI 가 ms. fps 를 바꿔도 데이터가 안 바뀐다. 렌더 때 한 번만 프레임으로 반올림 |
| transform = 좌상단 + 캔버스 비율 크기 | 중심점(0~1) + 배율 | 줌은 「중심 고정 확대」가 대부분 — Palmier 에서는 `position = c − c×z` 를 매번 계산해야 했다[S] |
| 미디어 = 파일 경로 참조 | 소스 id(`/api/reels/...` 로 서버가 해석) | 경로를 지우면 프로젝트가 깨지는 함정[S]을 피한다. 소스는 서버가 소유 |
| undo = 직전 에이전트 편집의 actionId | undo = 프로젝트 op 로그 스택(사람·에이전트 공용) | 사람과 에이전트가 같은 편집기를 쓴다 |
