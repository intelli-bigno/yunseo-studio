# 04. 클린 아키텍처 계층과 의존 규칙

## 계층

```
 ┌──────────────── 인프라 (apps/*: 웹 서버·스케줄러·CLI 진입점, DB 연결, 환경 변수) ────────────────┐
 │  ┌────────────── 어댑터 (packages/adapters/*: 포트 구현) ──────────────┐                          │
 │  │  ┌──────────── 유스케이스 (packages/application) ────────────┐       │                          │
 │  │  │  ┌────────── 도메인 (packages/domain) ──────────┐          │       │                          │
 │  │  │  │ 엔티티·값 객체·상태 기계·불변 규칙           │          │       │                          │
```

**의존은 안쪽으로만 향한다.** 도메인은 아무것도 모르고, 유스케이스는 도메인과 자기 포트만 안다. 어댑터는 포트를 구현하고, 인프라는 조립만 한다.

## 도메인 (외부 의존 0)

| 개념 | 핵심 규칙 |
| --- | --- |
| `Event` | 이름·일시(UTC 저장 + 표시 시간대)·유형·원천. 일시 없는 이벤트는 선정 불가 |
| `Story` | 한 편. 상태 기계(02 SOP)를 소유. 허용되지 않은 전이는 예외 |
| `Script` | 포맷 단(5단)별 원고 + 운영자 해석. 단 누락·글자 수 초과·금지 표현 block 이면 `drafted` 불가 |
| `Claim` / `Source` | 주장–출처 연결. 출처 없는 Claim 이 하나라도 있으면 `verified` 불가 |
| `CardSet` / `Short` | 렌더 산출물 참조 + 콘텐츠 해시 |
| `Approval` | 승인자·시각·승인 대상 해시. 해시 불일치면 무효 |
| `Publication` | 플랫폼·외부 ID·URL·게시 시각 |
| `MetricSnapshot` | 게시물·시점·지표 값 |
| `PresetRef` | 사용한 프리셋 조합 + 버전 해시 |

## 유스케이스 (예)

`ProposeEvents` · `SelectEvent` · `DraftScript` · `ExtractClaims` · `AttachSource` · `RenderCards` · `ComposeShort` · `RequestReview` · `Approve` / `RequestChanges` · `Publish` · `RecordMetrics`

각 유스케이스는 **포트**만 호출한다:

| 포트 | 구현 어댑터 예 |
| --- | --- |
| `StoryRepository` | storage (SQLite/Postgres) |
| `PresetSource` | presets-schema (파일) |
| `CardRenderer` | render-html |
| `VideoComposer` | video |
| `Publisher` | publisher-manual / -instagram / -youtube |
| `EventFeed` | events-calendar (수동 입력·공식 캘린더) |
| `ScriptDrafter` | llm (선택) / 사람 입력 |
| `MetricsSource` | metrics (API) / 수동 입력 |
| `LinkChecker` | HTTP 확인 |
| `Clock` · `IdGenerator` | 시스템 (테스트에서 고정값 주입) |

## 의존 규칙 (CI 에서 강제)

1. `domain` 은 어떤 패키지도 import 하지 않는다(표준 라이브러리 제외).
2. `application` 은 `domain` 만 import 한다. 외부 SDK·HTTP·파일 시스템 금지.
3. `adapters/*` 는 `application`(포트)·`domain` 을 import 할 수 있다. 어댑터끼리 import 금지.
4. `apps/*` 만 어댑터를 생성·주입한다. 유스케이스 안에서 `new SomeAdapter()` 금지.
5. 사람 승인 게이트는 **도메인 규칙**이다(`Publish` 는 유효한 `Approval` 없이는 실패). UI·워커가 우회할 수 없다.

## 테스트 전략

- 도메인·유스케이스: 가짜 포트로 단위 테스트 (빠르고 외부 없음). 상태 전이·승인 무효화·출처 누락 차단이 핵심 케이스.
- 어댑터: 계약 테스트(같은 포트 테스트를 각 구현에 돌림). 외부 API 어댑터는 녹화된 응답으로.
- 렌더: 골든 이미지 비교는 비용 대비 효과를 보고 결정(초기엔 규격 검사만).

## 구현 현황 — 대시보드가 한 바퀴 도는 길 (2026-11-05)

화면 → 유스케이스 → 포트 → 어댑터가 실제로 이어져 있다(목업 데이터는 화면에서 어댑터의 시안 데이터로 옮겼다).

