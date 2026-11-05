# 녹화한 응답 픽스처

공식 원천이 내려주는 파일을 2026-11-05 에 Aside(실제 브라우저 프로필)로 받아, 구조는 그대로 두고 일정 몇 건만 남긴 것이다.
계약 테스트는 이 파일만 읽는다 — 테스트에서 네트워크를 쓰지 않는다. 실제 파일 모양이 바뀌면 `events fetch --dry` 가 0건/오류로 알려 주고, 여기 파일을 새로 받아 갱신한다.

| 파일 | 원본 | 손질 |
| --- | --- | --- |
| `fed-calendar.json` | https://www.federalreserve.gov/json/calendar.json (application/json, 2,603건) | FOMC·Beige·Stat·Speeches·빈 월·빈 객체 대표 10건 + announcement 1건. 항목은 원본 그대로 |
| `bls-trimmed.ics` | https://www.bls.gov/schedule/news_release/bls.ics (text/calendar, 313건, LF) | VTIMEZONE 머리말 + 2026-11·12월 대표 7건 + 서머타임(EDT) 확인용 2026-03 CPI 1건 |
| `bea-trimmed.ics` | https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics (CRLF, 줄 접기, 169건) | 대표 5건 — 줄 접기(GDP 2건), `DTSTART;VALUE=DATE-TIME:` 변형(2025-01-30 GDP 속보치), 일반 `DTSTART:` 형식, SEQUENCE 개정 4(2026-01-22). 항목은 원본 그대로, CRLF 유지(`.gitattributes` 로 줄바꿈 변환 금지) |
