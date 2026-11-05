// StudioRepository 데코레이터 — 후보함·이번 주의 변수를 수집한 일정(EventFeed)에서 채운다.
// 수집한 일정이 하나도 없으면(시안 모드·첫 실행 전) 원래 저장소의 값을 그대로 돌려 준다.
// 읽기 캐시(withReadCache)는 이 데코레이터 바깥에 씌운다 — revision 이 일정·판정 변경까지 반영해야 캐시가 제때 낡는다.
import { addDays, selectEventCandidates, selectEventWeekVariables, type EventCandidate, type WeekVariable } from "@yunseo/domain";
import type { Clock, StudioRepository } from "../ports";
import type { EventFeed } from "./ports";

export interface WithEventFeedDeps {
  feed: EventFeed;
  clock: Clock;
  /** 후보함이 보여 줄 일수 (오늘부터) */
  candidateDays?: number;
}

export function withEventFeed(repo: StudioRepository, { feed, clock, candidateDays = 21 }: WithEventFeedDeps): StudioRepository {
  const load = async (from: string, to: string) => {
    const [events, decided, changes] = await Promise.all([feed.list({ from: `${from}T00:00:00Z`, to: `${to}T23:59:00Z` }), feed.decisions(), feed.latestTimeChanges()]);
    return { events, decisions: new Map(decided.map((d) => [d.eventId, d])), timeChanges: new Map(changes.map((c) => [c.eventId, c])) };
  };

  return {
    listPieces: () => repo.listPieces(),
    getPiece: (id) => repo.getPiece(id),
    listQueue: () => repo.listQueue(),

    async listWeekVariables(): Promise<readonly WeekVariable[]> {
      if ((await feed.count()) === 0) return repo.listWeekVariables();
      const today = clock.today();
      // KST 날짜가 UTC 와 하루 어긋날 수 있어 앞뒤로 넉넉히 읽고, 걸러내기는 도메인이 KST 날짜로 한다
      const { events, decisions, timeChanges } = await load(addDays(today, -8), addDays(today, 8));
      return selectEventWeekVariables({ events, decisions, timeChanges, today });
    },

    async listEventCandidates(): Promise<readonly EventCandidate[]> {
      if ((await feed.count()) === 0) return repo.listEventCandidates();
      const today = clock.today();
      const { events, decisions, timeChanges } = await load(addDays(today, -2), addDays(today, candidateDays + 2));
      return selectEventCandidates({ events, decisions, timeChanges, today }, candidateDays);
    },

    async revision(): Promise<number> {
      const [base, events] = await Promise.all([repo.revision(), feed.revision()]);
      return base + events;
    },
  };
}