| 계층 | 위치 | 지금 있는 것 |
| --- | --- | --- |
| 도메인 | `packages/domain/src/story` | `Piece`·`PieceClaim`·`QueueItem`·`WeekVariable`·`EventCandidate` 모델, 게이트·발행 대기열·출처 점검 규칙(`currentGate`·`queueState`·`claimIssues` …), 날짜 계산 |
| 유스케이스 | `packages/application` | 포트 `StudioRepository`·`Clock`·`CardAssets`, 읽기 모델(`views.ts`), 유스케이스 `getNavSummary`·`getTodayBoard`·`getSchedule`·`listContent`·`getPieceDetail`·`getPublishQueue`·`getPaletteIndex`·`getCardSet`·`readCardImage`, 읽기 캐시 데코레이터 `withReadCache` |
| 어댑터 | `packages/adapters/storage` | `StudioRepository` 의 **SQLite 구현**(Node 내장 `node:sqlite`, 외부 연동 없음). 빈 저장소를 처음 열 때 시안 데이터를 한 번 채움 |
| 어댑터 | `packages/adapters/render-html` | `CardAssets` 의 파일 구현(렌더된 카드 PNG 읽기, 이름 화이트리스트) |
| 인프라(조립) | `apps/dashboard/src/server/studio.ts` | **어댑터를 만들고 유스케이스에 꽂는 유일한 파일**. `STUDIO_DB`(SQLite 파일 경로, 없으면 메모리 시안 모드)·`STUDIO_CLOCK=system`(KST 오늘, 기본은 시안 기준일)·`CARD_V2_DIR` 환경변수를 여기서만 읽음 |
| 화면 | `apps/dashboard/src/app`·`components` | 서버 컴포넌트가 `studio().<유스케이스>()` 결과만 그림. 클라이언트 섬은 props 만 받음 |
| 유스케이스 (L6) | `packages/application/src/ops` | 포트 `OpsJournal`·`OpsBackupCatalog`·`OpsLogSource`·`OpsServiceProbe`·`OpsClock`, 유스케이스 `getOpsStatus` |
| 어댑터 (L6) | `packages/adapters/ops` | 위 포트의 SQLite(`l6_job_runs`)·파일·HTTP 구현 + 백업·복원 |
| 인프라 (L6) | `apps/dashboard/src/server/studio.ts` 의 `// [L6]` 블록 `ops()`, `apps/worker/src/main.ts` | 상태 화면 `/status`, 워커 스케줄러. 배치는 [10-operations.md](10-operations.md) |

### 경계 강제 — 네 겹

1. **ESLint**(`eslint.config.mjs`): 규칙 1~3(import 문 단위) + 대시보드에서 어댑터·`node:*` 는 `src/server/` 안에서만 + 클라이언트 섬(`components/`)은 유스케이스·서버 조립부·어댑터 import 금지.
2. **선언 의존**(`tests/boundaries.test.ts`): `package.json` 의 의존 방향.
3. **import 그래프**(`tests/import-graph.test.ts`): 전체 소스를 훑어 계층별 import 허용 목록, 「어댑터를 import 하는 대시보드 파일은 `server/studio.ts` 하나」, 선언 없이 쓰는 workspace 의존 없음, 패키지 밖으로 나가는 상대 경로 없음.
4. **규칙이 실제로 잡는지**(`tests/eslint-boundaries.test.ts`): 위반 코드 16개를 ESLint 에 넣어 잡히는지·올바른 import 는 통과하는지 확인 — 규칙을 고치다 구멍이 나면 여기서 드러난다.

유스케이스와 SQLite 를 실제로 이은 통합 검증은 `tests/studio-integration.test.ts`, 포트 계약 테스트는 `packages/adapters/storage/src/sqlite-studio-repository.test.ts`. 성능 정책(읽기 캐시·렌더 전략)은 [09-performance.md](09-performance.md).

## 구현 현황 — 게시 계획(dry-run)·성과 (L5, 2026-11-05)

게시는 **계획만** 만든다(실제 호출·토큰·계정 입력 없음). 성과는 수동 입력·CSV 로만 들어온다.

