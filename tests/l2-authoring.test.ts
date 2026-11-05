// [L2] 쓰기 유스케이스 + SQLite + 업로드 묶음기를 조립부와 같은 모양으로 이어 「만들기 → 저장 → 재조회 → 게이트 → 묶음」 한 바퀴를 검증한다.
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createAuthoringUseCases, createPipelineUseCases, createStudioUseCases, RevisionConflictError, withReadCache, type CardRenderer, type ContentDocument, type ReelComposer } from "../packages/application/src/index";
import { createSqliteStudioRepository } from "../packages/adapters/storage/src/index";
import { createBundleFiles, createZipUploadPackager } from "../packages/adapters/publisher-manual/src/index";
import { AuthoringRuleError, g3Checklist } from "../packages/domain/src/index";

const dir = mkdtempSync(join(tmpdir(), "yunseo-l2-"));
const path = join(dir, "studio.sqlite");
const sqlite = createSqliteStudioRepository({ path });
let tick = 0;
const clock = { now: () => `2026-11-05T10:${String(tick++ % 60).padStart(2, "0")}` };
let seq = 0;
const ids = { next: (prefix: string) => `${prefix}-T${++seq}` };
const uc = createAuthoringUseCases({ store: sqlite, clock, ids });
const read = createStudioUseCases({ repo: withReadCache(sqlite), clock: { today: () => "2026-11-05" }, cards: { activeSet: async () => ({ id: "a", label: "", names: [], aspect: "3 / 4" }), read: async () => null } });

/** 가짜 렌더러(테스트 전용) — L1 의 실제 렌더러 자리. 받은 정본 본문을 기록하고 PNG 자리 파일을 만든다 */
const rendered: ContentDocument[] = [];
const renderer: CardRenderer = {
  async render(doc, outDir) {
    rendered.push(doc);
    const { mkdirSync } = await import("node:fs");
    mkdirSync(outDir, { recursive: true });
    const cards = [1, 2].map((n) => {
      const p = join(outDir, `${n}.png`);
      writeFileSync(p, `png ${doc.id} ${n}`);
      const b = readFileSync(p);
      return { name: `${n}.png`, path: p, bytes: b.length, sha256: createHash("sha256").update(b).digest("hex") };
    });
    return { pieceId: doc.id, cards, caption: "캡션", hashtags: ["macro"], altTexts: ["표지", "본문"], warnings: [] };
  },
};
const workDir = join(dir, "work");
const pipe = createPipelineUseCases({ store: sqlite, clock, renderer, packager: createZipUploadPackager(), files: createBundleFiles(workDir), workDir });
const bare = createPipelineUseCases({ store: sqlite, clock, workDir });

