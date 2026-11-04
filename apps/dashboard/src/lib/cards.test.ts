import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cardPaths } from "./cards";
import { PIECES } from "./mock";

const appDir = fileURLToPath(new URL("../..", import.meta.url));

describe("카드 미리보기 경로", () => {
  it("이름 화이트리스트 밖은 거절한다", () => {
    expect(cardPaths("../../etc/passwd", appDir)).toBeNull();
    expect(cardPaths("a-1", appDir)).toBeNull();
  });
  it("목업이 가리키는 카드 렌더가 저장소에 있다", () => {
    for (const name of PIECES.flatMap((p) => p.cards ?? [])) {
      expect(cardPaths(name, appDir)?.some((p) => existsSync(p)), name).toBe(true);
    }
  });
});
