// 헬스 점검 — 10분마다 대시보드 /api/health 를 부르고, 실행 기록 표가 커지지 않게 작업별 최근 기록만 남긴다.
import { AppError } from "@yunseo/domain";
import type { JobDefinition } from "../registry";
import { every } from "../schedule";

export interface HealthJobDeps {
  dashboardHealthUrl: string | null;
  /** 작업마다 남길 실행 기록 수 */
  prune(keepPerJob: number): number;
  keepPerJob?: number;
  fetch?: (url: string, init: { signal: AbortSignal }) => Promise<{ status: number }>;
}

export function createHealthJob({ dashboardHealthUrl, prune, keepPerJob = 300, fetch: f = globalThis.fetch }: HealthJobDeps): JobDefinition {
  return {
    name: "health",
    schedule: every(10),
    timeoutMs: 30_000,
    async run({ signal }) {
      const pruned = prune(keepPerJob);
      if (!dashboardHealthUrl) return `대시보드 주소 미설정 · 기록 정리 ${pruned}`;
      const t0 = Date.now();
      const res = await f(dashboardHealthUrl, { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });
      if (res.status !== 200) throw new AppError("UPSTREAM_FAILED", `대시보드 HTTP ${res.status}`);
      return `대시보드 200 · ${Date.now() - t0}ms · 기록 정리 ${pruned}`;
    },
  };
}
