import { afterEach, describe, expect, it, vi } from "vitest";
import { clip, project, track } from "./fixtures";
import { errorText, postOp, splitOps, uid, zoomOp } from "./ops";
import { mergeChanged } from "./use-editor";
import type { OpSuccess } from "./types";

afterEach(() => vi.unstubAllGlobals());

const ok: OpSuccess = { revision: 13, opId: "op-000013", effects: { created: ["c-01b"], updated: ["c-01"], removed: [] }, warnings: [], undo: { available: true, redo: false } };

describe("postOp — POST /api/reels/:id/ops (문서 §2)", () => {
  it("봉투를 그대로 보낸다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(ok), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await postOp("R-aaaaaaaaaaaa", { revision: 12, op: { op: "split", clipId: "c-01", at: 4200 }, clientId: "editor-7f3a", requestId: "rq-1" });
    expect(out).toEqual({ ok: true, res: ok });
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/reels/R-aaaaaaaaaaaa/ops");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ revision: 12, op: { op: "split", clipId: "c-01", at: 4200 }, clientId: "editor-7f3a", requestId: "rq-1" });
  });
  it("실패 응답은 코드·현재 revision 을 돌려준다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "REVISION_CONFLICT", message: "낡음" }, revision: 14 }), { status: 409 })));
    expect(await postOp("R-x", { revision: 12, op: { op: "undo" } })).toEqual({ ok: false, status: 409, error: { code: "REVISION_CONFLICT", message: "낡음" }, revision: 14 });
  });
  it("JSON 이 아닌 응답·연결 실패도 같은 모양", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 502 })));
    expect(await postOp("R-x", { revision: 1, op: { op: "redo" } })).toMatchObject({ ok: false, status: 502, error: { code: "BAD_RESPONSE" } });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fail")));
    expect(await postOp("R-x", { revision: 1, op: { op: "redo" } })).toMatchObject({ ok: false, status: 0, error: { code: "NETWORK" } });
  });
});

describe("UI 동작 → op", () => {
  it("자르기: 하나면 split, 여럿이면 batch", () => {
    expect(splitOps([], 1000)).toBeNull();
    expect(splitOps([clip("c1", "v", 0, 3000)], 1000)).toMatchObject({ op: "split", clipId: "c1", at: 1000, newId: expect.stringMatching(/^c-/) as string });
    const b = splitOps([clip("c1", "v", 0, 3000), clip("c2", "a", 0, 3000)], 1000);
    expect(b).toMatchObject({ op: "batch", label: "자르기" });
    expect(b && b.op === "batch" && b.ops.map((o) => o.op)).toEqual(["split", "split"]);
  });
  it("줌: 처음·끝 배율 키프레임 두 개", () => {
    const op = zoomOp(clip("c1", "v", 0, 3000), 1.25, 1, "ease-in-out");
    expect(op).toEqual({
      op: "batch",
      label: "줌",
      ops: [
        { op: "add_keyframe", clipId: "c1", prop: "scale", at: 0, value: 1.25, ease: "ease-in-out" },
        { op: "add_keyframe", clipId: "c1", prop: "scale", at: 3000, value: 1, ease: "ease-in-out" },
      ],
    });
  });
  it("id 는 접두어 + 8자, 오류 문구는 짧게", () => {
    expect(uid("c")).toMatch(/^c-[0-9a-f]{8}$/);
    expect(errorText("CLIP_OVERLAP", "x")).toBe("같은 트랙의 클립과 겹친다");
    expect(errorText("WHATEVER", "메시지")).toBe("WHATEVER · 메시지");
  });
});

describe("mergeChanged — diff 응답 합치기", () => {
  const p = project([track("v", "video")], [clip("c1", "v", 0, 3000), clip("c2", "v", 3000, 1000)]);
  it("바뀐 것 교체·새 것 추가·지운 것 제거", () => {
    const next = mergeChanged(p, { effects: { created: ["c3"], updated: ["c1"], removed: ["c2"] }, changed: { clips: [clip("c1", "v", 0, 1000), clip("c3", "v", 1000, 500)], tracks: [] } });
    expect(next.clips.map((c) => [c.id, c.out])).toEqual([["c1", 1000], ["c3", 500]]);
  });
});
