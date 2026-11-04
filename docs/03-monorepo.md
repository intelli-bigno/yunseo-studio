# 03. 모노레포 구조

스택이 미정이므로([결정 필요 D1]) 구조는 언어 중립으로 적고, 예시는 TypeScript(pnpm workspace) 기준이다.

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
