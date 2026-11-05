// EventFeed 계약 테스트 — 같은 시험을 메모리 구현과 SQLite 구현에 돌린다(04 테스트 전략).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createMemoryEventFeed, type EventFeed, type EventSourceBatch } from "@yunseo/application";
import type { CalendarEvent } from "@yunseo/domain";
import { createSqliteEventFeed } from "./sqlite-event-feed";

const ev = (patch: Partial<CalendarEvent> = {}): CalendarEvent => ({
  source: "bls-ics",
  externalId: "u-1",
  kind: "inflation_headline",
  title: "Consumer Price Index",
  label: "미국 소비자물가지수(CPI)",
  startsAt: "2026-11-10T13:30:00Z",
  timeKnown: true,
  sourceName: "미 노동통계국(BLS) 발표 일정",
  sourceUrl: "https://www.bls.gov/schedule/news_release/",
  ...patch,
});
const window = { from: "2026-11-01T00:00:00Z", to: "2027-11-01T00:00:00Z" };
const batch = (events: CalendarEvent[], patch: Partial<EventSourceBatch> = {}): EventSourceBatch => ({ source: "bls-ics", events, complete: true, window, warnings: [], ...patch });

const dir = mkdtempSync(join(tmpdir(), "l4-feed-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const impls: [string, () => EventFeed][] = [
  ["메모리", () => createMemoryEventFeed()],
  ["SQLite(메모리 DB)", () => createSqliteEventFeed()],
];

describe.each(impls)("EventFeed 계약 — %s", (_name, make) => {
  it("처음 넣으면 신규, 그대로 다시 넣으면 그대로(중복 없음)", async () => {
    const feed = make();
    expect(await feed.upsert(batch([ev()]), "2026-11-05T00:00:00Z")).toMatchObject({ inserted: 1, changed: 0, unchanged: 0 });
    expect(await feed.upsert(batch([ev()]), "2026-11-06T00:00:00Z")).toMatchObject({ inserted: 0, changed: 0, unchanged: 1 });
    expect(await feed.count()).toBe(1);
    const [stored] = await feed.list();
    expect(stored).toMatchObject({ title: "Consumer Price Index", firstSeenAt: "2026-11-05T00:00:00Z", removedAt: null, timeKnown: true });
  });

  it("같은 묶음 안의 중복 행은 한 건으로 줄고 보고에 센다", async () => {
    const feed = make();
    expect(await feed.upsert(batch([ev(), ev()]), "2026-11-05T00:00:00Z")).toMatchObject({ inserted: 1, duplicates: 1 });
  });

  it("일시가 바뀌면 같은 일정이 갱신되고 이력이 남는다 (id 불변)", async () => {
    const feed = make();
    await feed.upsert(batch([ev()]), "2026-11-05T00:00:00Z");
    const [before] = await feed.list();
    expect(await feed.upsert(batch([ev({ startsAt: "2026-11-13T13:30:00Z" })]), "2026-11-06T00:00:00Z")).toMatchObject({ inserted: 0, changed: 1 });
    const [after] = await feed.list();
    expect(after).toMatchObject({ id: before!.id, startsAt: "2026-11-13T13:30:00Z", firstSeenAt: "2026-11-05T00:00:00Z", updatedAt: "2026-11-06T00:00:00Z" });
    expect(await feed.changes()).toEqual([{ eventId: before!.id, at: "2026-11-06T00:00:00Z", type: "time_changed", from: "2026-11-10T13:30:00Z", to: "2026-11-13T13:30:00Z" }]);
    expect(await feed.latestTimeChanges()).toHaveLength(1);
  });

  it("원천에서 빠지면 사라짐 처리(목록에서 숨김), 다시 나타나면 복원 — 이력 둘 다", async () => {
    const feed = make();
    await feed.upsert(batch([ev()]), "2026-11-05T00:00:00Z");
    expect(await feed.upsert(batch([ev({ externalId: "u-2", startsAt: "2026-11-20T13:30:00Z" })]), "2026-11-06T00:00:00Z")).toMatchObject({ inserted: 1, removed: 1 });
    expect((await feed.list()).map((e) => e.externalId)).toEqual(["u-2"]);
    expect((await feed.list({ includeRemoved: true })).map((e) => e.externalId)).toEqual(["u-1", "u-2"]);
    await feed.upsert(batch([ev(), ev({ externalId: "u-2", startsAt: "2026-11-20T13:30:00Z" })]), "2026-11-07T00:00:00Z");
    expect((await feed.list()).map((e) => e.externalId)).toEqual(["u-1", "u-2"]);
    expect((await feed.changes()).map((c) => c.type)).toEqual(["restored", "removed"]);
  });

  it("complete 가 아닌 묶음은 기존 일정을 지우지 않는다", async () => {
    const feed = make();
    await feed.upsert(batch([ev()]), "2026-11-05T00:00:00Z");
    expect(await feed.upsert(batch([], { complete: false }), "2026-11-06T00:00:00Z")).toMatchObject({ removed: 0 });
    expect(await feed.list()).toHaveLength(1);
  });

  it("목록 조건: 기간·원천", async () => {
    const feed = make();
    await feed.upsert(batch([ev(), ev({ externalId: "u-2", startsAt: "2026-12-10T13:30:00Z" })]), "2026-11-05T00:00:00Z");
    await feed.upsert({ source: "bea-ics", events: [ev({ source: "bea-ics", externalId: "b-1", startsAt: "2026-11-25T13:30:00Z" })], complete: true, window, warnings: [] }, "2026-11-05T00:00:00Z");
    expect((await feed.list({ from: "2026-11-15T00:00:00Z", to: "2026-12-31T00:00:00Z" })).map((e) => e.externalId)).toEqual(["b-1", "u-2"]);
    expect((await feed.list({ source: "bea-ics" })).map((e) => e.externalId)).toEqual(["b-1"]);
  });

  it("수동 입력은 지울 수 있고, 수집한 일정은 지울 수 없다", async () => {
    const feed = make();
    await feed.upsert(batch([ev()]), "2026-11-05T00:00:00Z");
    await feed.upsert({ source: "manual", events: [ev({ source: "manual", externalId: "m-1", kind: "election", title: "선거", label: "선거", startsAt: "2026-11-12T00:00:00Z", timeKnown: false })], complete: false, window, warnings: [] }, "2026-11-05T00:00:00Z");
    const [collected, manual] = await feed.list();
    expect(await feed.removeManual(collected!.id)).toBe(false);
    expect(await feed.removeManual(manual!.id)).toBe(true);
    expect(await feed.list()).toHaveLength(1);
  });

  it("사람의 판정: 저장·덮어쓰기·지우기, 값이 바뀔 때마다 revision 이 오른다", async () => {
    const feed = make();
    await feed.upsert(batch([ev()]), "2026-11-05T00:00:00Z");
    const [e] = await feed.list();
    const r0 = await feed.revision();
    await feed.decide({ eventId: e!.id, decision: "major", reason: "해석 포인트", decidedAt: "2026-11-05T01:00:00Z" });
    await feed.decide({ eventId: e!.id, decision: "skip", reason: "", decidedAt: "2026-11-05T02:00:00Z" });
    expect(await feed.decisions()).toEqual([{ eventId: e!.id, decision: "skip", reason: "", decidedAt: "2026-11-05T02:00:00Z" }]);
    expect(await feed.revision()).toBe(r0 + 2);
    await feed.clearDecision(e!.id);
    expect(await feed.decisions()).toEqual([]);
    expect(await feed.revision()).toBe(r0 + 3);
    await feed.clearDecision(e!.id); // 없는 판정 지우기는 변화 없음
    expect(await feed.revision()).toBe(r0 + 3);
  });

  it("바뀐 것이 없는 수집은 revision 을 올리지 않는다 (읽기 캐시 보존)", async () => {
    const feed = make();
    await feed.upsert(batch([ev()]), "2026-11-05T00:00:00Z");
    const r = await feed.revision();
    await feed.upsert(batch([ev()]), "2026-11-06T00:00:00Z");
    expect(await feed.revision()).toBe(r);
  });

  it("원천별 마지막 실행 기록은 덮어쓴다", async () => {
    const feed = make();
    await feed.recordRun({ source: "bls-ics", at: "2026-11-05T00:00:00Z", ok: false, fetched: 0, report: null, error: "HTTP 503", warnings: [] });
    await feed.recordRun({ source: "bls-ics", at: "2026-11-06T00:00:00Z", ok: true, fetched: 8, report: { inserted: 8, changed: 0, unchanged: 0, removed: 0, duplicates: 0, conflicts: 0 }, error: null, warnings: ["x"] });
    expect(await feed.lastRuns()).toEqual([{ source: "bls-ics", at: "2026-11-06T00:00:00Z", ok: true, fetched: 8, report: { inserted: 8, changed: 0, unchanged: 0, removed: 0, duplicates: 0, conflicts: 0 }, error: null, warnings: ["x"] }]);
  });
});

describe("SQLite 전용", () => {
  it("파일 DB: 닫았다 다시 열어도 일정·판정·이력·실행 기록이 남는다 (l4_ 접두사 테이블)", async () => {
    const path = join(dir, "studio.sqlite");
    const a = createSqliteEventFeed({ path });
    await a.upsert(batch([ev()]), "2026-11-05T00:00:00Z");
    await a.upsert(batch([ev({ startsAt: "2026-11-12T13:30:00Z" })]), "2026-11-06T00:00:00Z");
    const [e] = await a.list();
    await a.decide({ eventId: e!.id, decision: "watch", reason: "", decidedAt: "2026-11-06T01:00:00Z" });
    await a.recordRun({ source: "bls-ics", at: "2026-11-06T00:00:00Z", ok: true, fetched: 1, report: null, error: null, warnings: [] });
    a.close();

    const b = createSqliteEventFeed({ path });
    expect((await b.list()).map((x) => x.startsAt)).toEqual(["2026-11-12T13:30:00Z"]);
    expect(await b.decisions()).toHaveLength(1);
    expect(await b.changes()).toHaveLength(1);
    expect(await b.lastRuns()).toHaveLength(1);
    b.close();
  });

  it("두 연결이 같은 파일을 쓰면 서로의 변경이 보인다 (대시보드 + 워커)", async () => {
    const path = join(dir, "shared.sqlite");
    const writer = createSqliteEventFeed({ path });
    const reader = createSqliteEventFeed({ path });
    const before = await reader.revision();
    await writer.upsert(batch([ev()]), "2026-11-05T00:00:00Z");
    expect(await reader.count()).toBe(1);
    expect(await reader.revision()).toBeGreaterThan(before);
    writer.close();
    reader.close();
  });
});
