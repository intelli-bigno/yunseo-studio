// `events fetch --dry` — 공식 일정 원천을 실제로 받아 저장 없이 개수만 보고한다(메모리 피드, DB 를 열지 않는다).
// 저장해서 반영하는 실행은 워커 진입점(apps/worker collectEventsOnce) 몫이다.
import { collectEvents, createMemoryEventFeed, type EventCollectReport } from "@yunseo/application";
import { createOfficialSources, type FetchLike } from "@yunseo/adapters-events-calendar";
import { addDays, eventKstDisplay, suggestEventImportance } from "@yunseo/domain";

export interface EventsDeps {
  fetch: FetchLike;
  /** UTC ISO */
  now: () => string;
}

export interface EventsResult {
  code: number;
  lines: string[];
}

const USAGE = "사용법: events fetch --dry [--source <id>]... [--sample <N>]   (저장 없이 개수만 보고)";

export async function runEvents(args: string[], deps: EventsDeps): Promise<EventsResult> {
  const [sub, ...flags] = args;
  if (sub !== "fetch") return { code: 2, lines: [USAGE] };
  if (!flags.includes("--dry")) return { code: 2, lines: [USAGE, "저장 실행은 워커 진입점을 쓴다: pnpm --filter @yunseo/app-worker run collect-events (STUDIO_DB 필요)"] };

  const only: string[] = [];
  let sample = 5;
  for (let i = 0; i < flags.length; i += 1) {
    if (flags[i] === "--source" && flags[i + 1]) only.push(flags[(i += 1)] as string);
    else if (flags[i] === "--sample" && flags[i + 1]) sample = Math.max(0, Math.min(30, Number(flags[(i += 1)]) || 0));
  }

  const sources = createOfficialSources({ fetch: deps.fetch });
  const unknown = only.filter((id) => !sources.some((s) => s.id === id));
  if (unknown.length > 0) return { code: 2, lines: [`알 수 없는 원천: ${unknown.join(", ")} (가능: ${sources.map((s) => s.id).join(", ")})`] };

  const feed = createMemoryEventFeed();
  const report = await collectEvents({ sources, feed, now: deps.now }, only.length > 0 ? { only } : {});
  const lines = renderReport(report);

  const today = report.at.slice(0, 10);
  const upcoming = (await feed.list({ from: `${today}T00:00:00Z`, to: `${addDays(today, 30)}T23:59:00Z` })).slice(0, sample);
  if (upcoming.length > 0) {
    lines.push("", `다음 일정 ${upcoming.length}건 (KST · 자동 제안):`);
    for (const e of upcoming) {
      const w = eventKstDisplay(e.startsAt, e.timeKnown);
      lines.push(`  ${w.date.slice(5).replace("-", ".")} ${w.weekday} ${w.time.padEnd(5)} ${suggestEventImportance(e).padEnd(5)} ${e.label}  [${e.source}]`);
    }
  }
  lines.push("", "저장하지 않음 (--dry)");
  return { code: report.sources.every((s) => s.ok) ? 0 : 1, lines };
}

function renderReport(report: EventCollectReport): string[] {
  const lines = [`수집 창: ${report.window.from.slice(0, 10)} ~ ${report.window.to.slice(0, 10)} (UTC)`];
  let total = 0;
  for (const s of report.sources) {
    if (s.ok) {
      total += s.accepted;
      lines.push(`✓ ${s.source}  ${s.name}: 받음 ${s.fetched}건 → 창 안 ${s.accepted}건 (신규 ${s.report?.inserted ?? 0} · 중복 ${s.report?.duplicates ?? 0})`);
    } else {
      lines.push(`✗ ${s.source}  ${s.name}: ${s.error}`);
    }
    for (const w of s.warnings.slice(0, 3)) lines.push(`    ! ${w}`);
    if (s.warnings.length > 3) lines.push(`    ! … 경고 ${s.warnings.length - 3}건 더`);
  }
  lines.push(`합계 ${total}건 (성공 ${report.sources.filter((s) => s.ok).length}/${report.sources.length} 원천)`);
  return lines;
}
