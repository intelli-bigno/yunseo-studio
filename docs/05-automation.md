# 05. 자동화 — 가능성과 한계

판단 방식: 기존 가정 → 근본 사실 → 결론. 공식 문서 재확인이 필요한 사실은 `[미검증]` 으로 표시했다(이 문서는 외부 계정에 접속하지 않고 작성됨).

## 5.1 게시 — Instagram

| 기존 가정 | "API 로 캐러셀을 자동 게시할 수 있다" |
| --- | --- |
| 근본 사실 | ①Meta 의 Instagram 콘텐츠 게시 API(Content Publishing)는 **프로페셔널 계정(비즈니스/크리에이터)**만 대상이다. ②캐러셀은 항목(이미지/영상) 컨테이너를 만든 뒤 묶음 컨테이너를 만들어 게시하는 다단계 호출이다(컨테이너 생성 → 묶음 → 상태 확인 → 게시). ③이미지는 파일 업로드가 아니라 **공개 URL 에서 Meta 가 가져가는 방식**이다 → 렌더 PNG 를 JPEG 로 바꿔 공개 접근 가능한 저장소에 올려야 한다. ④캐러셀 항목 상한은 **20개**다(예전 가정 10개 → **바뀜**, 2026-11-05 실측). 24시간 API 게시 상한은 **문서끼리 어긋난다**(가이드 100건 / 캐러셀 항목·한도 조회 참조 50건) → 코드는 낮은 50건을 상한으로 쓰고 실제 값은 `content_publishing_limit` 조회로 확인한다. 캐러셀은 1건으로 센다. 컨테이너는 24시간 뒤 만료되고 24시간에 400개까지 만들 수 있다. ⑤이미지는 **JPEG 만** 허용(**확인됨**) — 우리 카드는 PNG 라 게시 직전 sRGB JPEG 변환이 필요하고, 8MB·가로세로비 4:5~1.91:1·폭 320~1440 규격을 따른다. ⑥Meta 앱 생성·액세스 토큰 발급이 필요하고, 토큰은 만료·갱신 관리가 필요하다. 문서는 본인이 소유·관리하는 계정이면 Standard Access 로 쓸 수 있다고 적는다. 앱 심사 면제 여부는 App Review 문서를 열람하지 않았다 [미검증]. 근거(URL·확인일·원문)는 §5.8. |
| 결론 | 기술적으로 가능하나 **선결 조건 3개**: 프로페셔널 계정 전환, Meta 앱·토큰, 공개 이미지 호스팅. MVP 는 `publisher-manual`(업로드 묶음 + 캡션 복사)로 시작하고, 위 3개가 확보되면 API 게시를 켠다. 어떤 경우든 사람 승인 뒤에만 호출. 지금 구현은 **dry-run 뿐**이다 — `publisher-instagram` 이 요청 계획(엔드포인트·순서·파라미터·예상 할당량)과 규격 위반을 보여 주고 호출 코드는 없다(04 문서 「구현 현황」). |

## 5.2 게시 — YouTube Shorts

| 기존 가정 | "Data API 로 Shorts 를 자동 업로드할 수 있다" |
| --- | --- |
| 근본 사실 | ①YouTube Data API v3 `videos.insert` 로 업로드한다. Shorts 전용 플래그는 없고 **정사각형·세로 비율이며 3분 이하**면 Shorts 로 분류된다(**확인됨**, 2024-10-15 이후 업로드 기준). ②업로드 할당량은 **호출당 1단위, 하루 100회**(자기 버킷)이고 그 밖의 메서드는 합쳐 하루 10,000단위다(**바뀜** — 예전 가정 1,600단위·하루 약 6회는 폐기). 일일 할당량은 태평양시 자정에 초기화. ③「감사 전 API 프로젝트의 영상은 비공개 고정」은 현행 문서에서 **사라졌다**: `videos.insert` 참조는 「미검증 API 프로젝트도 비공개로 고정되지 않는다」고 적고, 감사는 기본 할당량을 늘릴 때 필요한 절차로만 나온다. 다만 크리에이터 계정 설정에 따라 비공개가 기본일 수 있다. ④OAuth 동의·리프레시 토큰 관리가 필요하다(범위 `youtube.upload`). 근거는 §5.8. |
| 결론 | 자동 업로드는 가능하다. 공개 업로드가 문서상 막혀 있지는 않지만, 승인 게이트(G3) 때문에 **비공개 업로드 → 사람이 YouTube Studio 에서 공개(또는 예약 공개 확인)**를 계획의 기본으로 유지한다. 지금 구현은 dry-run 뿐(`publisher-youtube`). |

