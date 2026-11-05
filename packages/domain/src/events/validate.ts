// 일정 검증 — 원천 어댑터와 수동 입력이 같은 규칙으로 걸러진다. 문제가 없으면 빈 배열.
import { CALENDAR_EVENT_KINDS, isEventSourceUrl, type CalendarEvent } from "./model";
import { normalizeEventUtc } from "./time";

export const EVENT_TITLE_MAX = 160;

export function eventIssues(e: CalendarEvent): string[] {
  const out: string[] = [];
  if (e.source.trim() === "") out.push("원천이 비었다");
  if (e.externalId.trim() === "") out.push("외부 id 가 비었다");
  if (e.title.trim() === "") out.push("제목이 비었다");
  if (e.title.length > EVENT_TITLE_MAX || e.label.length > EVENT_TITLE_MAX) out.push(`제목이 ${EVENT_TITLE_MAX}자를 넘는다`);
  if (!(CALENDAR_EVENT_KINDS as readonly string[]).includes(e.kind)) out.push(`알 수 없는 종류: ${e.kind}`);
  if (normalizeEventUtc(e.startsAt) !== e.startsAt) out.push(`일시는 UTC ISO(YYYY-MM-DDTHH:mm:00Z) 여야 한다: ${e.startsAt}`);
  if (!isEventSourceUrl(e.sourceUrl)) out.push("확인 출처 URL 은 http(s) 주소여야 한다");
  return out;
}
