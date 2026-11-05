// 가짜 명령(fixtures/fake-drafter.mjs)으로 시험한다 — 실제 모델·네트워크를 부르지 않는다.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ScriptDraftRequest } from "@yunseo/application";
import { createLocalCommandDrafter, parseDrafterCommand } from "./local-command-drafter";

const script = fileURLToPath(new URL("../fixtures/fake-drafter.mjs", import.meta.url));
const via = (mode: string, extra: Record<string, number> = {}) => createLocalCommandDrafter({ command: [process.execPath, script, mode], ...extra });
const request: ScriptDraftRequest = { subject: "FOMC 정책금리 결정 발표", when: "12.10 04:00 KST", viewpoint: "관점", language: "ko", stages: [{ key: "why_it_matters", title: "왜 중요한가", question: "이 사건이 왜 지금 중요한가" }] };

describe("로컬 명령 초안 어댑터", () => {
  it("명령이 없으면 꺼져 있고 아무것도 실행하지 않는다", async () => {
    for (const drafter of [createLocalCommandDrafter(), createLocalCommandDrafter({ command: [] }), createLocalCommandDrafter({ command: null })]) {
      expect(drafter.enabled).toBe(false);
      await expect(drafter.draft(request)).rejects.toThrow(/꺼짐/);
    }
  });

  it("명령에 요청을 stdin 으로 주고 stdout JSON 을 초안으로 받는다", async () => {
    const drafter = via("ok");
    expect(drafter.enabled).toBe(true);
    expect(await drafter.draft(request)).toEqual({ stages: [{ key: "why_it_matters", body: "[초안] FOMC 정책금리 결정 발표 — 이 사건이 왜 지금 중요한가" }], draftedBy: "assistant" });
  });

  it("출력이 JSON 이 아니면 오류", async () => {
    await expect(via("bad-json").draft(request)).rejects.toThrow(/JSON/);
  });

  it("명령이 0 이 아닌 코드로 끝나면 오류(첫 줄만 전달)", async () => {
    await expect(via("exit1").draft(request)).rejects.toThrow(/초안 명령 실패/);
  });

  it("시간 초과면 명령을 끊고 오류", async () => {
    await expect(via("slow", { timeoutMs: 300 }).draft(request)).rejects.toThrow(/300ms/);
  });

  it("한 단 본문이 상한을 넘으면 오류", async () => {
    await expect(via("ok", { maxBodyChars: 5 }).draft(request)).rejects.toThrow(/넘는다/);
  });

  it("없는 실행 파일은 오류로 끝난다 (셸을 거치지 않는다)", async () => {
    await expect(createLocalCommandDrafter({ command: ["definitely-not-a-command-xyz"] }).draft(request)).rejects.toThrow(/초안 명령 실패/);
  });

  it("설정 문자열(JSON 문자열 배열)을 명령으로 읽는다 — 잘못된 값은 꺼짐", () => {
    expect(parseDrafterCommand('["node","draft.mjs"]')).toEqual(["node", "draft.mjs"]);
    for (const bad of [undefined, null, "", "node draft.mjs", "[]", "[1]", '[""]', "{"]) expect(parseDrafterCommand(bad)).toBeNull();
  });
});
