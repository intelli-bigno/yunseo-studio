// 일정 수집 1회 실행 — 워커의 작업 진입점. 일정에 맞춰 부르는 등록은 L6 몫이고, 여기는 「한 번 돌고 끝나는 함수」다.
// 조립(composition root)만 한다: 원천(공식 파일)·SQLite 피드를 만들어 유스케이스에 꽂는다. 업무 규칙은 application/domain 에 있다.
import { collectEvents, type CollectEventsOptions, type EventCollectReport, type EventFeed, type EventSource } from "@yunseo/application";
import { createOfficialSources, createSqliteEventFeed } from "@yunseo/adapters-events-calendar";

export interface CollectEventsJobOptions {
  /** 저장할 SQLite 파일(대시보드의 STUDIO_DB 와 같은 파일). feed 를 직접 주지 않으면 필수 */
  dbPath?: string;
  /** 수집 창·원천 선택 */
  collect?: CollectEventsOptions;
  /** 테스트용 주입 — 기본은 Node 내장 fetch 와 공식 원천 */
  sources?: readonly EventSource[];
  feed?: EventFeed;
  now?: () => string;
}

const utcMinute = () => new Date().toISOString().replace(/:\d{2}\.\d{3}Z$/, ":00Z");

export async function collectEventsOnce(options: CollectEventsJobOptions): Promise<EventCollectReport> {
  if (!options.feed && !options.dbPath) throw new Error("저장할 DB 경로(STUDIO_DB)가 필요하다 — 저장 없이 확인만 하려면 CLI 의 `events fetch --dry` 를 쓴다");
  const sqlite = options.feed ? null : createSqliteEventFeed({ path: options.dbPath as string });
  const feed = options.feed ?? (sqlite as NonNullable<typeof sqlite>);
  try {
    const sources = options.sources ?? createOfficialSources({ fetch: globalThis.fetch });
    return await collectEvents({ sources, feed, now: options.now ?? utcMinute }, options.collect);
  } finally {
    sqlite?.close();
  }
}
