// 서비스 상태 확인 — 각 서비스의 헬스 주소를 HTTP 로 부른다(짧은 시간 제한). 주소는 조립부가 환경변수에서 넘긴다.
import type { OpsJobRun, OpsJobState, OpsServiceProbe, OpsServiceStatus } from "@yunseo/application";

export interface ProbeTarget {
  name: string;
  /** 헬스 주소. 없으면 「주소 미설정」으로 보인다 */
  url: string | null;
}

type Fetch = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);

function parseRun(v: unknown): OpsJobRun | null {
  const r = obj(v);
  if (typeof r.id !== "number" || typeof r.job !== "string" || typeof r.startedAt !== "string") return null;
  const status = r.status === "ok" || r.status === "failed" || r.status === "running" ? r.status : "failed";
  return { id: r.id, job: r.job, startedAt: r.startedAt, finishedAt: strOrNull(r.finishedAt), status, message: strOrNull(r.message) };
}

/** 워커 /health 의 jobs 배열을 방어적으로 읽는다 — 모양이 다른 항목은 버린다 */
export function parseJobs(v: unknown): OpsJobState[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x): OpsJobState[] => {
    const j = obj(x);
    if (typeof j.name !== "string") return [];
    return [{ name: j.name, schedule: typeof j.schedule === "string" ? j.schedule : "", lastRun: parseRun(j.lastRun), nextRun: strOrNull(j.nextRun), running: j.running === true }];
  });
}

export function createHttpServiceProbe(targets: readonly ProbeTarget[], { timeoutMs = 2000, fetch: f = globalThis.fetch as unknown as Fetch }: { timeoutMs?: number; fetch?: Fetch } = {}): OpsServiceProbe {
  async function one({ name, url }: ProbeTarget): Promise<OpsServiceStatus> {
    const base = { name, url, revision: null, startedAt: null, jobs: [] };
    if (!url) return { ...base, ok: false, detail: "주소 미설정" };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const t0 = Date.now();
    try {
      const res = await f(url, { signal: ctrl.signal });
      const body = obj(await res.json().catch(() => null));
      const ms = Date.now() - t0;
      return {
        name,
        url,
        ok: res.ok && body.status === "ok",
        detail: `HTTP ${res.status} · ${ms}ms`,
        revision: strOrNull(body.revision),
        startedAt: strOrNull(body.startedAt),
        jobs: parseJobs(body.jobs),
      };
    } catch (e) {
      return { ...base, ok: false, detail: ctrl.signal.aborted ? `응답 없음(${timeoutMs}ms 초과)` : `연결 실패: ${(e as Error).message}` };
    } finally {
      clearTimeout(timer);
    }
  }
  return { probe: () => Promise.all(targets.map(one)) };
}
