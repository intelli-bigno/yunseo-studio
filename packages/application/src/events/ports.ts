// 일정 수집 포트 — 원천(EventSource)은 파일·API 를 받아 정규화하고, 피드(EventFeed)는 저장·판정을 맡는다(04 포트 표).
// 유스케이스는 이 둘만 안다. 네트워크·SQLite 는 어댑터(events-calendar) 몫이다.
import type { CalendarEvent, EventChange, EventDecision, StoredEvent } from "@yunseo/domain";

/** UTC ISO 구간 (양 끝 포함) */
export interface EventWindow {
  from: string;
  to: string;
}

/** 원천 한 번 받은 결과 */
export interface EventSourceBatch {
  source: string;
  events: readonly CalendarEvent[];
  /** 원천이 이 창 전체를 담았는가. 참이면 창 안에서 빠진 기존 일정을 「사라짐」으로 기록한다 */
  complete: boolean;
  window: EventWindow;
  /** 읽다가 건너뛴 항목 등 */
  warnings: readonly string[];
}

export interface EventSource {
  readonly id: string;
  /** 사람이 읽는 이름 (예: 미 노동통계국(BLS) 발표 일정) */
  readonly name: string;
  /** 확인용 공식 안내 페이지 */
  readonly officialUrl: string;
  /** 공식 파일을 받아 정규화한다 (이 이름은 application 이 네트워크를 직접 부르지 않는다는 검사와 겹치지 않게 pull 로 둔다) */
  pull(window: EventWindow): Promise<EventSourceBatch>;
}

export interface EventUpsertReport {
  inserted: number;
  changed: number;
  unchanged: number;
  removed: number;
  duplicates: number;
  conflicts: number;
}

/** 원천 한 번 돌린 기록 — 수집 현황 화면용 */
export interface EventFetchRun {
  source: string;
  /** UTC ISO */
  at: string;
  ok: boolean;
  fetched: number;
  report: EventUpsertReport | null;
  error: string | null;
  warnings: readonly string[];
}

export interface EventListQuery {
  /** UTC ISO, 일정 시작 기준 (양 끝 포함) */
  from?: string;
  to?: string;
  source?: string;
  includeRemoved?: boolean;
}

export interface EventFeed {
  /** 원천 한 묶음을 반영한다 — 중복 제거·변경 이력·사라짐 처리를 한 번에(원자적) */
  upsert(batch: EventSourceBatch, now: string): Promise<EventUpsertReport>;
  list(query?: EventListQuery): Promise<readonly StoredEvent[]>;
  count(): Promise<number>;
  get(id: string): Promise<StoredEvent | null>;
  /** 수동 입력 일정만 지운다. 지웠으면 true */
  removeManual(id: string): Promise<boolean>;
  /** 최근 이력부터 */
  changes(limit?: number): Promise<readonly EventChange[]>;
  /** 일정별 가장 최근 일시 변경 */
  latestTimeChanges(): Promise<readonly EventChange[]>;
  decisions(): Promise<readonly EventDecision[]>;
  decide(decision: EventDecision): Promise<void>;
  clearDecision(eventId: string): Promise<void>;
  recordRun(run: EventFetchRun): Promise<void>;
  /** 원천별 마지막 실행 */
  lastRuns(): Promise<readonly EventFetchRun[]>;
  /** 일정·판정이 바뀔 때마다 오르는 숫자 — 읽기 캐시가 낡음을 값싸게 안다 */
  revision(): Promise<number>;
}
