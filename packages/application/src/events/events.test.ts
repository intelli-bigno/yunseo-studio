import { describe, expect, it } from "vitest";
import { MANUAL_EVENT_SOURCE, type CalendarEvent, type StoredEvent } from "@yunseo/domain";
import { FakeRepository } from "../fakes";
import { collectEvents } from "./collect";
import { createMemoryEventFeed } from "./memory-feed";
import type { EventFeed, EventSource, EventSourceBatch } from "./ports";
import { createEventUseCases } from "./use-cases";
import { withEventFeed } from "./with-event-feed";

const ev = (patch: Partial<CalendarEvent> = {}): CalendarEvent => ({
  source: "bls-ics",
  externalId: "u-1",
  kind: "employment_headline",
  title: "Employment Situation",
  label: "미국 고용보고서",
  startsAt: "2026-11-06T13:30:00Z", // KST 11-06 22:30 (금)
  timeKnown: true,
  sourceName: "미 노동통계국(BLS) 발표 일정",
  sourceUrl: "https://www.bls.gov/schedule/news_release/",
  ...patch,
});

const source = (id: string, run: () => EventSourceBatch | Promise<EventSourceBatch>): EventSource => ({ id, name: `${id} 이름`, officialUrl: `https://example.gov/${id}`, pull: async () => run() });
const batch = (events: CalendarEvent[], patch: Partial<EventSourceBatch> = {}): EventSourceBatch => ({ source: "bls-ics", events, complete: true, window: { from: "2026-10-01T00:00:00Z", to: "2027-12-31T00:00:00Z" }, warnings: [], ...patch });
const NOW = "2026-11-05T00:00:00Z";

describe("collectEvents — 수집 유스케이스", () => {
  it("원천마다 받아 피드에 반영하고 마지막 실행을 기록한다", async () => {
    const feed = createMemoryEventFeed();
    const report = await collectEvents({ sources: [source("bls-ics", () => batch([ev()]))], feed, now: () => NOW });
    expect(report.sources).toMatchObject([{ source: "bls-ics", ok: true, fetched: 1, accepted: 1, report: { inserted: 1 } }]);
    expect(await feed.lastRuns()).toMatchObject([{ source: "bls-ics", ok: true, fetched: 1, at: NOW }]);
    expect(await feed.count()).toBe(1);
  });

  it("한 원천이 던져도 나머지를 계속하고, 실패는 오류와 함께 기록된다", async () => {
    const feed = createMemoryEventFeed();
    const sources = [
      source("a", () => {
        throw new Error("HTTP 503");
      }),
      source("bls-ics", () => batch([ev()])),
    ];
    const report = await collectEvents({ sources, feed, now: () => NOW });
    expect(report.sources.map((s) => [s.source, s.ok])).toEqual([["a", false], ["bls-ics", true]]);
    expect(report.sources[0]!.error).toBe("HTTP 503");
    expect((await feed.lastRuns()).find((r) => r.source === "a")?.ok).toBe(false);
  });

  it("검증을 통과하지 못한 일정(출처 URL 없음·일시 형식 오류)은 반영하지 않고 경고한다", async () => {
    const feed = createMemoryEventFeed();
    const bad = [ev({ externalId: "x1", sourceUrl: "" }), ev({ externalId: "x2", startsAt: "2026-11-06 13:30" }), ev({ externalId: "ok" })];
    const report = await collectEvents({ sources: [source("bls-ics", () => batch(bad))], feed, now: () => NOW });
    expect(report.sources[0]).toMatchObject({ accepted: 1, report: { inserted: 1 } });
    expect(report.sources[0]!.warnings).toHaveLength(2);
  });

  it("수집 창 밖 일정은 반영하지 않는다", async () => {
    const feed = createMemoryEventFeed();
    const out = [ev({ externalId: "past", startsAt: "2020-01-01T00:00:00Z" }), ev({ externalId: "in" })];
    const report = await collectEvents({ sources: [source("bls-ics", () => batch(out))], feed, now: () => NOW }, { daysBefore: 14, daysAfter: 400 });
    expect(report.sources[0]!.accepted).toBe(1);
  });

  it("완전하다는 응답이 0건이면 반영하지 않는다 — 기존 일정이 전부 사라짐으로 바뀌는 사고를 막는다", async () => {
    const feed = createMemoryEventFeed();
    await collectEvents({ sources: [source("bls-ics", () => batch([ev()]))], feed, now: () => NOW });
    const report = await collectEvents({ sources: [source("bls-ics", () => batch([]))], feed, now: () => "2026-11-06T00:00:00Z" });
    expect(report.sources[0]).toMatchObject({ ok: false });
    expect(report.sources[0]!.error).toMatch(/0건/);
    expect((await feed.list()).length).toBe(1);
  });

  it("only 로 원천을 고른다", async () => {
    const feed = createMemoryEventFeed();
    const pulled: string[] = [];
    const sources = ["a", "b"].map((id) => source(id, () => (pulled.push(id), batch([ev({ source: id })], { source: id }))));
    await collectEvents({ sources, feed, now: () => NOW }, { only: ["b"] });
    expect(pulled).toEqual(["b"]);
  });
});