| 계층 | 위치 | 지금 있는 것 |
| --- | --- | --- |
| 도메인 | `packages/domain/src/publish` | 플랫폼 규격 상수(`specs.ts`, 2026-11-05 실측)·근거 목록(`evidence.ts`, 문서 URL·확인일·원문 인용)·계획 모델(`plan.ts`: `PublishPlan`·`PlannedStep`·`SpecIssue`·`QuotaForecast`, `mode` 는 영구히 `"dry-run"`)·규격 검사(`check.ts`: IG 캐러셀/릴스, YouTube Shorts — JPEG 변환·장수·비율·용량·폭·길이·캡션·해시태그·@태그·대체 텍스트·금지 표현·`TBD`)·PNG/JPEG 크기 읽기(`image-info.ts`) |
| 도메인 | `packages/domain/src/metrics` | `MetricSnapshot`(게시물·시점·지표 값)·지표 정의(IG/YT 공식 지표 이름)·검증·최신 값·비율·편별/종별/주별 집계(`rules.ts`)·CSV 읽기·열 추정·행→스냅샷(`csv.ts`) |
| 유스케이스 | `packages/application/src/publishing` | 포트 `InstagramPublishPlanner`·`YoutubePublishPlanner`·`PublishSource`, 유스케이스 `getPublishPreview(편, 채널)` — 렌더 계약(`CardRenderResult`·`ReelResult`)을 도메인 입력으로 옮겨 계획을 만든다. 게시(실행) 메서드는 포트에 없다 |
| 유스케이스 | `packages/application/src/metrics` | 포트 `MetricsRepository`, 유스케이스 `getPerformance`·`recordManual`·`previewCsv`·`importCsv`·`deleteSnapshot` |
| 계약 | `packages/application/src/pipeline/contracts.ts` | 레인 공용 계약(Lead 고정, 바이트 그대로) — 콘텐츠 정본 → 카드 → 릴스 → 업로드 묶음 |
| 어댑터 | `packages/adapters/publisher-instagram` | `createInstagramDryRunPlanner`(엔드포인트·순서·파라미터·예상 할당량)·`createCardAssetsPublishSource`(렌더된 카드 PNG → 계약 모양, 임시) |
| 어댑터 | `packages/adapters/publisher-youtube` | `createYoutubeDryRunPlanner`(재개 가능 업로드 세션 → 파일 → 응답 확인 → 사람이 공개) |
| 어댑터 | `packages/adapters/metrics` | `MetricsRepository` 의 SQLite 구현 — 레인 전용 테이블 `l5_metric_snapshots`·`l5_csv_imports`·`l5_column_mappings`(같은 `STUDIO_DB` 파일, 기존 테이블은 만지지 않음) |
| 인프라(조립) | `apps/dashboard/src/server/studio.ts` | `[L5]` 블록 하나 — `l5()` 가 계획·성과 유스케이스와 금지 표현 규칙(프리셋 로드 결과)을 돌려준다. 편 저장소는 `[L2]` 의 `sqliteRepo()` 와 같은 연결을 쓴다 |
| 화면 | `apps/dashboard/src/app/performance`·`publish/[pieceId]` | 서버 컴포넌트가 `l5()` 결과만 그린다. 성과 입력은 서버 동작(`actions.ts`)·CSV 섬(`components/CsvImport.tsx`)만 클라이언트 |

경계 점검: `tests/l5-dry-run-guard.test.ts` 가 게시 경로 소스에 네트워크 호출·환경변수·토큰 이름·파일 쓰기가 없고, 화면에 비밀번호·토큰 입력 칸이 없으며, 성과 어댑터가 `l5_` 테이블만 만지고, `docs/05` §5.8 이 `evidence.ts` 와 어긋나지 않는지를 고정한다.

## 구현 현황 — [L2] 쓰기 길: 작성·검수·업로드 묶음 (2026-11-05)

화면(서버 액션) → 쓰기 유스케이스(`application/src/authoring`) → 도메인 규칙(`domain/src/story/authoring.ts`) → `AuthoringStore` 포트 → SQLite. **판단은 전부 도메인**이고, 유스케이스는 읽고 → 규칙 적용 → 원자적으로 저장만 한다. 화면·서버 액션이 규칙을 건너뛸 길은 없다(04 규칙 5).

### 상태 기계 (02 SOP) — `TRANSITIONS` 표 밖의 (상태, 행동)은 전부 예외

