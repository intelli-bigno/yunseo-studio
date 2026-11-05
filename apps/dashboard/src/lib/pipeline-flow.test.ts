import { describe, expect, it } from "vitest";
import { nextPipelineStep, type FlowStep } from "./pipeline-flow";

const st = (render: [boolean, boolean], reel: [boolean, boolean], bundle: [boolean, boolean]): FlowStep[] => [
  { key: "bundle", enabled: bundle[0], done: bundle[1] },
  { key: "render", enabled: render[0], done: render[1] },
  { key: "reel", enabled: reel[0], done: reel[1] },
];

describe("nextPipelineStep — 카드 → 릴스 → 묶음", () => {
  it("처음엔 카드 렌더", () => expect(nextPipelineStep(st([true, false], [false, false], [false, false]))?.key).toBe("render"));
  it("카드 뒤에는 묶음보다 릴스가 먼저(묶음이 가능해도)", () => expect(nextPipelineStep(st([true, true], [true, false], [true, false]))?.key).toBe("reel"));
  it("릴스 뒤 묶음", () => expect(nextPipelineStep(st([true, true], [true, true], [true, false]))?.key).toBe("bundle"));
  it("릴스를 못 쓰면 묶음으로 넘어간다", () => expect(nextPipelineStep(st([true, true], [false, false], [true, false]))?.key).toBe("bundle"));
  it("다 했으면 없음", () => expect(nextPipelineStep(st([true, true], [true, true], [true, true]))).toBeNull());
});
