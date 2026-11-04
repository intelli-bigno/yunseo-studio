import { describe, expect, it } from "vitest";
import { createOpsUseCases, type OpsDeps, type OpsJobRun } from "./index";

const NOW = new Date("2026-11-05T03:00:00.000Z");

function deps(over: Partial<OpsDeps> = {}): OpsDeps {
  const runs: OpsJobRun[] = [
    { id: 3, job: "health", startedAt: "2026-11-05T02:50:00.000Z", finishedAt: "2026-11-05T02:50:01.000Z", status: "failed", message: "대시보드 응답 없음" },
    { id: 2, job: "backup", startedAt: "2026-11-04T18:30:00.000Z", finishedAt: "2026-11-04T18:30:02.000Z", status: "ok", message: "studio-20261105-033000.db" },
    { id: 1, job: "health", startedAt: "2026-11-03T02:00:00.000Z", finishedAt: null, status: "failed", message: "오래된 실패" },
  ];
  return {
    journal: { recentRuns: async (limit) => runs.slice(0, limit) },
    backups: {
      location: () => "D:/data/backups",
      list: async () => [
        { name: "studio-20261105-033000.db", bytes: 2048, createdAt: "2026-11-04T18:30:00.000Z" },
        { name: "studio-20261104-033000.db", bytes: 1024, createdAt: "2026-11-03T18:30:00.000Z" },
      ],
    },
    logs: { tail: async (n) => [{ name: "worker", lines: ["a", "b"].slice(0, n), bytes: 4 }] },
    probe: {
      probe: async () => [
        { name: "worker", url: "http://100.84.73.107:8931/health", ok: true, detail: "200", revision: "abc", startedAt: null, jobs: [{ name: "backup", schedule: "매일 03:30 KST", lastRun: null, nextRun: "2026-11-05T18:30:00.000Z", running: false }] },
        { name: "dashboard", url: null, ok: false, detail: "주소 미설정", revision: null, startedAt: null, jobs: [] },
      ],
    },
    clock: { now: () => NOW },
    ...over,
  };
}

describe("getOpsStatus", () => {
  it("서비스·작업·백업·로그를 한 화면 모델로 묶고 요약을 계산한다", async () => {
    const view = await createOpsUseCases(deps()).getOpsStatus();
    expect(view.checkedAt).toBe(NOW.toISOString());
    expect(view.summary).toEqual({ servicesUp: 1, servicesTotal: 2, failedRuns24h: 1, backupAgeHours: 8 });
    expect(view.jobs.map((j) => j.name)).toEqual(["backup"]);
    expect(view.backups.totalBytes).toBe(3072);
    expect(view.backups.location).toBe("D:/data/backups");
    expect(view.logs[0]?.lines).toEqual(["a", "b"]);
  });

  it("백업이 없으면 백업 경과 시간은 null", async () => {
    const view = await createOpsUseCases(deps({ backups: { location: () => null, list: async () => [] } })).getOpsStatus();
    expect(view.summary.backupAgeHours).toBeNull();
    expect(view.backups.totalBytes).toBe(0);
  });

  it("기록·로그 줄 수 상한을 포트에 넘긴다", async () => {
    const view = await createOpsUseCases(deps()).getOpsStatus({ runs: 1, logLines: 1 });
    expect(view.runs).toHaveLength(1);
    expect(view.logs[0]?.lines).toEqual(["a"]);
  });
});
