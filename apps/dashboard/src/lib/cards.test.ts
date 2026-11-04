import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { activeCardSet, cardPaths } from "./cards";

const appDir = fileURLToPath(new URL("../..", import.meta.url));

describe("카드 미리보기 경로", () => {
  it("이름 화이트리스트 밖은 거절한다", () => {
    expect(cardPaths("../../etc/passwd", appDir)).toBeNull();
    expect(cardPaths("a-1", appDir)).toBeNull();
    expect(cardPaths("v2-09", appDir, "/x")).toBeNull();
  });
  it("v2 폴더가 없으면 저장소의 v1 시안으로 돌아간다", () => {
    const set = activeCardSet(appDir, "/nonexistent");
    expect(set.id).toBe("a");
    for (const name of set.names) expect(cardPaths(name, appDir)?.some((p) => existsSync(p)), name).toBe(true);
  });
  it("v2 이름은 지정 폴더 안만 가리킨다", () => {
    expect(cardPaths("v2-01", appDir, "/srv/v2")).toEqual(["/srv/v2/v2-01.png"]);
    expect(cardPaths("v2-01", appDir)).toEqual([]);
  });
});
