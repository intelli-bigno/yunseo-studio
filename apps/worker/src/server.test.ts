import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkerServer } from "./server";

const servers: ReturnType<typeof createWorkerServer>[] = [];

async function start(): Promise<string> {
  const server = createWorkerServer();
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

  it("그 밖의 경로는 404", async () => {
    const res = await fetch(`${await start()}/nope`);
    expect(res.status).toBe(404);
  });
});
