import { describe, expect, it } from "vitest";
import { assertSafeHost, loadWorkerConfig } from "./config";

describe("바인드 주소 — 루프백·Tailnet 만", () => {
  it.each(["127.0.0.1", "localhost", "::1", "100.84.73.107", "100.64.0.1", "100.127.255.254"])("허용: %s", (h) => {
    expect(() => assertSafeHost(h)).not.toThrow();
  });
  it.each(["0.0.0.0", "::", "192.168.0.10", "10.0.0.5", "100.63.255.255", "100.128.0.1", "8.8.8.8", "example.com"])("거부: %s", (h) => {
    expect(() => assertSafeHost(h)).toThrow();
  });
});

describe("loadWorkerConfig", () => {
  it("기본은 127.0.0.1:4010, DB·백업 없음", () => {
    expect(loadWorkerConfig({})).toEqual({ host: "127.0.0.1", port: 4010, dbPath: null, backupDir: null, backupKeep: 14, dashboardHealthUrl: null, revision: null });
  });

  it("운영 값 — 데이터 폴더 아래 backups, 대시보드 헬스 주소", () => {
    const c = loadWorkerConfig({ HOST: "100.84.73.107", PORT: "8931", STUDIO_DB: "D:/s/data/studio.db", YUNSEO_DATA_DIR: "D:/s/data", YUNSEO_DASHBOARD_URL: "http://100.84.73.107:8930/", YUNSEO_REVISION: "abc" });
    expect(c).toMatchObject({ host: "100.84.73.107", port: 8931, dbPath: "D:/s/data/studio.db", dashboardHealthUrl: "http://100.84.73.107:8930/api/health", revision: "abc" });
    expect(c.backupDir?.replace(/\\/g, "/")).toBe("D:/s/data/backups");
  });

  it("0.0.0.0 바인드·잘못된 보존 개수는 기동 전에 실패", () => {
    expect(() => loadWorkerConfig({ HOST: "0.0.0.0" })).toThrow();
    expect(() => loadWorkerConfig({ YUNSEO_BACKUP_KEEP: "0" })).toThrow();
  });
});