## 5.3 일정 실행

| 기존 가정 | "정해진 시각에 렌더·게시가 돈다" |
| --- | --- |
| 근본 사실 | ①일정 실행에는 **항상 켜진 실행 주체**가 필요하다: 상시 서버, 클라우드 스케줄러, CI 크론, 또는 집 PC. ②플랫폼 자체 예약 게시: Instagram 게시 API 문서에는 **예약 시각 파라미터가 없다**(있다는 근거도 없음) → 우리 쪽 스케줄러가 그 시각에 `media_publish` 를 불러야 한다. YouTube 는 `status.publishAt` 으로 예약 공개를 지정할 수 있다 — **private 상태이고 한 번도 공개된 적 없는 영상에만** 설정 가능하며 과거 시각이면 즉시 공개된다(**확인됨**). ③CI 크론(예: GitHub Actions)은 정시 실행을 보장하지 않고 수 분~수십 분 지연될 수 있다 [미검증]. |
| 결론 | 렌더·변환처럼 시각이 덜 중요한 잡은 어떤 스케줄러든 된다. "발표 전날 저녁" 같은 게시 시각은 수 분 오차가 허용되므로 CI 크론도 후보지만, 실패 감지·재시도를 위해 **잡 기록이 DB 에 남는 워커**를 권장. 호스팅은 D3 로 확정했다(2026-11-04 사용자): MVP 는 Windows 실행기 + SQLite, M3 에서 재판단. 상주 실행·스케줄러·백업 구현은 [10-operations.md](10-operations.md)(L6). |

## 5.4 이벤트 캘린더 감지

| 기존 가정 | "중요 이벤트를 자동으로 찾아준다" |
| --- | --- |
| 근본 사실 | ①정기 이벤트는 **공식 기관이 연간 일정을 미리 공개**한다: 미 연준 FOMC 회의 일정, 미 노동통계국(BLS) 발표 일정(고용·CPI), 각국 중앙은행 회의, 선거일. 이 원천은 무료이며 형식이 기관마다 다르다 — **원천별 형식을 2026-11-05 에 실측했다(아래 표)**. ②기업 실적 발표일은 기업이 따로 공지하며 한곳에 모은 무료·안정적 원천은 드물다. 상용 경제 캘린더 API 는 유료가 일반적이다 [미검증]. ③돌발 이슈(정책 발표·지정학)는 캘린더로 감지할 수 없다. |
| 결론 | 단계별로: MVP = 사람이 대시보드에 이벤트 입력 + 공식 일정 몇 개(연준·BLS)를 연 1회 수동 일괄 등록. 자동화 단계 = 공식 원천 파서로 주기 수집해 **후보만 제안**(선정은 사람). 유료 캘린더 API 는 수동 입력 부담이 실측으로 확인될 때만 검토. 웹 수집이 필요한 원천은 사용자 규칙상 Aside 경유만 허용되므로, 서버 무인 수집은 공개 API·파일 다운로드 원천으로 한정한다. 구현(2026-11-05, L4): 아래 ✅ 원천 3개를 자동 수집하고, 나머지는 수동 입력 화면(확인 출처 URL 필수)으로 처리한다. |

### 원천별 형식 실측 (2026-11-05, Aside 로 공식 페이지·파일 확인)