| 행동 | 전이 | 게이트 | 조건(도메인이 강제) |
| --- | --- | --- | --- |
| `select` | idea → selected | **G1** | 핵심 관점 한 문장, ①② 는 중요도 `major`(watch 는 피드 편성 없음), 누른 사람 |
| `start_draft` | selected → drafted | — | |
| `await_evidence` · `evidence_ready` | selected → evidence_wait → drafted | — | ② 만. 자료 확보 4조건(01 §4.3) 전부 참 |
| `verify` | drafted → verified | **G2** | `pieceBlockers` 비어 있음 — 빈 단·관점·문장별 출처/기준 시점·사람 확인·근거 없는 해석·①시나리오 2+/확인할 것 1+·②이전 편 시나리오 전부 응답·확인 항목 전부 처리·자료 확보 |
| `reopen` · `request_review` | verified → drafted / in_review | — | |
| `approve` · `reject` | in_review → approved / drafted | **G3** | 승인: 체크리스트(02 §5.3) 전 항목 + 지금 내용과 맞는 G2 기록. 반려: 사유 필수 |
| `publish` | approved → published | — | 지금 내용 해시와 같은 G3 승인 |
| `reapprove` | published → published | **G3** | 발행 뒤 수정으로 풀린 승인을 다시 — 체크리스트 + G2 조건 |

- 02 상태도의 `rendered`·`changes_requested` 는 **상태로 두지 않았다**: 렌더는 게이트가 아닌 산출물(파이프라인 기록)이고, 반려는 사유를 남기고 작성(drafted)으로 되돌린다. `scheduled`·`measured` 는 발행·성과 레인 몫.
- **승인(Approval)** = 게이트·결정·사람·시각·**승인 대상 내용 해시**(`contentHash` — 제목·관점·단·문장·시나리오·응답의 정렬 JSON 의 SHA-256, 도메인 순수 구현). 상태·확인 표시·게시 예정 시각·자료 확보 체크는 해시에 넣지 않는다.
- **승인 무효**: 검증 뒤(verified·in_review·approved) 내용이 바뀐 저장은 작성 단계로 돌아가고 G2·G3 가 풀린다. 발행된 편은 상태를 두고 G3 만 풀린다(대기열 「불일치」) — 이유·변경 종류(정정·갱신·명확화)·독자 문구(정정·갱신)·후속 게시물/기한(갱신) 필수(01 §6).
- **출처·기준 시점**: 사실·시장 반응, 그리고 수치·날짜가 든 조사 문장은 URL(형식만 — 접속 안 함)·접근일·원문 인용·분 단위 `as_of` 없이는 사람 확인(`confirmClaim`)도 G2 도 안 된다. 해석은 `based_on`(근거 사실 id) 필수. 확인 표시는 편집으로 켤 수 없고, 바뀐 문장만 확인이 풀린다.
- **이전 ↔ 이후 연결**: 이후 편은 `preIssueId` 로 이전 편을, 응답은 이전 편의 안정 id(`scenarios[].id`·`checks[].id`)로 가리킨다. 없는 id·이전 편이 아닌 편은 저장부터 거절, 이후 편이 응답한 시나리오는 이전 편에서 지울 수 없다.

### 저장 — `AuthoringStore` (SQLite 구현: `adapters/storage`)

| 테이블(스키마 v2) | 내용 |
| --- | --- |
| `schema_migrations` | 적용한 버전·이름·시각. 열 때 빠진 버전만 쓰기 잠금 안에서 적용(여러 프로세스 안전), 실패하면 되돌림 |
| `pieces` (+`revision`·`structure`·`created_at`·`updated_at`) | 편. `revision` = 저장 버전 — `UPDATE … WHERE revision = 읽은 값` 으로 **낙관적 동시성**, 어긋나면 `RevisionConflictError` |
| `piece_revisions` | 저장·게이트 행동·문장 확인마다 한 줄: 버전·시각·사람·종류·이유·독자 문구·후속·바뀐 칸(전/후)·내용 해시·상태 |
| `approvals` | 게이트 기록(G1~G3, 승인/반려, 내용 해시). 유효성은 읽을 때 지금 해시와 비교 |
| `pipeline_results` | 렌더·릴스·묶음 결과 + 만든 내용 해시(내용이 바뀌면 낡은 산출물로 묶지 않는다) |

