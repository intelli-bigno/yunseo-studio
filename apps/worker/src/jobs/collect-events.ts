// [L7] 공식 일정 수집 — 하루 두 번(KST 06:10 · 18:10). collectEventsOnce(L4)를 그대로 부른다.
// 시각 근거: 원천(연준·BLS·BEA)은 연간 일정을 미리 공개하고 바뀌는 일이 드물다. 06:10 은 아침 편성 전에, 18:10 은 미국 장 전
// 공지(전날 밤 KST 갱신분)를 한 번 더 잡는다. 03:30 백업과 겹치지 않게 분은 10 으로 둔다. 놓친 회차는 따라잡지 않는다(다음 회차가 같은 일을 한다).
import type { EventCollectReport } from "@yunseo/application";
import { AppError } from "@yunseo/domain";
import { collectEventsOnce } from "../collect-events";
import type { JobDefinition } from "../registry";
import { daily } from "../schedule";

export interface CollectEventsJobDeps {
  dbPath: string;
  /** 테스트에서 바꿔 끼운다 — 기본은 L4 의 collectEventsOnce(공식 원천·SQLite) */
  collect?: typeof collectEventsOnce;
}

export const COLLECT_EVENTS_TIMES = ["06:10", "18:10"] as const;

/** 시각마다 작업 하나(스케줄은 작업당 하루 한 시각) — 이름 collect-events-0610 · collect-events-1810 */
export function createCollectEventsJobs({ dbPath, collect = collectEventsOnce }: CollectEventsJobDeps): JobDefinition[] {
  return COLLECT_EVENTS_TIMES.map((at) => ({
    name: `collect-events-${at.replace(":", "")}`,
    schedule: daily(at),
    timeoutMs: 5 * 60_000,
    async run() {
      const r = await collect({ dbPath });
      const failed = r.sources.filter((x) => !x.ok);
      const line = r.sources.map((x) => `${x.source} ${x.ok ? `${x.accepted}/${x.fetched}` : "실패"}`).join(" · ");
      // 원천 하나라도 실패면 작업 실패로 기록한다(상태 화면이 빨간 줄로 보인다). 성공한 원천의 반영은 이미 끝났다
      if (failed.length) throw new AppError("UPSTREAM_FAILED", `${line} — ${failed.map((x) => `${x.source}: ${x.error ?? "오류"}`).join("; ")}`);
      return line;
    },
  }));
}

export type { EventCollectReport };
