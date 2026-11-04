import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("대시보드 헬스 체크", () => {
  it("200 과 앱 이름을 돌려준다", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", app: "dashboard" });
  });
});