- 편·이력·게이트 기록·대기열 해시는 **한 트랜잭션**으로 쓴다. 쓰기마다 `meta.revision` 이 올라 읽기 캐시가 즉시 낡는다.
- 저장소를 열 때 시안을 채우지 않는다. 「빈 DB 데모 채우기」 — 콘텐츠 화면 빈 상태 버튼·`pnpm run demo:seed` — 만 비어 있는 저장소에 넣는다(시안의 통과 게이트는 그 내용 해시로 기록).
- 다른 레인 전용 테이블(`<레인>_` 접두사)은 각 레인 모듈이 `CREATE TABLE IF NOT EXISTS` 로 만든다 — 버전 목록에 넣지 않는다.

### 렌더 → 미리보기 → 업로드 묶음 — 계약 포트로만 (`pipeline/contracts.ts`)

- `createPipelineUseCases({ renderer, reels, packager, files })` — `CardRenderer`(L1)·`ReelComposer`(L3)가 **주입되지 않으면 해당 단계는 비활성 + 이유**(가짜 구현 없음). 조립부(`server/studio.ts` 의 `[L2]` 블록)는 지금 둘 다 `null` 이고, 통합 Worker 가 꽂는다.
- 렌더 입력은 `toContentBody(piece)`: ① 은 기존 정본 스키마 `pre-issue-5/v1` 검증기를 통과해야 하고, ②·③ 은 공통 봉투 `post-issue-4/v1`·`research-5/v1`(잠정 — 코드 스키마가 생기면 바꾼다).
- 묶음은 **유효한 G3 승인본 + 지금 내용으로 렌더한 카드**만. `ZipUploadPackager`(publisher-manual)가 렌더 기록의 크기·sha256 과 실제 파일을 대조한 뒤 `cards/NN.png`·`caption.txt`·`hashtags.txt`·`alt-text.txt`·(`reel.mp4`·자막)·`manifest.json`(`upload-bundle/v1`: 파일별 크기·sha256·역할, 경고) 을 zip 으로 묶는다(외부 패키지 없이 `node:zlib`).

검증: 상태 전이 표 전수(3종 × 8상태 × 11행동)·승인 무효화·출처 누락 차단·연결 무결성 — `domain/src/story/authoring.test.ts`, SQLite 계약(마이그레이션·동시성·트랜잭션) — `adapters/storage/src/sqlite-studio-repository.test.ts`, zip 내용 — `adapters/publisher-manual/src/upload-packager.test.ts`, 저장 → 재조회 → 게이트 → 묶음 한 바퀴(실제 SQLite 파일) — `tests/l2-authoring.test.ts`.

## 구현 현황 — 일정 수집(L4, 2026-11-05)

공식 일정 → 중요도 판정 → 편성 캘린더·「이번 주의 변수」가 자동으로 채워지는 길. 새 포트 3개가 이 길을 만든다.

| 계층 | 위치 | 지금 있는 것 |
| --- | --- | --- |
| 도메인 | `packages/domain/src/events` | `CalendarEvent`·`StoredEvent`(UTC 저장), 종류 16개와 점검표 기본값, `judgeEventImportance`(02 §3.2), `planEventMerge`(중복 제거·변경 이력·사라짐), `selectEventWeekVariables`·`selectEventCandidates`(KST 날짜로 변환), 수동 입력 안내 URL |
| 유스케이스 | `packages/application/src/events` | 포트 `EventSource`(원천)·`EventFeed`(저장·판정·이력·실행 기록), 유스케이스 `collectEvents`(원천 실패 격리·0건 응답 거부)·`createEventUseCases`(수집 현황·판정·수동 입력)·`withEventFeed`(StudioRepository 데코레이터) |
| 유스케이스 | `packages/application/src/drafting` | 포트 `ScriptDrafter`, `draftScript`(꺼짐·금지 표현 block 시 폐기) |
| 어댑터 | `packages/adapters/events-calendar` | `EventSource` 3개(연준 JSON·BLS ICS·BEA ICS)와 ICS 읽기·시간대 변환, `EventFeed` 의 SQLite 구현 — 테이블은 `l4_events`·`l4_event_history`·`l4_decisions`·`l4_fetch_runs`·`l4_meta`(storage 스키마는 건드리지 않고 같은 DB 파일을 쓴다) |
| 어댑터 | `packages/adapters/llm` | `ScriptDrafter` 로컬 명령 실행 골격(`execFile`, 셸 없음, 타임아웃·출력 상한) |
| 인프라(조립) | `apps/dashboard/src/server/studio.ts` (`// [L4]` 블록) | 같은 DB 에 `EventFeed` 를 열고 `withEventFeed` 를 읽기 캐시 안쪽에 끼운다. `events()` 로 일정 유스케이스를 낸다 |
| 인프라(조립) | `apps/worker/src/collect-events.ts`, `apps/cli/src/events.ts` | 1회 실행 함수와 `events fetch --dry` |
| 화면 | `/schedule`(후보함·이번 주의 변수), `/schedule/events`(수집 현황·변경 이력·수동 입력) | 판정 버튼은 서버 액션 → 유스케이스. 올릴 때 사유 필수는 도메인 규칙(`eventDecisionIssues`) |

