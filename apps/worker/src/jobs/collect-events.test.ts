import { describe, expect, it } from "vitest";
import type { EventCollectReport } from "@yunseo/application";
import { registerJobs } from "./index";
import { JobRegistry } from "../registry";
import { nextRun } from "../schedule";
import { createCollectEventsJobs } from "./collect-events";

const report = (ok: boolean): EventCollectReport => ({
  at: "2026-11-05T00:00:00Z",
  window: { from: "a", to: "b" },
  sources: [
    { source: "fed", name: "연준", ok: true, fetched: 8, accepted: 8, report: null, error: null, warnings: [] },
    { source: "bls", name: "BLS", ok, fetched: ok ? 3 : 0, accepted: ok ? 3 : 0, report: null, error: ok ? null : "HTTP 503", warnings: [] },
  ],
});
const ctx = { now: () => new Date(), log: () => {}, signal: new AbortController().signal };

describe("[L7] 일정 수집 작업 — 하루 2회", () => {
  it("DB 가 있으면 06:10·18:10 KST 두 작업이 등록되고, 없으면 등록하지 않고 알린다", () => {
    const logs: string[] = [];
    const base = { backup: null, health: { dashboardHealthUrl: null, prune: () => 0 }, log: (m: string) => logs.push(m) };
    const reg = registerJobs(new JobRegistry(), { ...base, events: { dbPath: "x.db" } });
    expect(reg.list().map((j) => j.name)).toEqual(["health", "collect-events-0610", "collect-events-1810"]);
    // 2026-11-05 00:00 UTC(= 09:00 KST) 다음 실행은 18:10 KST = 09:10 UTC, 그 다음 06:10 KST = 21:10 UTC
    expect(nextRun(reg.get("collect-events-1810")!.schedule, new Date("2026-11-05T00:00:00Z")).toISOString()).toBe("2026-11-05T09:10:00.000Z");
    expect(nextRun(reg.get("collect-events-0610")!.schedule, new Date("2026-11-05T00:00:00Z")).toISOString()).toBe("2026-11-05T21:10:00.000Z");
    const none = registerJobs(new JobRegistry(), { ...base, events: null });
    expect(none.list().map((j) => j.name)).toEqual(["health"]);
    expect(logs.some((m) => m.includes("일정 수집"))).toBe(true);
  });

  it("collectEventsOnce 를 같은 DB 경로로 부르고 원천별 요약을 남긴다 · 원천 실패면 작업 실패", async () => {
    const calls: unknown[] = [];
    const [ok] = createCollectEventsJobs({ dbPath: "s.db", collect: async (o) => (calls.push(o), report(true)) });
    expect(await ok!.run(ctx)).toBe("fed 8/8 · bls 3/3");
    expect(calls).toEqual([{ dbPath: "s.db" }]);
    const [bad] = createCollectEventsJobs({ dbPath: "s.db", collect: async () => report(false) });
    await expect(bad!.run(ctx)).rejects.toThrow(/bls: HTTP 503/);
  });
});
