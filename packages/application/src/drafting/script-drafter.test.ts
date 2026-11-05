import { describe, expect, it } from "vitest";
import type { BannedExpressionRule } from "@yunseo/domain";
import { draftScript, type ScriptDraft, type ScriptDraftRequest, type ScriptDrafter } from "./script-drafter";

const rules: BannedExpressionRule[] = [{ id: "guarantee", terms: ["수익 보장"], surfaces: ["body"], severity: "block", origin: "brief", reason: "확약 표현" }];
const request: ScriptDraftRequest = { subject: "FOMC", when: "12.10 04:00 KST", viewpoint: "관점 한 문장", language: "ko", stages: [{ key: "why_it_matters", title: "왜 중요한가", question: "이 사건이 왜 지금 중요한가" }] };
const drafter = (impl: () => Promise<ScriptDraft>, enabled = true): ScriptDrafter & { calls: number } => {
  const d: ScriptDrafter & { calls: number } = {
    enabled,
    calls: 0,
    draft: async () => {
      d.calls += 1;
      return impl();
    },
  };
  return d;
};

describe("draftScript — 원고 초안 유스케이스", () => {
  it("꺼져 있으면 호출하지 않고 이유를 돌려 준다 (기본 꺼짐)", async () => {
    const d = drafter(async () => ({ stages: [], draftedBy: "assistant" }), false);
    expect(await draftScript(d, request, rules)).toMatchObject({ ok: false, reason: "disabled" });
    expect(d.calls).toBe(0);
  });

  it("통과하면 항상 assistant 가 쓴 초안으로 표시된다", async () => {
    const d = drafter(async () => ({ stages: [{ key: "why_it_matters", body: "금리 경로를 가를 수 있는 회의다." }], draftedBy: "assistant" }));
    expect(await draftScript(d, request, rules)).toMatchObject({ ok: true, draft: { draftedBy: "assistant", stages: [{ key: "why_it_matters" }] }, warnings: [] });
  });

  it("금지 표현 block 이 있으면 초안을 버린다", async () => {
    const d = drafter(async () => ({ stages: [{ key: "why_it_matters", body: "수익 보장 구간" }], draftedBy: "assistant" }));
    const out = await draftScript(d, request, rules);
    expect(out).toMatchObject({ ok: false, reason: "banned_expression" });
    expect(out.ok === false && out.hits).toHaveLength(1);
  });

  it("요청하지 않은 단이 섞이면 거절한다", async () => {
    const d = drafter(async () => ({ stages: [{ key: "other", body: "x" }], draftedBy: "assistant" }));
    expect(await draftScript(d, request, rules)).toMatchObject({ ok: false, reason: "invalid_output" });
  });

  it("명령이 실패하면 사유와 함께 failed", async () => {
    const d = drafter(async () => {
      throw new Error("초안 명령 실패: boom");
    });
    expect(await draftScript(d, request, rules)).toMatchObject({ ok: false, reason: "failed", message: "초안 명령 실패: boom" });
  });
});