- `withEventFeed` 는 **수집한 일정이 하나도 없으면 원래 저장소의 값을 그대로** 돌려 준다(데모 시안을 채운 DB 면 시안 데이터, 빈 DB 면 빈 목록) — 첫 수집 전에도 화면이 깨지지 않는다. `revision()` 은 원래 값 + 피드 값이라 일정·판정이 바뀌면 읽기 캐시가 바로 낡는다.
- 어댑터(네트워크)는 `fetch` 를 **주입**받는다. 테스트는 녹화한 응답만 돌려주는 가짜를 쓰고(모르는 주소는 즉시 실패), 계약 테스트(`event-feed.contract.test.ts`)는 메모리·SQLite 두 구현에 같은 시험을 돌린다.
- 포트 메서드 이름이 `pull` 인 이유: `tests/import-graph.test.ts` 가 application 에서 `fetch(` 문자열을 막는다(포트 뒤로 숨기는 규칙을 문자열로 지킨다).

## 카드 렌더 엔진 (2026-11-05) — 콘텐츠 정본 → 카드 PNG 세트

콘텐츠 정본 한 편을 **카드 PNG 세트(1080×1350) + 캡션·해시태그·대체텍스트**로 바꾼다. 렌더 중에는 이미지 생성·네트워크 호출이 없다(LLM 없음).

```
정본 YAML ─ validateContentDoc ─▶ ContentBody ─ contentBlockers ─▶ block 이면 거부 / warn 은 결과 warnings
   │                                                    (금지 표현 · 글자 상한 · 출처/기준 시점)
   └▶ planCards(종별 카드 계획) ─▶ cardElement(레이아웃) ─▶ satori(SVG) ─▶ resvg(PNG) ─▶ 카드 + 캡션·태그·대체텍스트
```

| 조각 | 위치 | 하는 일 |
| --- | --- | --- |
| 정본 스키마·검사 | `packages/domain/src/content/` | 3종 스키마(`pre-issue.ts`·`post-issue.ts`·`research.ts`), 공통 봉투·claim 구분 필드(`envelope.ts`·`claims.ts`), 통합 진입 `validateContentDoc`·`contentBlockers`(`document.ts`), 캡션·해시태그 `buildPublishText`(`publish-text.ts`) |
| 포맷 프리셋 | `presets/format/{pre-issue-5,post-issue-4,research-5}.yaml` | 단 순서, 카드 슬롯별 글자 상한(`max_chars`, 가정값), 카드 장면별 질문 Q·기본 답 A(언어 코드별) |
| 카드 계획 | `packages/adapters/render-html/src/plan/` | 종마다 다른 정본을 「카드 몇 장, 장마다 무엇」(`CardPage`)으로 바꾼다. 대체텍스트(`alt.ts`)도 여기서 |
| 레이아웃·테마 | `render-html/src/layout.ts`·`theme.ts` | 카드 예시 v2 시각 문법(사진 전면 배경·말풍선 Q/A·번호 목록 상자·닫는 상자·코너 상자). 색·치수는 `theme.ts` 한 곳 |
| 래스터 | `render-html/src/raster.ts` | satori → SVG → resvg → PNG. 서체는 `render-html/fonts/` 의 Pretendard(WOFF, SIL OFL) |
| 포트 구현 | `render-html/src/card-renderer.ts` | `createHtmlCardRenderer(options)` 가 계약 `CardRenderer`(`application/src/pipeline/contracts.ts`)를 구현. 입구는 `@yunseo/adapters-render-html/renderer` — 대시보드가 쓰는 기본 입구(`CardAssets`)와 나눠, 네이티브 모듈(`.node`)이 Next 번들로 새지 않게 했다(2026-11-05 `next build` 실측: 기본 입구에서 같이 내보내면 webpack 이 `.node` 를 파싱하다 실패) |
| 진입 | `apps/cli` | `pnpm run render <content.yaml> --out <폴더> [--backgrounds <폴더>]` — 카드 + `caption.txt`·`alt-texts.txt`·`render.json` |

