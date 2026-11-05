// L4 일정 수집을 실제 SQLite 한 파일 위에서 끝까지 잇는다(조립부와 같은 모양):
// 공식 원천(녹화 응답) → 수집 유스케이스 → l4_* 테이블 → StudioRepository 데코레이터 → 편성 화면 유스케이스.
import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { collectEvents, createEventUseCases, createStudioUseCases, withEventFeed, withReadCache } from "../packages/application/src/index";
import { BEA_ICS_URL, BLS_ICS_URL, FED_CALENDAR_URL, createOfficialSources, createSqliteEventFeed } from "../packages/adapters/events-calendar/src/index";
import { fakeFetch, fixture } from "../packages/adapters/events-calendar/src/fixtures";
import { createSqliteStudioRepository, DEFAULT_SEED, SEED_TODAY } from "../packages/adapters/storage/src/index";

const dir = mkdtempSync(join(tmpdir(), "l4-integration-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const path = join(dir, "studio.sqlite");

const feed = createSqliteEventFeed({ path });
const studioRepo = createSqliteStudioRepository({ path, seed: DEFAULT_SEED }); // 데모 시안 데이터를 채운 DB (L2 이후 빈 DB 는 자동으로 채우지 않는다)
const repo = withReadCache(withEventFeed(studioRepo, { feed, clock: { today: () => SEED_TODAY } }));
const uc = createStudioUseCases({ repo, clock: { today: () => SEED_TODAY }, cards: { activeSet: async () => ({ id: "a", label: "", names: [], aspect: "3 / 4" }), read: async () => null } });
const events = createEventUseCases({ feed, clock: { today: () => SEED_TODAY }, sources: [], now: () => "2026-11-04T01:00:00Z", newId: () => "manual-1" });
afterAll(() => {
  feed.close();
  studioRepo.close();
});

describe("일정 수집 × 편성 화면 (같은 DB 파일)", () => {
  it("수집 전: 시안 데이터(후보 3건)가 그대로 보인다", async () => {
    const view = await uc.getSchedule("week");
    expect(view.candidates.map((c) => c.id)).toEqual(["E-31", "E-32", "E-33"]);
    expect(view.variables).toHaveLength(4);
  });

  it("수집 뒤: 이번 주의 변수·후보함이 공식 일정에서 채워진다 (KST)", async () => {
    const f = fakeFetch({
      [FED_CALENDAR_URL]: { type: "application/json", body: fixture("fed-calendar.json") },
      [BLS_ICS_URL]: { type: "text/calendar", body: fixture("bls-trimmed.ics") },
      [BEA_ICS_URL]: { type: "text/plain", body: fixture("bea-trimmed.ics") },
    });
    const report = await collectEvents({ sources: createOfficialSources({ fetch: f }), feed, now: () => "2026-11-04T00:00:00Z" });
    expect(report.sources.every((s) => s.ok)).toBe(true);

    const view = await uc.getSchedule("week"); // 오늘 2026-11-04(수) → 주 11-02 ~ 11-08
    expect(view.variables.map((v) => [v.date, v.time, v.tz, v.label, v.importance, v.mark])).toEqual([
      ["2026-11-04", "00:00", "KST", "미국 구인·이직 조사(JOLTS)", "watch", "fact"],
      ["2026-11-06", "22:30", "KST", "미국 고용보고서(비농업 고용·실업률)", "watch", "fact"],
    ]);
    expect(view.variables[1]!.source).toBe("미 노동통계국(BLS) 발표 일정");
    expect(view.candidates.map((c) => c.label)).toEqual(["미국 구인·이직 조사(JOLTS)", "미국 고용보고서(비농업 고용·실업률)", "미국 소비자물가지수(CPI)", "미국 생산자물가지수(PPI)", "FOMC 의사록 공개", "미국 개인소득·지출(PCE 물가 포함)"]);
    expect(view.candidates.every((c) => c.decision === null)).toBe(true);
  });

  it("오늘 화면의 이번 주의 변수도 같은 데이터를 쓴다", async () => {
    expect((await uc.getTodayBoard()).variables.map((v) => v.label)).toEqual(["미국 구인·이직 조사(JOLTS)", "미국 고용보고서(비농업 고용·실업률)"]);
  });

  it("사람이 판정하면 읽기 캐시가 바로 낡아 화면에 반영된다 (올리기는 사유 필수)", async () => {
    const jobs = (await feed.list()).find((e) => e.label.startsWith("미국 고용보고서"))!;
    expect((await events.decideEvent({ eventId: jobs.id, decision: "major", reason: "" })).ok).toBe(false);
    expect((await uc.getSchedule("week")).variables.find((v) => v.label.startsWith("미국 고용보고서"))?.importance).toBe("watch");

    expect(await events.decideEvent({ eventId: jobs.id, decision: "major", reason: "시나리오가 갈리고 운영자 해석이 있다" })).toEqual({ ok: true });
    const after = await uc.getSchedule("week");
    expect(after.variables.find((v) => v.label.startsWith("미국 고용보고서"))?.importance).toBe("major");
    expect(after.candidates.find((c) => c.id === jobs.id)?.decision).toBe("major");

    await events.decideEvent({ eventId: jobs.id, decision: "skip", reason: "" });
    expect((await uc.getSchedule("week")).variables.map((v) => v.label)).toEqual(["미국 구인·이직 조사(JOLTS)"]);
    await events.clearDecision(jobs.id);
    expect((await uc.getSchedule("week")).variables).toHaveLength(2);
  });

  it("수동 입력도 같은 후보함에 들어오고, 이번 주면 변수에 나온다", async () => {
    expect(await events.addManualEvent({ title: "미국 중간선거 결과 발표", date: "2026-11-05", time: "", kind: "election", sourceUrl: "https://www.usa.gov/election-day", note: "" })).toEqual({ ok: true });
    const view = await uc.getSchedule("week");
    expect(view.variables.map((v) => v.label)).toContain("미국 중간선거 결과 발표");
    expect(view.variables.find((v) => v.label === "미국 중간선거 결과 발표")).toMatchObject({ date: "2026-11-05", time: "—", tz: "", source: "수동 입력" });
  });

  it("같은 파일에 기존 테이블과 l4_ 테이블이 공존한다 (storage 스키마를 건드리지 않는다)", () => {
    const db = new DatabaseSync(path, { readOnly: true });
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
    db.close();
    expect(names).toEqual(expect.arrayContaining(["pieces", "week_variables", "event_candidates", "queue", "meta", "l4_events", "l4_event_history", "l4_decisions", "l4_fetch_runs", "l4_meta"]));
  });
});
