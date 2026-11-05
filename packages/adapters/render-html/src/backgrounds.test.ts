import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { backgroundDataUri, loadBackgroundDir } from "./backgrounds";

function dir(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "bg-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(root, name, ".."), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  return root;
}

describe("배경 슬롯", () => {
  it("manifest 가 없으면 <슬롯>.jpg|png 이름 규칙을 쓴다", () => {
    const root = dir({ "cover.jpg": "x", "scenarios-2.PNG": "x", "notes.txt": "x" });
    expect(Object.keys(loadBackgroundDir(root)).sort()).toEqual(["cover", "scenarios-2"]);
    expect(loadBackgroundDir(root)["cover"]).toBe(join(root, "cover.jpg"));
  });

  it("backgrounds.json 이 있으면 폴더 기준 상대 경로로 슬롯을 지정한다", () => {
    const root = dir({ "backgrounds.json": JSON.stringify({ cover: "img/a.jpg" }), "img/a.jpg": "x", "other.jpg": "x" });
    expect(loadBackgroundDir(root)).toEqual({ cover: join(root, "img/a.jpg") });
  });

  it("폴더 밖을 가리키는 지정은 거부한다", () => {
    const root = dir({ "backgrounds.json": JSON.stringify({ cover: "../escape.jpg" }) });
    expect(() => loadBackgroundDir(root)).toThrow("폴더 밖");
  });

  it("jpg·png 만 data URI 로 바꾼다", () => {
    const root = dir({ "a.jpg": "abc", "b.webp": "abc" });
    expect(backgroundDataUri(join(root, "a.jpg"))).toBe("data:image/jpeg;base64,YWJj");
    expect(backgroundDataUri(join(root, "b.webp"))).toBeNull();
  });
});
