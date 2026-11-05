// 일정 수집 유스케이스 — 원천마다 받아 → 검증 → 피드에 반영. 한 원천이 실패해도 나머지는 계속한다.
// 일정을 언제 돌릴지(등록)는 이 파일의 몫이 아니다 — 워커 진입점이 1회 실행 함수로 부르고, 스케줄 등록은 별도(L6).
import { addDays, eventIssues, type CalendarEvent } from "@yunseo/domain";
import type { EventWindow, EventFeed, EventSource, EventUpsertReport } from "./ports";

export interface CollectEventsDeps {
  sources: readonly EventSource[];
  feed: EventFeed;
  /** UTC ISO (분 단위로 잘린 값이면 충분) */
  now: () => string;
}

export interface CollectEventsOptions {
  /** 오늘 기준으로 며칠 전부터 */
  daysBefore?: number;
  /** 오늘 기준으로 며칠 뒤까지 */
  daysAfter?: number;
  /** 지정하면 이 id 의 원천만 돌린다 */
  only?: readonly string[];
}

export interface EventSourceReport {
  source: string;
  name: string;
  ok: boolean;
  fetched: number;
  /** 검증을 통과해 반영 대상이 된 수 */
  accepted: number;
  report: EventUpsertReport | null;
  error: string | null;
  warnings: string[];
}

export interface EventCollectReport {
  at: string;
  window: EventWindow;
  sources: EventSourceReport[];
}

const clip = (message: string) => (message.length > 300 ? `${message.slice(0, 300)}…` : message);

export async function collectEvents(deps: CollectEventsDeps, options: CollectEventsOptions = {}): Promise<EventCollectReport> {
  const at = deps.now();
  const day = at.slice(0, 10);
  const window: EventWindow = { from: `${addDays(day, -(options.daysBefore ?? 14))}T00:00:00Z`, to: `${addDays(day, options.daysAfter ?? 400)}T23:59:00Z` };
  const picked = deps.sources.filter((s) => !options.only || options.only.includes(s.id));
  const sources: EventSourceReport[] = [];

  for (const source of picked) {
    const out: EventSourceReport = { source: source.id, name: source.name, ok: false, fetched: 0, accepted: 0, report: null, error: null, warnings: [] };
    try {
      const batch = await source.pull(window);
      out.fetched = batch.events.length;
      out.warnings.push(...batch.warnings);
      const accepted: CalendarEvent[] = [];
      for (const e of batch.events) {
        if (e.startsAt < window.from || e.startsAt > window.to) continue;
        const issues = eventIssues(e);
        if (issues.length > 0) out.warnings.push(`건너뜀 ${e.externalId}: ${issues.join("; ")}`);
        else accepted.push(e);
      }
      out.accepted = accepted.length;
      // 원천이 창 전체를 담았다고 하는데 쓸 수 있는 일정이 0건이면 장애 응답일 수 있다 — 반영하면 기존 일정이 전부 「사라짐」이 된다
      if (batch.complete && accepted.length === 0) throw new Error("쓸 수 있는 일정이 0건이다 — 반영하지 않았다 (원천 응답 확인 필요)");
      out.report = await deps.feed.upsert({ ...batch, events: accepted, window }, at);
      out.ok = true;
    } catch (error) {
      out.error = clip(error instanceof Error ? error.message : String(error));
    }
    await deps.feed.recordRun({ source: source.id, at, ok: out.ok, fetched: out.fetched, report: out.report, error: out.error, warnings: out.warnings.slice(0, 20) });
    sources.push(out);
  }
  return { at, window, sources };
}