확인 방법: 공식 일정 페이지를 Aside 로 열어 ICS·CSV·JSON·API 링크를 찾고, 파일 주소는 같은 사이트 안에서 받아 구조를 읽었다. **HTML 페이지는 읽지 않았다**(긁기 금지). 녹화한 응답은 `packages/adapters/events-calendar/fixtures/` 에 있고 계약 테스트가 쓴다.

| 원천 | 형식 | 주소 | 실측 결과 | 처리 |
| --- | --- | --- | --- | --- |
| 미 연준 달력 | **JSON 파일** | `https://www.federalreserve.gov/json/calendar.json` | `application/json`, 2,603건. `events[]` = `{title, time("2:00 p.m." 미 동부), month("YYYY-MM"), days("9" 또는 "1, 2, 3"), type(FOMC·Beige·Testimony·Stat·Speeches…), description(HTML 이스케이프), link?}`. 식별자 없음 → `type│title│month(│일)` 로 키를 조립. 월이 빈 옛 항목·빈 객체가 섞여 있음. **문서화된 API 가 아니라 달력 페이지가 읽는 공개 파일**이라 모양이 바뀔 수 있다 | ✅ 자동 — FOMC(회의·기자회견·의사록)·베이지북·의회 증언만 |
| 미 노동통계국(BLS) | **ICS** | `https://www.bls.gov/schedule/news_release/bls.ics` (페이지에 구독 링크로 공개) | `text/calendar`, 313건(2025-01 ~ 2026-12), LF, `TZID=US-Eastern`(VTIMEZONE 에 EDT/EST 규칙), `UID` 고정, `DURATION:PT0M`, `CATEGORIES:IMPORTANT, BLS` | ✅ 자동 |
| 미 경제분석국(BEA) | **ICS** (+ JSON) | `https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics`, `https://apps.bea.gov/API/signup/release_dates.json` | ICS: 169건(~2027-12), CRLF·**줄 접기**, 시각은 UTC(`…Z`), `SEQUENCE` 로 개정 표시, `DTSTART` 형식 2종. JSON(12KB, 발표명별 `release_dates`)은 같은 정보라 쓰지 않음 | ✅ 자동 (ICS) |
| 유럽중앙은행(ECB) | HTML 만 | `…/press/calendars/mgcgc/html/index.en.html` | 페이지의 파일 링크는 RSS 뿐, ICS·CSV·JSON 없음 | ✍️ 수동 입력 |
| 영란은행(BoE) | HTML (+ 투표 이력 xlsx) | `…/monetary-policy/upcoming-mpc-dates` | xlsx(`mpcvoting.xlsx`)는 과거 투표 기록이고 일정이 아님 | ✍️ 수동 입력 |
| 일본은행(BoJ) | HTML 만 | `…/en/mopo/mpmsche_minu/index.htm` | 일정 파일 링크 없음 | ✍️ 수동 입력 |
| 한국은행 | 미확인 | — | 일정 페이지에서 파일 링크를 확인하지 못했다(열어 본 주소가 오류 페이지). ECOS Open API 는 인증키가 필요해 쓰지 않음 | ✍️ 수동 입력 |
| 선거일 | 기관마다 다름 | — | 단일 공식 파일 원천을 확인하지 못함. API 는 키가 필요하거나 HTML 이다 | ✍️ 수동 입력 (확인 출처 URL 필수) |

- ✅ 원천의 실제 받기(Node `fetch`, 공식 파일 URL 만)는 `pnpm exec tsx apps/cli/src/main.ts events fetch --dry` 로 저장 없이 개수만 확인한다. 2026-11-05 Windows 실행기에서 3개 원천 모두 성공했다(수집 창 2026-10-22 ~ 2027-12-10, User-Agent 는 도구 이름을 밝히고 브라우저로 위장하지 않음):

  | 원천 | 받은 일정(창 안) |
  | --- | --- |
  | `fed-calendar` | 7 (FOMC 회의·기자회견·의사록, 베이지북) |
  | `bls-ics` | 27 |
  | `bea-ics` | 58 |
  | 합계 | 92 — 다음 일정 예: 11.06 고용보고서(자동 제안 watch)·11.10 CPI(watch)·11.13 PPI(watch), 보조 통계는 skip |
