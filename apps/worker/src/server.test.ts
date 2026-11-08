import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkerServer, type WorkerHealth } from "./server";

const servers: ReturnType<typeof createWorkerServer>[] = [];

async function start(health?: () => WorkerHealth, log?: (message: string) => void): Promise<string> {
  const server = createWorkerServer(health, log);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))));
});

describe("워커 헬스 체크", () => {
  it("GET /health 는 200 과 앱 이름을 돌려준다", async () => {
    const res = await fetch(`${await start()}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", app: "worker" });
  });

  it("작업의 마지막 실행·다음 실행을 함께 내보낸다", async () => {
    const jobs = [{ name: "backup", schedule: "매일 03:30 KST", lastRun: null, nextRun: "2026-11-05T18:30:00.000Z", running: false }];
    const res = await fetch(`${await start(() => ({ status: "ok", app: "worker", startedAt: "2026-11-05T00:00:00.000Z", revision: "abc", jobs }))}/health`);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ revision: "abc", jobs });
  });

  it("그 밖의 경로는 404 — 대시보드 API 와 같은 { error: { code, message } } 모양", async () => {
    const res = await fetch(`${await start()}/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "NOT_FOUND", message: "GET /nope 는 없다" } });
  });

  it("상태를 만들다 던져도 서버는 죽지 않고 500 으로 답한다 — 이유는 로그에만", async () => {
    const logs: string[] = [];
    const base = await start(() => { throw new Error("DB 잠김: /secret/studio.db"); }, (m) => logs.push(m));
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: { code: "INTERNAL", message: "상태를 만들지 못했다" } });
    expect(JSON.stringify(body)).not.toContain("/secret");
    expect(logs[0]).toContain("DB 잠김");
    expect((await fetch(`${base}/health`)).status).toBe(500); // 다음 요청도 받는다
  });
});
