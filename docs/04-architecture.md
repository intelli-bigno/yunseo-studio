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

### 경계 강제 — 네 겹

1. **ESLint**(`eslint.config.mjs`): 규칙 1~3(import 문 단위) + 대시보드에서 어댑터·`node:*` 는 `src/server/` 안에서만 + 클라이언트 섬(`components/`)은 유스케이스·서버 조립부·어댑터 import 금지.
2. **선언 의존**(`tests/boundaries.test.ts`): `package.json` 의 의존 방향.
3. **import 그래프**(`tests/import-graph.test.ts`): 전체 소스를 훑어 계층별 import 허용 목록, 「어댑터를 import 하는 대시보드 파일은 `server/studio.ts` 하나」, 선언 없이 쓰는 workspace 의존 없음, 패키지 밖으로 나가는 상대 경로 없음.
4. **규칙이 실제로 잡는지**(`tests/eslint-boundaries.test.ts`): 위반 코드 16개를 ESLint 에 넣어 잡히는지·올바른 import 는 통과하는지 확인 — 규칙을 고치다 구멍이 나면 여기서 드러난다.

유스케이스와 SQLite 를 실제로 이은 통합 검증은 `tests/studio-integration.test.ts`, 포트 계약 테스트는 `packages/adapters/storage/src/sqlite-studio-repository.test.ts`. 성능 정책(읽기 캐시·렌더 전략)은 [09-performance.md](09-performance.md).

