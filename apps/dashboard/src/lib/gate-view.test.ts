import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { g3Issues } from "./gate-view";

describe("g3Issues", () => {
  it("승인 행동의 막는 이유를 고른다", () => {
    expect(g3Issues([{ action: "publish", gate: null, to: "published", issues: ["x"] }, { action: "approve", gate: "G3", to: "approved", issues: ["렌더 전 검사 · a: 출처 없는 수치"] }])).toEqual(["렌더 전 검사 · a: 출처 없는 수치"]);
  });
  it("승인 행동이 없으면 빈 목록", () => expect(g3Issues([])).toEqual([]));
});

describe("다음 단계 패널 — 상태 전환마다 중복 표시 회귀", () => {
  it("편 상세는 GatePanel 을 버전이 아닌 편 id 로만 key 한다", () => {
    const page = readFileSync(new URL("../app/content/[id]/page.tsx", import.meta.url), "utf8");
    expect(page).toMatch(/<GatePanel key=\{p\.id\}/);
  });
});
