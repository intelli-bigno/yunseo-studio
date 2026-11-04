import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runValidate } from "./run";

const root = fileURLToPath(new URL("../../..", import.meta.url));

describe("runValidate", () => {
  it("저장소의 프리셋·예시 콘텐츠를 통과시킨다 (자리표시자는 정보로만 표시)", () => {
    const { code, lines } = runValidate(root, { publish: false });
    expect(code, lines.join("\n")).toBe(0);
    expect(lines.some((l) => l.includes("us-midterms-three-repricings.yaml (draft)"))).toBe(true);
    expect(lines.some((l) => l.startsWith("· 자리표시자(TBD)"))).toBe(true);
  });

  it("게시 모드에서는 자리표시자(TBD)가 남아 있으면 실패한다", () => {
    const { code, lines } = runValidate(root, { publish: true });
    expect(code).toBe(1);
    expect(lines.some((l) => l.startsWith("✗ 자리표시자(TBD)"))).toBe(true);
  });
});
