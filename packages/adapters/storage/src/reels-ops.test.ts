// [W5 릴스] reels_ops 저장 + 편집 명령 유스케이스(멱등·409·undo·v1 변환·dryRun·diff)를 진짜 SQLite 파일로 확인한다.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createReelsOpsUseCases } from "@yunseo/application";
import { createReelsOpsStore } from "./reels-ops";
import { createReelsProjectStore } from "./reels-projects";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const V1 = {
  version: 1,
  title: "옛 편",
  tracks: [{ id: "t-video", kind: "video", name: "영상 1" }, { id: "t-subtitle", kind: "subtitle", name: "자막 1" }, { id: "t-audio", kind: "audio", name: "음성 1" }],
  clips: [
    { id: "c1", trackId: "t-video", start: 0, duration: 4000, offset: 0, sourceId: "vid", sourceKind: "video", sourceMs: 10_000 },
    { id: "a1", trackId: "t-audio", start: 0, duration: 6000, offset: 0, sourceId: "voice", sourceKind: "audio", sourceMs: 6000 },
  ],
};

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "reels-ops-"));
  dirs.push(dir);
  const path = join(dir, "studio.db");
  const projects = createReelsProjectStore({ path });
  projects.save({ id: "R-000000000001", title: V1.title, data: JSON.stringify(V1) });
  const repo = createReelsOpsStore({ path });
  const measured: string[] = [];
  const uc = createReelsOpsUseCases({
    repo,
    context: () => ({ sources: (id) => ({ vid: { kind: "video" as const, durationMs: 10_000 }, voice: { kind: "audio" as const, durationMs: 6000 } })[id] }),
    measureSpeech: async (_p, clipId) => {
      measured.push(clipId);
      return [{ from: 100, to: 2500 }, { from: 3000, to: 5800 }];
    },
  });
  return { uc, repo, projects, measured };
}
const ID = "R-000000000001";

describe("POST /api/reels/:id/ops 본체", () => {
  it("GET 은 v1 을 v2 로 보여 주고, 첫 op 가 v2 로 저장한다", async () => {
    const { uc, projects } = setup();
    const g = uc.getState(ID);
    expect(g.status).toBe(200);
    expect(g.body).toMatchObject({ revision: 1, project: { version: 2, clips: [{ id: "c1", in: 0, out: 4000 }, { id: "a1" }] }, undo: { available: false, redo: false } });
    const r = await uc.postOp(ID, { revision: 1, requestId: "req-1", clientId: "agent:test", op: { op: "split", clipId: "c1", at: 2000, newId: "c1b" } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ revision: 2, opId: "op-000002", effects: { created: ["c1b"], updated: ["c1"], removed: [] }, undo: { available: true, redo: false } });
    expect(JSON.parse(projects.get(ID)!.data).version).toBe(2);
  });

  it("같은 requestId 는 처음 응답을 그대로 — revision 이 낡아도 409 가 아니다", async () => {
    const { uc } = setup();
    const body = { revision: 1, requestId: "same", op: { op: "move", clipId: "c1", start: 500 } };
    const a = await uc.postOp(ID, body);
    const b = await uc.postOp(ID, body);
    expect(b).toEqual(a);
    expect(uc.getState(ID).body.revision).toBe(2);
  });

  it("낡은 revision 은 409 REVISION_CONFLICT + 현재 revision", async () => {
    const { uc } = setup();
    await uc.postOp(ID, { revision: 1, op: { op: "move", clipId: "c1", start: 500 } });
    const r = await uc.postOp(ID, { revision: 1, op: { op: "move", clipId: "c1", start: 900 } });
    expect(r).toMatchObject({ status: 409, body: { error: { code: "REVISION_CONFLICT" }, revision: 2 } });
  });

  it("실패는 저장 없음 — 오류 모양·HTTP 코드", async () => {
    const { uc } = setup();
    expect(await uc.postOp(ID, { op: {} })).toMatchObject({ status: 400, body: { error: { code: "BAD_REQUEST" } } });
    expect(await uc.postOp("R-ffffffffffff", { revision: 1, op: { op: "undo" } })).toMatchObject({ status: 404, body: { error: { code: "PROJECT_NOT_FOUND" } } });
    expect(await uc.postOp(ID, { revision: 1, op: { op: "undo" } })).toMatchObject({ status: 409, body: { error: { code: "NOTHING_TO_UNDO" }, revision: 1 } });
    expect(await uc.postOp(ID, { revision: 1, op: { op: "move", clipId: "c9", start: 0 } })).toMatchObject({ status: 404, body: { error: { code: "CLIP_NOT_FOUND" } } });
    expect(await uc.postOp(ID, { revision: 1, op: { op: "zzz" } })).toMatchObject({ status: 400, body: { error: { code: "UNKNOWN_OP" } } });
    expect(await uc.postOp(ID, {}, 2_000_000)).toMatchObject({ status: 413 });
    expect(uc.getState(ID).body.revision).toBe(1);
  });

  it("undo → redo 가 저장소 로그로 이어진다(+1 씩), since 로 로그를 읽는다", async () => {
    const { uc } = setup();
    await uc.postOp(ID, { revision: 1, clientId: "editor-1", op: { op: "move", clipId: "c1", start: 500 } });
    const u = await uc.postOp(ID, { revision: 2, op: { op: "undo" } });
    expect(u.body).toMatchObject({ revision: 3, undo: { available: false, redo: true } });
    expect((uc.getState(ID).body.project as { clips: { start: number }[] }).clips[0]!.start).toBe(0);
    const rd = await uc.postOp(ID, { revision: 3, op: { op: "redo" } });
    expect(rd.body).toMatchObject({ revision: 4, undo: { available: true, redo: false } });
    const s = uc.getState(ID, 1).body.ops as { revision: number; kind: string; clientId: string | null }[];
    expect(s.map((o) => [o.revision, o.kind])).toEqual([[2, "do"], [3, "undo"], [4, "redo"]]);
    expect(s[0]!.clientId).toBe("editor-1");
  });

  it("dryRun 은 저장하지 않고, return:diff 는 바뀐 것만", async () => {
    const { uc } = setup();
    const d = await uc.postOp(ID, { revision: 1, dryRun: true, op: { op: "move", clipId: "c1", start: 500 } });
    expect(d.body).toMatchObject({ dryRun: true, revision: 1 });
    expect(uc.getState(ID).body.revision).toBe(1);
    const r = await uc.postOp(ID, { revision: 1, return: "diff", op: { op: "move", clipId: "c1", start: 500 } });
    expect(r.body.project).toBeUndefined();
    expect(r.body.changed).toMatchObject({ clips: [{ id: "c1", start: 500 }], tracks: [] });
  });

  it("auto_place_subtitles 는 음성 구간을 재서(batch 안 포함) 넣는다", async () => {
    const { uc, measured } = setup();
    const r = await uc.postOp(ID, { revision: 1, op: { op: "batch", ops: [{ op: "auto_place_subtitles", trackId: "t-subtitle", audioClipId: "a1", script: "첫 문장.\n둘째 문장." }] } });
    expect(r.status).toBe(200);
    expect(measured).toEqual(["a1"]);
    expect(r.body.effects).toMatchObject({ created: ["sub-0001", "sub-0002"] });
  });
});