- 수집은 후보만 제안한다: 중요도는 02 §3.2 규칙의 점검표(a~e)를 종류별 기본값으로 채워 제안하고(d 운영자 해석은 항상 「아니오」라 자동 제안은 `watch` 를 넘지 않는다), `major` 로 올리는 것은 사람이 사유와 함께 한다.
- 일정 변경은 조용히 고치지 않는다: 같은 (원천, 외부 id) 의 일시·제목이 바뀌면 이력을 남기고, 원천에서 사라지면 「사라짐」으로 숨긴다(응답이 0건이거나 오류면 반영하지 않아 기존 일정이 지워지지 않는다).
- 시간은 UTC 로 저장하고 KST 로 보인다. 연준(미 동부 12시간제)·BLS(`US-Eastern`)는 서머타임을 반영해 UTC 로 바꾼다(`America/New_York`, 표준 `Intl`).

## 5.5 원고 초안 (LLM)

- 가능: 포맷 단(5단) 채우기, 문장 다듬기(발행 언어 기준), 주장 추출.
- 한계: 수치·날짜 환각 위험 → 3단계 출처 검증을 우회할 수 없게 도메인 규칙으로 막는다. 호출당 비용 발생 → [결정 필요 D4].
- 구현(2026-11-05, L4 — 자리만): 포트 `ScriptDrafter`(application)와 **로컬 명령 실행 어댑터**(`packages/adapters/llm`)의 골격. 설정(명령 JSON 배열)이 없으면 **꺼져 있고** 아무것도 실행하지 않는다. 유료 API 를 직접 부르지 않으며, 사용자가 설정한 로컬 명령에 요청을 stdin 으로 주고 stdout JSON(`{stages:[{key, body}]}`)을 받는다. 결과는 항상 `drafted_by: assistant` 이고, 금지 표현 block 이 있으면 초안을 버린다. 화면 연결은 D4 결정 뒤.

## 5.6 렌더·영상 합성

- 카드: HTML → PNG 로컬 렌더. 비용 0, 결정적(같은 입력 → 같은 출력).
- Shorts: 이미지 + 자막 + (선택) 음성 → ffmpeg 류 합성. CPU 작업이므로 실행 위치는 사용자 인프라 규칙(무거운 작업은 Windows 실행기)을 따른다.
- TTS 는 외부 서비스면 비용, 로컬이면 품질 실측 필요 [미검증] → [결정 필요 D6].

## 5.7 자동화 수준 요약

| 단계 | MVP | 자동화 단계 | 끝까지 사람 |
| --- | --- | --- | --- |
| 소재 후보 | 수동 입력 | 공식 캘린더 수집 → 후보 제안 | 선정 |
| 원고 | 수동 (템플릿 폼) | LLM 초안 (선택) | 저장·수정 |
| 출처 검증 | 출처 칸 필수 + 링크 확인 | 동일 + 시장 수치 재확인 알림 | 내용 일치 판정 |
| 카드 렌더 | 자동 | 자동 | — |
| Shorts | 자동 (자막만) | 자동 (+ 음성 선택) | — |
| 검수 | 사람 | 사람 | **항상** |
| 게시 | 업로드 묶음 수동 | IG API · YT 비공개 업로드 | YT 공개 전환(감사 전) |
| 성과 | 수동 입력 | API 수집 | 해석 |

## 5.8 플랫폼 규격 실측 (2026-11-05)

[미검증] 이던 게시 규격을 **공개 공식 문서만** 읽어 확인했다(Aside 로 열람 — 로그인·계정 접속·앱 생성 없음). 표의 「원문 인용」은 문서의 영어 원문이다. 값은 코드 상수 `packages/domain/src/publish/specs.ts` 와 근거 목록 `evidence.ts` 에 그대로 있고, 아래 표는 `evidence.ts` 에서 만들었다(항목 id 가 코드와 같다 — `tests/l5-dry-run-guard.test.ts` 가 id·주소가 이 문서에 있는지 확인한다).