### 렌더러 선택 — satori + resvg (브라우저 없음)

| 기준 | satori + resvg (선택) | 로컬 HTML + 헤드리스 Chromium |
| --- | --- | --- |
| 결정성 | 글자를 글리프 경로로 바꿔 SVG 에 담고(서체는 저장소 파일) resvg 가 그린다 — 브라우저 버전·시스템 서체가 없다. **실측**: 같은 입력을 폴더를 바꿔 두 번 그려 4세트·24장 sha256 이 모두 같다(Windows WSL, 테스트 `apps/cli/src/render.test.ts`) | 같은 기계·같은 Chrome 이면 같지만 Chrome 버전·서체 힌팅이 바뀌면 바이트가 바뀐다 [미측정] |
| Windows 실행 | npm 패키지만(선행 빌드 바이너리) — `win auto` 의 WSL 에서 추가 설치 없이 돈다 | 브라우저 설치·샌드박스가 따로 필요 |
| 속도 | **실측**: 카드 한 장 약 0.2~0.3초(Windows WSL, 폰트 로드·PNG 인코딩·파일 쓰기 포함). 이전 편 8장(사진 배경)을 두 번 그리는 테스트가 5.0초, 이후 편 8장 3.2초, 연구 4장 1.8초 | 장마다 브라우저 기동(카드 예시 v2 의 `render.sh` 방식) [미측정] |
| 제약 | CSS 일부만(flex·grid·그림자·그라데이션·transform 은 됨). 이모지는 외부 이미지가 필요해 쓰지 않는다 — 톤 프리셋 `emoji: none` 과 같다. 서체는 TTF/OTF/WOFF | 거의 없음 |

- 판단 근거는 「같은 입력 → 같은 PNG」(검수·승인 해시 비교, 04 도메인의 `Approval` 은 산출물 해시를 본다)와 Windows 에서 설치 없이 도는 것이다. 제약은 카드 예시 v2 의 모든 요소가 그려지는 것을 눈으로 확인해 감수했다.
- **측정하지 않은 것**: 다른 CPU 구조(arm64)에서의 바이트 동일성. 검증은 Windows WSL(x64)과 같은 구조인 CI(ubuntu x64)가 기준이다. Mac 에서 테스트를 돌려 해시가 다르면 그 차이가 이 한계다.
- 의존 경계: 렌더 어댑터만 래스터 라이브러리 2개(`satori`·`@resvg/resvg-js`)를 더 쓴다 — `tests/import-graph.test.ts` 의 어댑터 허용 목록에 이 둘만 적었다. react 는 쓰지 않는다(요소 트리는 평범한 객체).
- 라이선스: satori·resvg-js 는 MPL-2.0(의존으로만 사용), Pretendard 는 SIL OFL 1.1(`fonts/Pretendard-OFL.txt`).

### 렌더 전 검사

`contentBlockers(body, rules)` 가 `{ block, warn }` 을 돌려주고, block 이 하나라도 있으면 렌더기는 파일을 쓰지 않고 거부한다(`ContentBlockedError`).

| 검사 | block | warn |
| --- | --- | --- |
| 금지 표현(`presets/compliance`) | 규칙이 block 인 것(브리프 원문 금지어) | 규칙이 warn 인 것(영어 제안) |
| 글자 상한(포맷 프리셋 `max_chars` × 장 수) | 상한의 1.5배 초과(레이아웃이 넘칠 위험), 또는 `limits_provisional: false` 인 상한 초과 | 가정값(`limits_provisional: true`) 상한 초과 |
| 출처·기준 시점·운영자 해석·claim 별 필수(01 §5) | `status: verified` | `status: draft` — 초안 미리보기는 허용하고 결과에 `[draft]` 로 남긴다 |
| 캡션 2,200자·해시태그 30개·태그 모양·캡션의 금지 표현 | 항상 | — |

### 배경 이미지 슬롯