describe("이벤트 유스케이스 — 판정·수동 입력·개요", () => {
  const make = async (events: CalendarEvent[] = [ev()]) => {
    const feed = createMemoryEventFeed();
    if (events.length > 0) await feed.upsert(batch(events), NOW);
    let n = 0;
    const uc = createEventUseCases({ feed, clock: { today: () => "2026-11-05" }, sources: [{ id: "bls-ics", name: "BLS", officialUrl: "https://www.bls.gov/" }], now: () => NOW, newId: () => `id-${(n += 1)}` });
    return { feed, uc, id: (await feed.list())[0]?.id ?? "" };
  };

  it("올리는 판정은 사유가 있어야 하고, 내리거나 제외하는 판정은 사유 없이 된다", async () => {
    const { uc, feed, id } = await make(); // 고용 핵심 → 자동 제안 watch
    expect(await uc.decideEvent({ eventId: id, decision: "major", reason: " " })).toEqual({ ok: false, errors: [expect.stringContaining("사유")] });
    expect(await feed.decisions()).toEqual([]);
    expect(await uc.decideEvent({ eventId: id, decision: "major", reason: "해석 포인트 확보" })).toEqual({ ok: true });
    expect(await feed.decisions()).toEqual([{ eventId: id, decision: "major", reason: "해석 포인트 확보", decidedAt: NOW }]);
    expect(await uc.decideEvent({ eventId: id, decision: "skip", reason: "" })).toEqual({ ok: true });
    expect((await feed.decisions())[0]!.decision).toBe("skip");
    expect(await uc.clearDecision(id)).toEqual({ ok: true });
    expect(await feed.decisions()).toEqual([]);
  });

  it("없는 일정에는 판정할 수 없다", async () => {
    const { uc } = await make();
    expect(await uc.decideEvent({ eventId: "E-none", decision: "watch", reason: "" })).toEqual({ ok: false, errors: ["일정을 찾을 수 없다"] });
  });

  it("수동 입력: KST 로 받아 UTC 로 저장하고, 확인 출처 URL 은 필수다", async () => {
    const { uc, feed } = await make([]);
    const ok = await uc.addManualEvent({ title: "미국 중간선거 결과 발표", date: "2026-11-12", time: "04:00", kind: "election", sourceUrl: "https://www.fec.gov/", note: " 메모 " });
    expect(ok).toEqual({ ok: true });
    const [saved] = await feed.list({ source: MANUAL_EVENT_SOURCE });
    expect(saved).toMatchObject({ externalId: "id-1", kind: "election", startsAt: "2026-11-11T19:00:00Z", timeKnown: true, sourceName: "수동 입력", sourceUrl: "https://www.fec.gov/", note: "메모" });

    const noUrl = await uc.addManualEvent({ title: "x", date: "2026-11-12", time: "", kind: "other", sourceUrl: "", note: "" });
    expect(noUrl).toEqual({ ok: false, errors: [expect.stringContaining("확인 출처 URL")] });
    const badUrl = await uc.addManualEvent({ title: "x", date: "2026-11-12", time: "", kind: "other", sourceUrl: "javascript:alert(1)", note: "" });
    expect(badUrl.ok).toBe(false);
  });

  it("수동 입력 검증: 제목·날짜·시각·종류, 같은 제목·일시 중복", async () => {
    const { uc } = await make([]);
    const bad = await uc.addManualEvent({ title: " ", date: "2026-02-30", time: "", kind: "nope", sourceUrl: "https://a.gov/", note: "" });
    expect(bad.ok === false && bad.errors).toHaveLength(3);
    const badTime = await uc.addManualEvent({ title: "t", date: "2026-11-12", time: "25:00", kind: "other", sourceUrl: "https://a.gov/", note: "" });
    expect(badTime.ok === false && badTime.errors[0]).toMatch(/HH:mm/);
    const input = { title: "t", date: "2026-11-12", time: "", kind: "other", sourceUrl: "https://a.gov/", note: "" };
    expect(await uc.addManualEvent(input)).toEqual({ ok: true });
    expect(await uc.addManualEvent(input)).toEqual({ ok: false, errors: ["같은 제목·일시의 수동 일정이 이미 있다"] });
  });

  it("수동 일정만 지운다", async () => {
    const { uc, feed, id } = await make();
    expect((await uc.removeManualEvent(id)).ok).toBe(false);
    await uc.addManualEvent({ title: "t", date: "2026-11-12", time: "", kind: "other", sourceUrl: "https://a.gov/", note: "" });
    const manual = (await feed.list({ source: MANUAL_EVENT_SOURCE }))[0]!;
    expect(await uc.removeManualEvent(manual.id)).toEqual({ ok: true });
  });

  it("개요: 원천별 마지막 수집·저장 수, 앞으로 30일, 변경 이력(KST), 안내 URL", async () => {
    const { uc, feed } = await make();
    await collectEvents({ sources: [source("bls-ics", () => batch([ev({ startsAt: "2026-11-09T13:30:00Z" })]))], feed, now: () => "2026-11-06T00:00:00Z" });
    const view = await uc.getEventsOverview();
    expect(view.today).toBe("2026-11-05");
    expect(view.sources).toMatchObject([{ id: "bls-ics", stored: 1, lastRun: { ok: true } }]);
    expect(view.upcoming).toMatchObject([{ when: { date: "2026-11-09", time: "22:30", weekday: "월", tz: "KST" }, suggested: "watch", human: null, effective: "watch" }]);
    expect(view.changes).toMatchObject([{ label: "미국 고용보고서", from: "11.06 22:30", to: "11.09 22:30" }]);
    expect(view.hints.length).toBeGreaterThan(0);
  });
});