바뀐 값 요약: **캐러셀 10 → 20개 · YouTube 업로드 1,600단위/하루 6회 → 1단위/하루 100회 · 「감사 전 비공개 고정」 문구 삭제**. 그대로 확인된 값: JPEG 만, 4:5~1.91:1, 8MB, 캡션 2,200자, publishAt(private 한정), Shorts 3분. 문서끼리 어긋난 값: 24시간 게시 상한(100 / 50) — 낮은 50 을 상한으로 쓴다.

| 항목 | 플랫폼 | 기존 가정 | 실측 결과 | 근거 문서 | 원문 인용(영어 원문 그대로) |
| --- | --- | --- | --- | --- | --- |
| `ig-carousel-max` | Instagram | 캐러셀 항목 상한 10개 | **바뀜** — 최대 20개(이미지·영상 합산). 우리 카드(표지+5단+출처 = 7장)는 한도 안. | [문서](https://developers.facebook.com/documentation/instagram-platform/content-publishing) · 문서 갱신 2026-10-20 · 확인 2026-11-05 | “Carousels are limited to 20 images, videos, or a mix of the two.” |
| `ig-publish-24h` | Instagram | 계정당 24시간 API 게시 상한 | **문서끼리 다름** — 문서끼리 다르다: 가이드 Rate Limit 은 100건, 같은 가이드의 캐러셀 항목·content_publishing_limit 참조는 50건. 코드는 낮은 50건을 상한으로 쓰고, 실제 값은 content_publishing_limit 조회로 확인한다. 캐러셀은 1건으로 센다. | [문서](https://developers.facebook.com/documentation/instagram-platform/content-publishing) · 문서 갱신 2026-10-20 · 확인 2026-11-05 | “Instagram accounts are limited to 100 API-published posts within a 24-hour moving period. Carousels count as a single post. / Accounts are limited to 50 published posts within a 24-hour period. Publishing a carousel counts as a single post.” |
| `ig-publish-24h-reference` | Instagram | 계정당 24시간 API 게시 상한 | **문서끼리 다름** — content_publishing_limit 참조 문서(2024-07-23 갱신)는 quota_total 이 50. | [문서](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit) · 문서 갱신 2024-07-23 · 확인 2026-11-05 | “quota_total — The maximum number of IG Containers the app user can publish within the quota_duration time period (currently 50).” |
| `ig-container-limit` | Instagram | (가정 없음) 컨테이너 생성 한도 | **확인됨** — 컨테이너는 24시간 뒤 만료, 24시간 이동 구간에 400개까지 생성. 캐러셀 1건 = 항목 컨테이너 N개 + 묶음 컨테이너 1개. | [문서](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media) · 문서 갱신 (미표기) · 확인 2026-11-05 | “Containers expire after 24 hours / An Instagram account can only create 400 containers within a rolling 24 hour period” |
| `ig-image-jpeg` | Instagram | 이미지는 JPEG 만 | **확인됨** — JPEG 만 허용(MPO·JPS 같은 확장 JPEG 도 불가). 우리 카드는 PNG 라 게시 직전 JPEG(sRGB) 변환이 필요하다. | [문서](https://developers.facebook.com/documentation/instagram-platform/content-publishing) · 문서 갱신 2026-10-20 · 확인 2026-11-05 | “JPEG is the only image format supported. Extended JPEG formats such as MPO and JPS are not supported.” |
| `ig-image-spec` | Instagram | (가정 없음) 이미지 용량·비율·폭 | **확인됨** — 8MB 이하, 가로세로비 4:5~1.91:1, 폭 320~1440(범위 밖은 자동 확대·축소), sRGB. 우리 카드 1080x1350 은 정확히 4:5 로 한도 하한. | [문서](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media) · 문서 갱신 (미표기) · 확인 2026-11-05 | “Format: JPEG / File size: 8 MB maximum. / Aspect ratio: Must be within a 4:5 to 1.91:1 range / Minimum width: 320 (will be scaled up to the minimum if necessary) / Maximum width: 1440 (will be scaled down to the maximum if necessary) / Color Space: sRGB.” |
| `ig-carousel-crop` | Instagram | (가정 없음) 캐러셀 비율 | **확인됨** — 모든 장이 첫 장 비율로 잘린다(기본 1:1). 첫 장을 4:5 로 두면 4:5 로 맞춰진다. | [문서](https://developers.facebook.com/documentation/instagram-platform/content-publishing) · 문서 갱신 2026-10-20 · 확인 2026-11-05 | “Carousel images are all cropped based on the first image in the carousel, with the default being a 1:1 aspect ratio.” |
| `ig-caption` | Instagram | (가정 없음) 캡션 한도 | **확인됨** — 캡션 2,200자, 해시태그 30개, @ 태그 20개. 이미지 대체 텍스트(alt_text)는 1,000자(단일 이미지·캐러셀 이미지만). | [문서](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media) · 문서 갱신 (미표기) · 확인 2026-11-05 | “Maximum 2200 characters, 30 hashtags, and 20 @ tags. / For image posts only. Alternative text, up to 1000 character, for an image. Only supported on a single image or image media in a carousel.” |
| `ig-reel-spec` | Instagram | (가정 없음) 릴스 규격 | **확인됨** — MP4/MOV, H.264/HEVC, 23~60fps, 폭 1920 이하, 3초~15분, 300MB 이하, 9:16 권장. 릴스는 캐러셀에 넣을 수 없다. | [문서](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media) · 문서 갱신 (미표기) · 확인 2026-11-05 | “Container: MOV or MP4 ... Frame rate: 23-60 FPS. / Duration: 15 mins maximum, 3 seconds minimum / File size: 300MB maximum / Reels cannot appear in carousels” |
| `ig-public-url` | Instagram | 이미지는 공개 URL 에서 Meta 가 가져간다 | **확인됨** — image_url/video_url 은 게시 시도 시점에 공개 접근이 가능해야 한다(파일 업로드 방식은 릴스 재개 가능 업로드뿐). | [문서](https://developers.facebook.com/documentation/instagram-platform/content-publishing) · 문서 갱신 2026-10-20 · 확인 2026-11-05 | “We cURL media used in publishing attempts, so the media must be hosted on a publicly accessible server at the time of the attempt.” |
| `ig-schedule` | Instagram | Instagram 은 API 로 예약 시각 지정이 안 된다 | **근거 없음** — 게시 가이드와 미디어 참조 어디에도 예약 파라미터가 없다(있다는 근거도 없음). 우리 쪽 스케줄러가 그 시각에 media_publish 를 부르는 것으로 계획한다. | [문서](https://developers.facebook.com/documentation/instagram-platform/content-publishing) · 문서 갱신 2026-10-20 · 확인 2026-11-05 | “We recommend that your app also enforce the publishing rate limit, especially if your app allows app users to schedule posts to be published in the future.” |
| `yt-upload-quota` | YouTube | 업로드 1회 = 1,600단위, 일일 10,000단위 → 하루 약 6회 | **바뀜** — videos.insert 는 자기 버킷(Video Uploads)에서 호출당 1단위, 기본 하루 100회. 나머지 메서드는 합쳐 하루 10,000단위. 일일 할당량은 태평양시 자정 초기화. | [문서](https://developers.google.com/youtube/data/determine_quota_cost) · 문서 갱신 2026-11-03 · 확인 2026-11-05 | “Projects that enable the YouTube Data API have a default quota allocation of 100 search.list calls, 100 videos.insert calls, and 10,000 units per day combined for all other endpoints. ... Daily quotas reset at midnight Pacific Time (PT).” |
| `yt-insert-quota-impact` | YouTube | 업로드 할당량 | **바뀜** — videos.insert 참조 문서도 같은 값: 하루 100회, 호출당 1단위. 파일 최대 256GB. | [문서](https://developers.google.com/youtube/data/reference/rest/v3/videos/insert) · 문서 갱신 (미표기) · 확인 2026-11-05 | “Quota impact: 100 calls per day. A call to this method has a quota cost of 1 unit in the Video Uploads quota bucket. / Maximum file size: 256GB” |
| `yt-private-lock` | YouTube | 감사 전 API 프로젝트로 올린 영상은 비공개 고정 | **바뀜** — 현행 문서는 「미검증 API 프로젝트도 비공개로 고정되지 않는다」고 적는다(예전 정책 문구 삭제). 단 크리에이터 계정 설정에 따라 비공개가 기본일 수 있다. 우리는 안전을 위해 비공개 업로드 → 사람이 공개로 계획한다. | [문서](https://developers.google.com/youtube/data/reference/rest/v3/videos) · 문서 갱신 (미표기) · 확인 2026-11-05 | “In a videos.insert request, if you don't specify a value for this property, the uploaded video's privacy status defaults to public. Certain uploads might default to private based on creator account settings, as explained in the YouTube Help Center. Videos uploaded from unverified API projects are not restricted to private viewing mode.” |
| `yt-audit` | YouTube | 공개 전환하려면 감사 신청이 필요하다 | **바뀜** — 감사는 기본 할당량을 늘릴 때 필요한 절차로 적혀 있고, 업로드 공개 조건으로는 적혀 있지 않다. | [문서](https://developers.google.com/youtube/data/guides/quota_and_compliance_audits) · 문서 갱신 2026-11-03 · 확인 2026-11-05 | “If you would like to request additional quota beyond the default allocation, you must first complete an audit to show that your project is in compliance with the YouTube API Services Terms of Service.” |
| `yt-publish-at` | YouTube | status.publishAt 으로 예약 공개 | **확인됨** — privacyStatus 가 private 일 때만, 한 번도 공개된 적 없는 영상에만 설정 가능. 과거 시각이면 즉시 공개된다. | [문서](https://developers.google.com/youtube/data/reference/rest/v3/videos) · 문서 갱신 (미표기) · 확인 2026-11-05 | “The date and time when the video is scheduled to publish. It can be set only if the privacy status of the video is private. ... If your request schedules a video to be published at some time in the past, the video will be published right away.” |
| `yt-shorts-length` | YouTube | Shorts 길이 상한 3분 | **확인됨** — 2024-10-15 이후 업로드 영상은 정사각형·세로 비율이고 3분 이하면 Shorts 로 분류. 별도 Shorts 플래그는 없다. | [문서](https://support.google.com/youtube/answer/15424877) · 문서 갱신 (미표기) · 확인 2026-11-05 | “Videos uploaded after October 15, 2024: Any videos uploaded on or after this date with a square or vertical aspect ratio up to three minutes in length will be categorized as Shorts on YouTube.” |
| `yt-metadata-limits` | YouTube | (가정 없음) 메타데이터 한도 | **확인됨** — 제목 100자(< > 불가), 설명 5,000바이트(한글은 글자당 3바이트), 태그 합계 500자(쉼표·공백 포함 계산). 아동용 여부(selfDeclaredMadeForKids)·합성 콘텐츠 공개(containsSyntheticMedia)는 업로드 때 채널 소유자가 밝힌다. | [문서](https://developers.google.com/youtube/data/reference/rest/v3/videos) · 문서 갱신 (미표기) · 확인 2026-11-05 | “The property value has a maximum length of 100 characters and may contain all valid UTF-8 characters except < and >. / maximum length of 5000 bytes / The property value has a maximum length of 500 characters.” |

### 열람한 문서 목록 (2026-11-05)

| 문서 | 주소 | 문서 갱신일 |
| --- | --- | --- |
| Instagram Platform — Content Publishing | https://developers.facebook.com/documentation/instagram-platform/content-publishing | 2026-10-20 |
| IG User Media (컨테이너 생성 파라미터·이미지/릴스 규격) | https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media | 미표기 |
| IG User Content Publishing Limit | https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit | 2024-07-23 |
| Instagram Media Insights (지표 이름) | https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media/insights | 2026-09-11 |
| Instagram Platform insights (한계) | https://developers.facebook.com/documentation/instagram-platform/insights | 2026-10-20 |
| YouTube Data API — videos.insert | https://developers.google.com/youtube/data/reference/rest/v3/videos/insert | 미표기 |
| YouTube Data API — Videos 리소스 | https://developers.google.com/youtube/data/reference/rest/v3/videos | 미표기 |
| YouTube Data API — Quota Calculator | https://developers.google.com/youtube/data/determine_quota_cost | 2026-11-03 |
| YouTube Data API — Quota and Compliance Audits | https://developers.google.com/youtube/data/guides/quota_and_compliance_audits | 2026-11-03 |
| YouTube Data API — Resumable Uploads | https://developers.google.com/youtube/data/guides/using_resumable_upload_protocol | 미표기 |
| YouTube Help — Understand three-minute YouTube Shorts | https://support.google.com/youtube/answer/15424877 | 미표기 |
| YouTube Analytics API — Metrics | https://developers.google.com/youtube/analytics/metrics | 미표기 |

Graph API 의 문서상 최신 버전은 **v27.0** 이다(`GRAPH_API_VERSION`). 버전은 앱 생성 시점 기준으로 고정되므로 실제 연결 때 다시 확인한다.

### 아직 [미검증] 으로 남은 것

- Meta 앱 심사: 본인 소유 계정만 쓸 때 심사가 필요한지(App Review 문서 미열람).
- Instagram 캐러셀 **최소 장수**: 문서에 적혀 있지 않다. 코드는 2장 미만이면 캐러셀이 아니라 단일 이미지 게시로 계획한다.
- 릴스 **코덱·프레임율**: 렌더 계약(`ReelResult`)에 값이 없어 검사하지 못하고 「영상을 직접 실측하라」는 경고를 남긴다.
- YouTube `snippet.categoryId` 필수 여부: 계획에 자리표시자만 둔다(구현 때 `videos.insert` 필수 속성 재확인).
- CI 크론 정시성(5.3 ③).

## 5.9 성과 지표 이름과 가져오기 열 이름

| 구분 | 확인한 사실 (원문 출처: 5.8 문서 목록) |
| --- | --- |
| Instagram 미디어 지표 | `views` · `reach` · `likes` · `comments` · `saved` · `shares` · `profile_visits` · `follows` · `total_interactions` · `ig_reels_avg_watch_time`. `impressions` 는 「For media created after July 2, 2024, this metric is deprecated」 → 새 게시물은 `views`. `profile_visits`·`follows` 의 대상은 FEED(게시물)·STORY 이고 **REELS 로는 적혀 있지 않다**. 계산 데이터는 최대 48시간 늦을 수 있고, 지표 보관은 최대 2년. 캐러셀 안의 개별 미디어는 인사이트가 없다. 값이 없으면 0 이 아니라 빈 결과가 온다. |
| YouTube 분석 지표 | `views` · `engagedViews` · `estimatedMinutesWatched` · `averageViewDuration` · `averageViewPercentage` · `likes` · `comments` · `shares` · `subscribersGained` · `subscribersLost`. |
| 내보내기 CSV 의 열 제목 | **공개 문서에서 확인하지 못했다** (Meta Business Suite 인사이트 내보내기, YouTube Studio 분석 내보내기). 그래서 가져오기 화면은 공식 지표 이름과 맞는 열만 「공식」, 나머지는 「추정」으로 표시하고 **항상 열 매핑을 사람이 확인**한다. 같은 모양의 파일이면 확인한 매핑을 기억한다. |
| `ig_reels_avg_watch_time` 단위 | 문서에 단위가 없다. 입력은 초로 받는다 [미검증]. |

지표 모델은 `packages/domain/src/metrics`, 가져오기 열 추정은 `csv.ts` 의 `OFFICIAL`(공식 이름)·`GUESS`(추정) 표다. 성과 수치는 **운영자 내부용**이며 해석 문구를 만들지 않는다(02 문서 §7).
