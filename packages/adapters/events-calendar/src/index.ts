// 어댑터 계층: events-calendar — 공식 일정 원천(EventSource)과 일정 저장소(EventFeed)를 구현한다.
import type { EventSource, EventSourceInfo } from "@yunseo/application";
import { createBeaIcsSource, createBlsIcsSource } from "./ics-sources";
import { createFedCalendarSource } from "./fed-calendar";
import type { FetchLike } from "./http";

export * from "./http";
export * from "./ics";
export * from "./time-zone";
export * from "./kinds";
export * from "./fed-calendar";
export * from "./ics-sources";
export * from "./sqlite-event-feed";

export interface OfficialSourcesOptions {
  fetch: FetchLike;
  userAgent?: string;
}

/** 기계 판독 파일(ICS·JSON)이 확인된 공식 원천 전부 — docs/05 §5.4 표 */
export function createOfficialSources(options: OfficialSourcesOptions): EventSource[] {
  return [createFedCalendarSource(options), createBlsIcsSource(options), createBeaIcsSource(options)];
}

/** 수집 현황 화면용 — 원천 이름·공식 안내 페이지(받기 없이 정보만) */
export function describeOfficialSources(): EventSourceInfo[] {
  const never: FetchLike = () => Promise.reject(new Error("describeOfficialSources 는 받지 않는다"));
  return createOfficialSources({ fetch: never }).map(({ id, name, officialUrl }) => ({ id, name, officialUrl }));
}
