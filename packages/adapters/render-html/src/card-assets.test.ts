import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cardPaths, createFileCardAssets } from "./card-assets";

const renderDir = fileURLToPath(new URL("../../../../docs/design/card-reference/example/render", import.meta.url));
const options = { renderDirs: [renderDir] };

describe("카드 미리보기 경로", () => {
  it("이름 화이트리스트 밖은 거절한다", () => {
    expect(cardPaths("../../etc/passwd", options)).toBeNull();
    expect(cardPaths("a-1", options)).toBeNull();
    expect(cardPaths("v2-09", { ...options, v2Dir: "/x" })).toBeNull();
  });

  it("v2 이름은 지정 폴더 안만 가리킨다", () => {
    expect(cardPaths("v2-01", { ...options, v2Dir: "/srv/v2" })).toEqual(["/srv/v2/v2-01.png"]);
    expect(cardPaths("v2-01", options)).toEqual([]);
  });
});

describe("파일 카드 자산", () => {
  it("v2 폴더가 없으면 저장소의 v1 시안으로 돌아가고 장마다 읽힌다", async () => {
    const assets = createFileCardAssets({ ...options, v2Dir: "/nonexistent" });
    const set = await assets.activeSet();
    expect(set.id).toBe("a");
    for (const name of set.names) {
      const image = await assets.read(name);
      expect(image?.contentType, name).toBe("image/png");
      expect(image?.bytes.byteLength, name).toBeGreaterThan(0);
      expect(image?.etag, name).toMatch(/^"[0-9a-f]+-[0-9a-f]+"$/);
    }
  });

  it("허용되지 않은 이름·없는 파일은 null", async () => {
    const assets = createFileCardAssets(options);
    expect(await assets.read("../../package")).toBeNull();
    expect(await assets.read("v2-01")).toBeNull();
  });
});