afterAll(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const actor = "윤서";
const rev = async (id: string) => (await uc.getAuthoring(id))!.revision;

describe("작성 → 저장 → 재조회 (실제 SQLite 파일)", () => {
  let pre = "";
  let post = "";

  it("빈 DB 에서 시작한다 — 시안 없음", async () => {
    expect(await uc.isEmpty()).toBe(true);
    expect((await read.listContent()).total).toBe(0);
  });

  it("3종 새 편을 만들 수 있다", async () => {
    pre = (await uc.createPiece({ kind: "pre", title: "FOMC 전", slot: "2026-11-06T21:00", viewpoint: "표현 하나가 경로를 바꾼다", actor })).id;
    const r = await uc.createPiece({ kind: "research", title: "연구", slot: "2026-11-07T10:00", actor });
    expect(pre).toMatch(/^P-/);
    expect(r.id).toMatch(/^R-/);
    post = (await uc.createPiece({ kind: "post", title: "FOMC 후", slot: "2026-11-08T21:00", viewpoint: "대조", preIssueId: pre, actor })).id;
    expect(post).toMatch(/^A-/);
    await expect(uc.createPiece({ kind: "post", title: "x", slot: "2026-11-08T21:00", preIssueId: "P-404", actor })).rejects.toThrow(/P-404/);
    expect((await read.listContent()).total).toBe(3);
  });

  it("명시 저장 → 재조회하면 그대로, 낡은 버전으로 저장하면 충돌", async () => {
    const v = (await uc.getAuthoring(pre))!;
    const stages = v.piece.stages.map((s) => ({ key: s.key, body: `${s.title} — 본문` }));
    const claims = [
      { id: "c1", mark: "fact" as const, basis: "research" as const, text: "회의는 11월 5일이다.", publisher: "연준", tier: "primary" as const, url: "https://www.federalreserve.gov/x", quote: "원문", accessedAt: "2026-11-04", asOf: "2026-11-04T09:00", verified: false },
      { id: "c2", mark: "view" as const, basis: "experienced" as const, text: "표현이 바뀌면 경로를 다시 그린다고 본다.", publisher: null, url: null, quote: null, accessedAt: null, asOf: "2026-11-04T10:00", verified: false, basedOn: ["c1"], experience: { what: "지난 회의 뒤 금리 기록", when: "지난 회의", dataLocation: "운영 노트" } },
    ];
    const scenarios = [
      { id: "s1", label: "A", condition: "표현 유지", reading: "경로 유지" },
      { id: "s2", label: "B", condition: "표현 삭제", reading: "경로 재평가" },
    ];
    const saved = await uc.savePiece(pre, { expectedRevision: v.revision, patch: { stages, claims, scenarios, checks: [{ id: "k1", what: "단기 국채", where: "재무부" }], fields: { event_kind: "central_bank", event_at: "2026-11-05T14:00", timezone: "America/New_York" } }, meta: { actor } });
    expect(saved.revision).toBe(v.revision + 1);
    const back = (await uc.getAuthoring(pre))!;
    expect(back.piece.stages.map((s) => s.body)).toEqual(stages.map((s) => s.body));
    expect(back.piece.claims.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(back.piece.scenarios).toEqual(scenarios);
    await expect(uc.savePiece(pre, { expectedRevision: v.revision, patch: { title: "늦은 저장" }, meta: { actor } })).rejects.toBeInstanceOf(RevisionConflictError);
    expect((await uc.getAuthoring(pre))!.piece.title).toBe("FOMC 전");
  });

  it("게이트는 도메인 규칙으로만 — 허용 안 된 전이는 예외", async () => {
    await expect(uc.act(pre, { expectedRevision: await rev(pre), action: "approve", input: { actor, checklist: [] } })).rejects.toBeInstanceOf(AuthoringRuleError);
    await expect(uc.act(pre, { expectedRevision: await rev(pre), action: "select", input: { actor } })).rejects.toThrow(/중요도/);
    await uc.act(pre, { expectedRevision: await rev(pre), action: "select", input: { actor, importance: "major" } });
    await uc.act(pre, { expectedRevision: await rev(pre), action: "start_draft", input: { actor } });
    // 출처 확인 전에는 G2 불가
    await expect(uc.act(pre, { expectedRevision: await rev(pre), action: "verify", input: { actor } })).rejects.toThrow(/사람 확인 전/);
    await uc.confirmClaim(pre, { expectedRevision: await rev(pre), claimId: "c1", actor });
    await uc.confirmClaim(pre, { expectedRevision: await rev(pre), claimId: "c2", actor });
    expect((await uc.getAuthoring(pre))!.blockers).toEqual([]);
    await uc.act(pre, { expectedRevision: await rev(pre), action: "verify", input: { actor } });
    await uc.act(pre, { expectedRevision: await rev(pre), action: "request_review", input: { actor } });
    await uc.act(pre, { expectedRevision: await rev(pre), action: "approve", input: { actor, checklist: g3Checklist("pre").map(() => true) } });
    const v = (await uc.getAuthoring(pre))!;
    expect(v.piece.status).toBe("approved");
    expect(v.gates.G3.valid).toBe(true);
    expect((await read.getPublishQueue()).rows.find((r) => r.piece.id === pre)?.state).toBe("ready");
  });

  it("승인 뒤 저장으로 내용이 바뀌면 승인 무효 → 작성 단계, 대기열은 불일치", async () => {
    const v = (await uc.getAuthoring(pre))!;
    const r = await uc.savePiece(pre, { expectedRevision: v.revision, patch: { viewpoint: "고친 관점" }, meta: { actor } });
    expect(r.invalidated).toEqual(["G2", "G3"]);
    const after = (await uc.getAuthoring(pre))!;
    expect(after.piece.status).toBe("drafted");
    expect(after.gates.G3.valid).toBe(false);
    expect((await read.getPublishQueue()).rows.find((x) => x.piece.id === pre)?.state).toBe("mismatch");
  });

  it("이후 편은 이전 편 시나리오에만 응답할 수 있고, 양쪽에서 서로 보인다", async () => {
    await expect(uc.savePiece(post, { expectedRevision: await rev(post), patch: { scenarioOutcomes: [{ scenarioId: "zz", outcome: "matched", note: "" }] }, meta: { actor } })).rejects.toThrow(/모르는 시나리오 zz/);
    await uc.savePiece(post, { expectedRevision: await rev(post), patch: { scenarioOutcomes: [{ scenarioId: "s1", outcome: "matched", note: "유지됨" }] }, meta: { actor } });
    const v = (await uc.getAuthoring(post))!;
    expect(v.preIssue?.id).toBe(pre);
    expect(v.preIssueOptions.map((o) => o.id)).toContain(pre);
    expect(v.blockers).toContain("이전 편 시나리오 1개 미응답");
    expect((await uc.getAuthoring(pre))!.linkedPosts.map((p) => p.id)).toEqual([post]);
    const preV = (await uc.getAuthoring(pre))!;
    await expect(uc.savePiece(pre, { expectedRevision: preV.revision, patch: { scenarios: preV.piece.scenarios!.filter((s) => s.id !== "s1") }, meta: { actor } })).rejects.toThrow(/s1 는 지울 수 없음/);
  });

  it("수정 이력: 저장·행동마다 한 줄(누가·언제·무엇·이유)", async () => {
    const h = await uc.history(pre);
    expect(h[0]?.revision).toBe(await rev(pre));
    expect(h[h.length - 1]?.changeKind).toBe("create");
    expect(h.map((x) => x.changeKind)).toEqual(expect.arrayContaining(["edit", "confirm", "action:select", "action:verify", "action:approve"]));
    const edit = h.find((x) => x.changeKind === "edit" && x.changes.some((c) => c.path === "viewpoint"));
    expect(edit).toMatchObject({ actor });
    expect(edit?.changes.find((c) => c.path === "viewpoint")).toEqual({ path: "viewpoint", before: "표현 하나가 경로를 바꾼다", after: "고친 관점" });
  });
});

/** 연구 편 하나를 출처 문장과 함께 검수 중(in_review)까지 — G2 는 렌더 전 검사(기준 시점 등)까지 본다 */
const RESEARCH_CLAIM = { id: "c1", mark: "fact" as const, basis: "research" as const, text: "환율과 채권 금리는 같은 날 움직였다.", publisher: "재무부", tier: "primary" as const, url: "https://home.treasury.gov/x", quote: "원문", accessedAt: "2026-11-04", asOf: "2026-11-04T09:00", verified: false };
async function toReview(id: string) {
  await uc.savePiece(id, { expectedRevision: await rev(id), patch: { claims: [RESEARCH_CLAIM] }, meta: { actor } });
  await uc.act(id, { expectedRevision: await rev(id), action: "select", input: { actor } });
  await uc.act(id, { expectedRevision: await rev(id), action: "start_draft", input: { actor } });
  await uc.confirmClaim(id, { expectedRevision: await rev(id), claimId: "c1", actor });
  for (const action of ["verify", "request_review"] as const) await uc.act(id, { expectedRevision: await rev(id), action, input: { actor } });
}

describe("렌더 → 업로드 묶음 (계약 포트로만)", () => {
  it("포트가 없으면 단계는 비활성이고 이유를 보인다", async () => {
    const id = (await uc.createPiece({ kind: "research", title: "포트 없음", slot: "2026-11-09T10:00", actor })).id;
    const s = await bare.status(id);
    expect(s.steps.map((x) => [x.key, x.enabled])).toEqual([
      ["render", false],
      ["reel", false],
      ["bundle", false],
    ]);
    expect(s.steps[0]?.reason).toMatch(/L1/);
    expect(s.steps[1]?.reason).toMatch(/L3/);
    await expect(bare.render(id)).rejects.toThrow(/L1/);
  });

  it("승인본만 묶고, zip 을 내려받을 수 있다", async () => {
    const id = (await uc.createPiece({ kind: "research", title: "달러와 채권", slot: "2026-11-10T10:00", viewpoint: "쓰지 않는 때를 먼저", actor })).id;
    const v = (await uc.getAuthoring(id))!;
    await uc.savePiece(id, { expectedRevision: v.revision, patch: { stages: v.piece.stages.map((s, i) => ({ key: s.key, body: i === 0 ? "가설: 환율이 결정한다" : "" })), fields: { stage: "idea", "idea.hypothesis": "환율이 먼저 움직인다", "idea.falsifier": "채권이 먼저 움직인다" } }, meta: { actor } });
    await toReview(id);
    const rendered1 = await pipe.render(id);
    expect(rendered1.render?.cards).toHaveLength(2);
    expect(rendered[rendered.length - 1]).toMatchObject({ id, kind: "research", schema: "research-5/v1" });
    expect(rendered1.steps.find((x) => x.key === "bundle")?.reason).toMatch(/G3 승인 전/);
    await expect(pipe.bundle(id)).rejects.toThrow(/G3/);
    await uc.act(id, { expectedRevision: await rev(id), action: "approve", input: { actor, checklist: g3Checklist("research").map(() => true) } });
    const done = await pipe.bundle(id);
    expect(done.steps.find((x) => x.key === "bundle")?.done).toBe(true);
    const dl = await pipe.readBundle(id);
    expect(dl?.name).toBe(`${id}-upload.zip`);
    expect(dl?.bytes.byteLength).toBe(done.bundle?.zip.bytes);
    // 내용이 바뀌면 낡은 묶음은 내려받을 수 없다
    await uc.savePiece(id, { expectedRevision: await rev(id), patch: { title: "바뀐 제목" }, meta: { actor } });
    expect(await pipe.readBundle(id)).toBeNull();
    expect((await pipe.status(id)).stale).toBe(true);
  });
});

describe("[L9] 실사용 흐름", () => {
  const researchPiece = async (title: string) => {
    const id = (await uc.createPiece({ kind: "research", title, slot: "2026-11-11T10:00", viewpoint: "쓰지 않는 때를 먼저", actor })).id;
    const v = (await uc.getAuthoring(id))!;
    await uc.savePiece(id, { expectedRevision: v.revision, patch: { stages: v.piece.stages.map((s, i) => ({ key: s.key, body: i === 0 ? "가설: 환율이 결정한다" : "" })), fields: { stage: "idea", "idea.hypothesis": "환율이 먼저 움직인다", "idea.falsifier": "채권이 먼저 움직인다" } }, meta: { actor } });
    return id;
  };

  it("출처 없는 수치는 G2 에서 막히고, 읽기 모델의 막는 이유·버튼 이유에 보인다", async () => {
    const id = await researchPiece("수치 시험");
    const v = (await uc.getAuthoring(id))!;
    await uc.savePiece(id, { expectedRevision: v.revision, patch: { fields: { ...v.piece.fields, "idea.hypothesis": "금리가 0.3%p 오르면 달러가 먼저 간다" } }, meta: { actor } });
    await uc.savePiece(id, { expectedRevision: await rev(id), patch: { claims: [RESEARCH_CLAIM] }, meta: { actor } });
    for (const action of ["select", "start_draft"] as const) await uc.act(id, { expectedRevision: await rev(id), action, input: { actor } });
    await uc.confirmClaim(id, { expectedRevision: await rev(id), claimId: "c1", actor });
    const view = (await uc.getAuthoring(id))!;
    expect(view.blockers.some((m) => m.includes("출처 없는 수치"))).toBe(true);
    expect(view.actions.find((a) => a.action === "verify")?.issues.some((m) => m.includes("출처 없는 수치"))).toBe(true);
    await expect(uc.act(id, { expectedRevision: view.revision, action: "verify", input: { actor } })).rejects.toThrow(/출처 없는 수치/);
  });

  it("승인본 수정 요청 — 사유 필수, 작성으로 돌아가고 이력에 사유가 남는다, 낡은 묶음은 못 받는다", async () => {
    const id = await researchPiece("수정 요청 시험");
    await toReview(id);
    await uc.act(id, { expectedRevision: await rev(id), action: "approve", input: { actor, checklist: g3Checklist("research").map(() => true) } });
    await pipe.runAll(id);
    expect(await pipe.readBundle(id)).not.toBeNull();
    await expect(uc.act(id, { expectedRevision: await rev(id), action: "request_changes", input: { actor } })).rejects.toThrow(/사유/);
    await uc.act(id, { expectedRevision: await rev(id), action: "request_changes", input: { actor, reason: "표현 다시" } });
    const v = (await uc.getAuthoring(id))!;
    expect(v.piece.status).toBe("drafted");
    expect(v.gates.G3).toMatchObject({ valid: false, last: { decision: "rejected", note: "표현 다시" } });
    expect((await uc.history(id))[0]).toMatchObject({ changeKind: "action:request_changes", reason: "표현 다시", actor });
    expect(await pipe.readBundle(id)).toBeNull();
    expect((await read.getPublishQueue()).rows.find((r) => r.piece.id === id)?.state).not.toBe("ready");
  });

  it("카드·릴스·묶음 한 번에 — 릴스 합성기가 없으면 이유를 남기고 카드·묶음만", async () => {
    const id = await researchPiece("한 번에 시험");
    await toReview(id);
    await expect(pipe.runAll(id)).resolves.toMatchObject({ ran: ["render"], skipped: [{ key: "reel" }, { key: "bundle" }] });
    await uc.act(id, { expectedRevision: await rev(id), action: "approve", input: { actor, checklist: g3Checklist("research").map(() => true) } });
    const r = await pipe.runAll(id);
    expect(r.ran).toEqual(["bundle"]);
    expect(r.skipped.map((x) => x.key)).toEqual(["reel"]);
    expect(r.steps.find((x) => x.key === "bundle")?.done).toBe(true);
    await expect(bare.runAll(await researchPiece("포트 없음 한 번에"))).rejects.toThrow(/L1/);
  });

  it("릴스가 있으면 카드 → 릴스 → 묶음(릴스 포함) 순서로 돈다", async () => {
    const order: string[] = [];
    const reels: ReelComposer = { async compose(render, outDir) {
      order.push("reel");
      const { mkdirSync } = await import("node:fs");
      mkdirSync(outDir, { recursive: true });
      const p = join(outDir, "r.mp4");
      writeFileSync(p, "mp4");
      const file = { name: "r.mp4", path: p, bytes: 3, sha256: createHash("sha256").update("mp4").digest("hex") };
      return { pieceId: render.pieceId, video: file, subtitles: null, durationSec: 10, warnings: [] };
    } };
    const withReels = createPipelineUseCases({ store: sqlite, clock, renderer, reels, packager: createZipUploadPackager(), files: createBundleFiles(workDir), workDir });
    const id = await researchPiece("릴스 순서 시험");
    await toReview(id);
    await uc.act(id, { expectedRevision: await rev(id), action: "approve", input: { actor, checklist: g3Checklist("research").map(() => true) } });
    const r = await withReels.runAll(id);
    expect(r.ran).toEqual(["render", "reel", "bundle"]);
    expect(order).toEqual(["reel"]);
    expect(readFileSync(r.bundle!.zip.path).toString("latin1"), "묶음 zip 에 릴스가 들어간다").toMatch(/\.mp4/);
  });
});

describe("빈 DB 데모 채우기", () => {
  it("편이 있는 DB 에는 넣지 않는다", async () => {
    expect(await uc.seedDemo()).toEqual({ seeded: false });
    const other = createSqliteStudioRepository();
    const ucs = createAuthoringUseCases({ store: other, clock, ids });
    expect(await ucs.seedDemo()).toEqual({ seeded: true });
    expect(await ucs.isEmpty()).toBe(false);
    other.close();
  });
});