describe("withEventFeed — StudioRepository 데코레이터", () => {
  const today = { today: () => "2026-11-05" };

  it("수집한 일정이 없으면 원래 저장소의 시안 데이터를 그대로 돌려 준다", async () => {
    const base = new FakeRepository([], [], [{ date: "2026-11-05", time: "04:00", tz: "KST", label: "시안", mark: "fact", source: "s", importance: "major" }], [{ id: "E-31", date: "2026-11-10", label: "시안 후보", questions: { a: true, b: true, c: true, d: false, e: true }, decision: null }]);
    const repo = withEventFeed(base, { feed: createMemoryEventFeed(), clock: today });
    expect((await repo.listWeekVariables()).map((v) => v.label)).toEqual(["시안"]);
    expect((await repo.listEventCandidates()).map((c) => c.label)).toEqual(["시안 후보"]);
  });

  it("수집한 일정이 있으면 이번 주의 변수·후보함을 거기서 채운다 (사람이 제외한 건 빠진다)", async () => {
    const feed = createMemoryEventFeed();
    await feed.upsert(batch([ev(), ev({ externalId: "cpi", kind: "inflation_headline", label: "미국 CPI", startsAt: "2026-11-10T13:30:00Z" }), ev({ externalId: "noise", kind: "data_release_other", label: "잡음", startsAt: "2026-11-06T15:00:00Z" })]), NOW);
    const repo = withEventFeed(new FakeRepository(), { feed, clock: today });
    expect((await repo.listWeekVariables()).map((v) => [v.label, v.importance, v.time])).toEqual([["미국 고용보고서", "watch", "22:30"]]);
    expect((await repo.listEventCandidates()).map((c) => c.label)).toEqual(["미국 고용보고서", "미국 CPI"]);

    const jobs = (await feed.list()).find((e) => e.externalId === "u-1") as StoredEvent;
    await feed.decide({ eventId: jobs.id, decision: "skip", reason: "", decidedAt: NOW });
    expect(await repo.listWeekVariables()).toEqual([]);
    expect((await repo.listEventCandidates()).find((c) => c.id === jobs.id)?.decision).toBe("skip");
  });

  it("revision = 원래 저장소 + 일정 피드 — 일정·판정이 바뀌면 읽기 캐시가 낡는다", async () => {
    const base = new FakeRepository();
    base.rev = 5;
    const feed = createMemoryEventFeed();
    const repo = withEventFeed(base, { feed, clock: today });
    expect(await repo.revision()).toBe(5);
    await feed.upsert(batch([ev()]), NOW);
    expect(await repo.revision()).toBe(6);
  });

  it("다른 읽기(편·대기열)는 그대로 통과시킨다", async () => {
    const base = new FakeRepository();
    const repo = withEventFeed(base, { feed: createMemoryEventFeed() as EventFeed, clock: today });
    expect(await repo.listPieces()).toEqual([]);
    expect(await repo.getPiece("x")).toBeNull();
    expect(await repo.listQueue()).toEqual([]);
  });
});