카드 장마다 슬롯 이름이 있다: `cover` · `<단>`(그 단의 첫 장) · `<단>-2`(둘째 장) · … 슬롯에 이미지 파일(jpg·png)을 지정하면 사진 전면 배경으로, 지정이 없으면 토큰 색 배경(슬레이트 블루→네이비 + 황동빛 한 점)이다. 출처 장(`sources`)은 늘 종이색이다. 지정 방법은 `createHtmlCardRenderer({ backgrounds })` 의 슬롯→파일 맵, CLI 는 `--backgrounds <폴더>`(폴더 안 `backgrounds.json` 또는 `<슬롯>.jpg|png` 이름). 생성형 배경은 렌더와 따로 만들어 둔다(카드 예시 v2 의 7장은 [`docs/design/card-reference/v2/bg/backgrounds.json`](design/card-reference/v2/bg/backgrounds.json) 으로 지정).

### 테스트와 스냅샷

- 도메인: 3종 스키마·봉투·claim 종류별 필수·검사(`packages/domain/src/content/*.test.ts`), 캡션·해시태그 한도.
- 어댑터: 카드 계획·대체텍스트·배경 슬롯·거부 경로(`render-html/src/*.test.ts`), 실제 래스터로 크기(1080×1350)·결정성.
- 스냅샷: `apps/cli/src/render.test.ts` 가 예시 4건(이전·이후·연구·연구 한국어)을 렌더해 **모든 카드의 sha256 을 커밋된 기준값**(`apps/cli/src/__fixtures__/render-golden.json`)과 비교한다. 대표 PNG 3장(`__fixtures__/*.png`)은 바이트까지 같아야 한다.
- 일부러 카드를 바꿨을 때 기준값 갱신: Windows 에서 `win auto -- bash scripts/render-examples.sh <폴더>` → 결과 폴더를 가져와 눈으로 확인 → `node scripts/render-golden.mjs <폴더>`.

## 구현 현황 — 릴스 합성 (L3, 2026-11-05)

카드 세트 → 릴스가 계약(`packages/application/src/pipeline/contracts.ts` 의 `ReelComposer`)을 사이에 두고 이어져 있다. 포트 이름은 위 표의 `VideoComposer` 대신 레인 공용 계약의 `ReelComposer` 를 쓴다.

| 계층 | 위치 | 지금 있는 것 |
| --- | --- | --- |
| 도메인 | `packages/domain/src/reel` | 프리셋(`DEFAULT_REEL_PRESET` — 캔버스·안전영역·길이·전환·자막·오디오), 배치(`computeReelLayout`·`reelLayoutIssues`), 핵심 문장·줄바꿈(`keySentence`·`wrapSubtitle`), 장면 계획(`planReel` — 글자 수 기반 노출 시간, 15~45초 맞춤, 전환 겹침, 자막 시각), SRT(`buildSrt`). 전부 순수 함수, 외부 의존 0 |
| 유스케이스 | `packages/application/src/pipeline/contracts.ts` | 레인 공용 계약(`CardRenderResult`·`ReelComposer`·`ReelResult` …). 이 레인은 계약 파일을 바이트 그대로 추가만 했다 |
| 어댑터 | `packages/adapters/video` | `createFfmpegReelComposer` — 입력 점검(PNG·4:5) → `planReel` → ffmpeg 인자(`buildFfmpegArgs`, 순수) → 실행(`ffmpeg-runner`, 유일하게 프로세스를 띄우는 곳) → ffprobe 로 규격 검사(`reelSpecIssues`). 번인 자막은 PlayRes 를 영상 크기와 같게 둔 ASS(`buildAss`)로 새긴다 |
| 인프라(조립) | `apps/cli/src/reel.ts` | `reel` 명령 — 어댑터를 만들어 꽂는 곳. `FFMPEG_PATH`·`FFPROBE_PATH` 환경 변수는 여기서만 읽는다 |

- 테스트: 순수 함수(프리셋·배치·계획·SRT·ffmpeg 인자·ASS·ffprobe 해석)는 단위 테스트, 합성은 진짜 ffmpeg 통합 테스트(ffprobe 로 1080×1920·H.264·AAC·길이, 프레임 픽셀로 장면 순서·전환·자막이 안전영역 안인지). ffmpeg 가 없으면 건너뛰지 않고 이유와 해결 방법을 담아 실패한다.
- 대시보드(`studio.ts`)에는 아직 꽂지 않았다 — 릴스 단계 화면 연결은 후속(`ReelComposer` 를 조립하는 `// [L3]` 블록 하나로 끝난다).
