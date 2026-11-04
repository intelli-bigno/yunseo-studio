# 03. 모노레포 구조

스택은 확정 전이다([결정 필요 D1]). 구조는 언어 중립으로 적었고, 기본 셋팅은 추천안인 TypeScript(pnpm workspace)로 만들었다.

```
yunseo-studio/
  apps/
    dashboard/        운영 웹 화면 (06 문서). 유스케이스만 호출, 외부 API 직접 호출 금지
    worker/           일정 실행·잡 큐 소비자 (렌더·변환·게시·지표 수집)
    cli/              로컬 운영 명령 (렌더 미리보기·프리셋 검증·수동 게시 패키지 생성)
  packages/
    domain/           엔티티·값 객체·상태 기계·규칙. 외부 의존 0
    application/      유스케이스 + 포트(인터페이스) 정의
    presets-schema/   프리셋 스키마와 로더 (파일 → 검증된 객체)
    adapters/
      render-html/    카드 렌더 (HTML → PNG)
      video/          Shorts 합성 (예: ffmpeg)
      publisher-instagram/
      publisher-youtube/
      publisher-manual/   업로드용 묶음(폴더/zip) 생성 — API 없이도 동작하는 기본 게시기
      events-calendar/    이벤트 캘린더 원천
      llm/                원고 초안 (선택)
      storage/            DB·파일 저장소
      metrics/            지표 수집
    templates/        카드·Shorts 템플릿 (포맷별)
    config/           공용 lint·tsconfig·의존 경계 규칙
  presets/            01 문서의 프리셋 파일 (코드 아님, 데이터)
  content/            콘텐츠 정본 (편별 YAML) — 지금은 예시 1건
  tests/              패키지 경계(선언 의존) 검사
  docs/
```

## 경계 규칙

| 규칙 | 이유 |
| --- | --- |
| `apps/*` 끼리 import 금지 | 앱은 배포 단위. 공유할 건 `packages/` 로 |
| `apps/*` 는 `application` + 필요한 `adapters/*` 를 조립(composition root)만 한다 | 업무 규칙이 앱에 새면 대시보드·워커·CLI 가 서로 다르게 동작 |
| `presets/` 는 `presets-schema` 로만 읽는다 | 스키마 검증을 건너뛰는 경로 차단 |
| `templates/` 는 프리셋 키만 참조, 브랜드 이름 하드코딩 금지 | 이름 확정 시 교체만으로 반영 (01 문서) |
| 비밀값은 저장소에 두지 않고 실행 환경에서 주입 | 개인 저장소라도 Git 이력은 영구 |

- 경계는 CI 의 의존 검사 도구로 강제한다(예: dependency-cruiser 또는 ESLint boundaries). [결정 필요 D1 에 종속]
- 패키지는 처음부터 다 만들지 않는다. MVP 는 `domain`·`application`·`presets-schema`·`render-html`·`publisher-manual`·`storage`·`apps/dashboard` 만 (07 로드맵).

## 현재 골격 (기본 셋팅, 2026-11-04)

| 위치 | 상태 |
| --- | --- |
| `packages/domain` | 동작 — 금지 표현 검사(`compliance/`), 이슈 이전 5단 카드 스키마(`content/`), 검증 도구. `story/`(상태 기계)는 빈 모듈 |
| `packages/application` | 빈 모듈 (유스케이스·포트 자리) |
| `packages/presets-schema` | 동작 — 프리셋 스키마·로더·자리표시자(`TBD`) 탐지 |
| `packages/adapters/{render-html,publisher-manual,storage}` | 빈 모듈 (MVP 어댑터 3개 자리) |
| `apps/cli` | 동작 — `pnpm run validate [--publish]` (프리셋·콘텐츠·금지 표현 검증) |
| `apps/{dashboard,worker}` | 빈 모듈 |
| `templates/`, `config/` 패키지 | 아직 만들지 않음 (M1 에서 필요할 때) |

### 검사 명령

```
pnpm run lint        eslint — import 단위 경계(04 의존 규칙)
pnpm run typecheck   tsc --noEmit
pnpm run test        vitest — 도메인·프리셋·CLI + tests/boundaries (선언 의존 경계)
pnpm run check       위 셋을 차례로
```

경계는 두 겹으로 강제한다: ESLint `no-restricted-imports`(import 문)와 `tests/boundaries.test.ts`(package.json 선언 의존).
GitHub Actions(`.github/workflows/ci.yml`)가 PR·main push 마다 `check` 를 돌린다.