describe("PUT 통째 저장(replace_project)", () => {
  const moved = () => ({ ...V1, title: "새 이름", clips: [{ ...V1.clips[0]!, start: 1000 }, V1.clips[1]!] });

  it("op 로그에 replace_project 로 남고 revision 이 오르며 undo 로 되돌린다", async () => {
    const { uc, repo, projects } = setup();
    const r = uc.replaceProject(ID, moved() as never, 1);
    expect(r).toMatchObject({ status: 200, body: { revision: 2, opId: "op-000002", undo: { available: true, redo: false } } });
    expect(JSON.parse(repo.log(ID).at(-1)!.op)).toEqual({ op: "replace_project" });
    const saved = JSON.parse(projects.get(ID)!.data);
    expect(saved).toMatchObject({ version: 2, title: "새 이름", clips: [{ id: "c1", start: 1000 }, { id: "a1" }] });
    const u = await uc.postOp(ID, { revision: 2, op: { op: "undo" } });
    expect(u.status).toBe(200);
    expect(JSON.parse(projects.get(ID)!.data)).toMatchObject({ title: "옛 편", clips: [{ id: "c1", start: 0 }, { id: "a1" }] });
  });

  it("낡은 revision 은 409 REVISION_CONFLICT", () => {
    const { uc } = setup();
    expect(uc.replaceProject(ID, moved() as never, 7)).toMatchObject({ status: 409, body: { error: { code: "REVISION_CONFLICT" }, revision: 1 } });
  });

  it("v1 로 담을 수 없는 v2 편집(속도)이 있으면 409 LOSSY_OVERWRITE — 덮어쓰지 않는다", async () => {
    const { uc, projects } = setup();
    const s = await uc.postOp(ID, { revision: 1, op: { op: "set_speed", clipId: "c1", speed: 2 } });
    expect(s.status).toBe(200);
    const before = projects.get(ID)!.data;
    expect(uc.replaceProject(ID, moved() as never, 2)).toMatchObject({ status: 409, body: { error: { code: "LOSSY_OVERWRITE" }, revision: 2 } });
    expect(projects.get(ID)!.data).toBe(before);
  });
});
