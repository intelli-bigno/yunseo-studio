import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("대시보드 헬스 체크", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("200 과 앱 이름·시작 시각을 돌려준다", async () => {
    vi.stubEnv("YUNSEO_REVISION", "");
    const res = await GET(new Request("http://x/api/health"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok", app: "dashboard", revision: null });
    expect(Number.isFinite(Date.parse(body.startedAt))).toBe(true);
  });

  it("[L9] 배포 커밋(YUNSEO_REVISION)을 싣는다 — /status 가 「—」 대신 커밋을 보인다", async () => {
    vi.stubEnv("YUNSEO_REVISION", "75796238d0a1");
    expect((await (await GET(new Request("http://x/api/health"))).json()).revision).toBe("75796238d0a1");
  });
});
