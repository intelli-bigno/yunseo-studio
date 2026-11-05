import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createMemoryEventFeed, type EventSource } from "@yunseo/application";
import { createSqliteEventFeed } from "@yunseo/adapters-events-calendar";
import type { CalendarEvent } from "@yunseo/domain";
import { collectEventsOnce } from "./collect-events";

const ev: CalendarEvent = { source: "bls-ics", externalId: "u-1", kind: "inflation_headline", title: "Consumer Price Index", label: "미국 CPI", startsAt: "2026-11-10T13:30:00Z", timeKnown: true, sourceName: "BLS", sourceUrl: "https://www.bls.gov/schedule/news_release/" };
const fake: EventSource = { id: "bls-ics", name: "BLS", officialUrl: "https://www.bls.gov/", pull: async (window) => ({ source: "bls-ics", events: [ev], complete: true, window, warnings: [] }) };
const NOW = "2026-11-05T00:00:00Z";

const dir = mkdtempSync(join(tmpdir(), "l4-worker-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("collectEventsOnce — 워커 1회 실행", () => {
  it("DB 경로로 한 번 돌아 SQLite 에 반영하고, 연결을 닫고 끝난다", async () => {
    const dbPath = join(dir, "studio.sqlite");
    const report = await collectEventsOnce({ dbPath, sources: [fake], now: () => NOW });
    expect(report.sources).toMatchObject([{ source: "bls-ics", ok: true, report: { inserted: 1 } }]);

    const check = createSqliteEventFeed({ path: dbPath });
    expect((await check.list()).map((e) => e.label)).toEqual(["미국 CPI"]);
    expect(await check.lastRuns()).toMatchObject([{ source: "bls-ics", ok: true }]);
    check.close();

    const again = await collectEventsOnce({ dbPath, sources: [fake], now: () => NOW });
    expect(again.sources[0]!.report).toMatchObject({ inserted: 0, unchanged: 1 });
  });

  it("feed 를 주입하면 그것을 쓴다 (DB 경로 없이)", async () => {
    const feed = createMemoryEventFeed();
    await collectEventsOnce({ feed, sources: [fake], now: () => NOW });
    expect(await feed.count()).toBe(1);
  });

  it("저장 위치가 없으면 실행하지 않는다 — 저장 없는 확인은 CLI --dry 몫", async () => {
    await expect(collectEventsOnce({ sources: [fake] })).rejects.toThrow(/STUDIO_DB/);
  });

  it("원천 선택(only)을 유스케이스에 넘긴다", async () => {
    const feed = createMemoryEventFeed();
    const report = await collectEventsOnce({ feed, sources: [fake], now: () => NOW, collect: { only: ["none"] } });
    expect(report.sources).toEqual([]);
  });
});
