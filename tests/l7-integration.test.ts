// [L7] 통합 E2E(유스케이스 수준) — 조립부(apps/dashboard/src/server/studio.ts)와 같은 모양으로 진짜 어댑터를 잇는다:
// SQLite 새 DB → 편 3종 생성 → 원고·출처·as_of → G1~G3 → 카드 렌더(L1 satori+resvg) → 릴스(L3 ffmpeg) → 업로드 묶음 zip(L2) → 게시 계획(L5 dry-run).
// ffmpeg 가 있는 곳(Windows 실행기·CI)에서는 릴스까지 실제로 만든다. 없으면 릴스 단계가 「비활성 + 이유」 로 막히고 묶음은 릴스 없이 나오는지를 본다.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import { createAuthoringUseCases, createPipelinePublishSource, createPipelineUseCases, createPublishPlanUseCases, RENDER_MANIFEST, type PipelineView } from "../packages/application/src/index";
import { createSqliteStudioRepository } from "../packages/adapters/storage/src/index";
import { createBundleFiles, createZipUploadPackager } from "../packages/adapters/publisher-manual/src/index";
import { createHtmlCardRenderer } from "../packages/adapters/render-html/src/renderer";
import { PRETENDARD_FAMILY, pretendardDir } from "../packages/adapters/render-html/src/fonts";
import { DEFAULT_BINARIES, assertFfmpegReady, createFfmpegReelComposer, probeMedia } from "../packages/adapters/video/src/index";
import { createInstagramDryRunPlanner } from "../packages/adapters/publisher-instagram/src/index";
import { createYoutubeDryRunPlanner } from "../packages/adapters/publisher-youtube/src/index";
import { DEFAULT_REEL_PRESET, g3Checklist, probeImage, type GateAction, type PieceClaim, type PiecePatch } from "../packages/domain/src/index";
import { loadPresets } from "../packages/presets-schema/src/index";

const root = mkdtempSync(join(tmpdir(), "yunseo-l7-"));
const sqlite = createSqliteStudioRepository({ path: join(root, "studio.sqlite") });
let tick = 0;
const now = () => `2026-11-05T11:${String(tick++ % 60).padStart(2, "0")}+09:00`;
let seq = 0;
const authoring = createAuthoringUseCases({ store: sqlite, clock: { now }, ids: { next: (p: string) => `${p}-E${++seq}` } });

const presets = loadPresets(join(import.meta.dirname, "..", "presets"));
const bins = { ffmpegPath: process.env.FFMPEG_PATH || DEFAULT_BINARIES.ffmpegPath, ffprobePath: process.env.FFPROBE_PATH || DEFAULT_BINARIES.ffprobePath };
const workDir = join(root, "work");
const files = createBundleFiles(workDir);
const pipeline = createPipelineUseCases({
  store: sqlite,
  clock: { now },
  renderer: createHtmlCardRenderer({ rules: { banned: presets.bannedExpressions, formats: presets.formats }, brand: { name: presets.brand.name, operator: presets.character.name }, fontsDir: pretendardDir() }),
  reels: createFfmpegReelComposer({
    ...bins,
    preset: { ...DEFAULT_REEL_PRESET, subtitle: { ...DEFAULT_REEL_PRESET.subtitle, fontName: PRETENDARD_FAMILY, coversHangul: true } },
    fontsDir: pretendardDir(),
    encoder: { preset: "ultrafast" },
  }),
  reelsReady: () => assertFfmpegReady(bins, { burnIn: true }).then(() => null),
  packager: createZipUploadPackager(),
  files,
  workDir,
  language: presets.language.publish,
});
const ffmpeg = await assertFfmpegReady(bins, { burnIn: true }).then(
  () => true,
  () => false,
);

afterAll(() => {
  sqlite.close();
  rmSync(root, { recursive: true, force: true });
});

const actor = "윤서";
const rev = async (id: string) => (await authoring.getAuthoring(id))!.revision;
const act = async (id: string, action: GateAction, extra: Record<string, unknown> = {}) => authoring.act(id, { expectedRevision: await rev(id), action, input: { actor, ...extra } });
const save = async (id: string, patch: PiecePatch) => authoring.savePiece(id, { expectedRevision: await rev(id), patch, meta: { actor } });

const SRC = { publisher: "Federal Reserve", url: "https://www.federalreserve.gov/monetarypolicy.htm", quote: "The Committee decided to maintain the target range.", accessedAt: "2026-11-04", tier: "primary" as const };
const fact = (id: string, text: string, asOf: string): PieceClaim => ({ id, mark: "fact", basis: "research", text, ...SRC, asOf, verified: false });
const reaction = (id: string, text: string, asOf: string): PieceClaim => ({ id, mark: "reaction", basis: "research", text, ...SRC, asOf, verified: false });
const view = (id: string, text: string, basedOn: string[]): PieceClaim => ({ id, mark: "view", basis: "research", text, publisher: null, url: null, quote: null, accessedAt: null, asOf: "2026-11-04T12:00", verified: false, basedOn });

/** 원고를 채운 뒤 G1 → 작성 → 문장 확인 → G2 → G3 */
async function throughGates(id: string, kind: "pre" | "post" | "research", patch: PiecePatch) {
  await act(id, "select", kind === "research" ? {} : { importance: "major" });
  if (kind === "post") {
    await act(id, "await_evidence");
    await save(id, patch);
    await act(id, "evidence_ready");
  } else {
    await act(id, "start_draft");
    await save(id, patch);
  }
  for (const c of patch.claims ?? []) await authoring.confirmClaim(id, { expectedRevision: await rev(id), claimId: c.id, actor });
  const v = await authoring.getAuthoring(id);
  expect(v!.blockers, `${id} G2 막힘`).toEqual([]);
  await act(id, "verify");
  await act(id, "request_review");
  await act(id, "approve", { checklist: g3Checklist(kind).map(() => true) });
  expect((await authoring.getAuthoring(id))!.piece.status).toBe("approved");
}

/** zip 중앙 디렉터리 → 파일 이름 목록 + 이름으로 내용 읽기(저장·deflate) */
function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    out.set(name, method === 8 ? inflateRawSync(raw) : Buffer.from(raw));
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

const step = (v: PipelineView, key: "render" | "reel" | "bundle") => v.steps.find((s) => s.key === key)!;

describe("[L7] 원고 1편 → 카드·캡션·릴스·업로드 묶음 (3종)", () => {
  const ids: Record<"pre" | "post" | "research", string> = { pre: "", post: "", research: "" };

  it("빈 SQLite DB 에서 3종 편을 만들고 원고·출처·as_of 를 넣어 G1~G3 를 통과한다", async () => {
    expect(await authoring.isEmpty()).toBe(true);
    ids.pre = (await authoring.createPiece({ kind: "pre", title: "Fed decision preview", slot: "2026-11-06T21:00", viewpoint: "One phrase in the statement can move the path.", actor })).id;
    await throughGates(ids.pre, "pre", {
      fields: { event_kind: "central_bank", event_at: "2026-11-05T14:00", timezone: "America/New_York" },
      stages: [
        { key: "why_it_matters", body: "Why this meeting matters\nThe statement wording sets the tone for rates." },
        { key: "market_expectation", body: "What markets expect\nA hold is widely expected." },
        { key: "scenarios", body: "Two ways it can go" },
        { key: "transmission", body: "How it travels\nWording → front-end yields → dollar" },
        { key: "after_checks", body: "What to check after" },
      ],
      claims: [fact("c1", "The Committee kept the target range unchanged.", "2026-11-04T09:00"), view("c2", "Wording matters more than the decision itself.", ["c1"])],
      scenarios: [
        { id: "s1", label: "Hold, same wording", condition: "If the statement is unchanged", reading: "Path stays as priced" },
        { id: "s2", label: "Hold, softer wording", condition: "If guidance softens", reading: "Front-end yields may ease" },
      ],
      checks: [{ id: "k1", what: "Front-end yields", where: "Treasury daily curve" }],
    });

    ids.post = (await authoring.createPiece({ kind: "post", title: "Fed decision recap", slot: "2026-11-07T21:00", viewpoint: "The wording, not the hold, was the story.", preIssueId: ids.pre, actor })).id;
    await throughGates(ids.post, "post", {
      fields: {
        event_kind: "central_bank",
        event_at: "2026-11-05T14:00",
        timezone: "America/New_York",
        "result_vs_expectation.actual_result": "The range was held and the wording barely changed.",
        "result_vs_expectation.expectation_gap": "In line with the hold that was priced.",
        "judgment_update.items": "유지 | Wording drives the path | The statement kept the same tone | c1",
        "next_variables.items": "Next inflation print | It tests the steady tone | Official release calendar",
      },
      stages: [
        { key: "result_vs_expectation", body: "Result vs expectation" },
        { key: "market_reaction", body: "How markets reacted\nFront-end yields were little changed." },
        { key: "judgment_update", body: "What we keep" },
        { key: "next_variables", body: "What comes next" },
      ],
      claims: [fact("c1", "The Committee held the target range.", "2026-11-05T14:00"), reaction("c2", "Front-end yields were little changed after the release.", "2026-11-05T15:30")],
      scenarioOutcomes: [
        { scenarioId: "s1", outcome: "matched", note: "Wording stayed the same." },
        { scenarioId: "s2", outcome: "diverged", note: "Guidance did not soften." },
      ],
      checkResults: [{ checkId: "k1", status: "done", note: "Checked the daily curve." }],
      evidence: { primary: true, observed: true, allScenarios: true, separated: true },
    });

    ids.research = (await authoring.createPiece({ kind: "research", title: "Reading statement wording", slot: "2026-11-08T10:00", viewpoint: "Track wording changes before reacting to the headline.", actor })).id;
    await throughGates(ids.research, "research", {
      fields: { stage: "idea", thread_topic: "Statement wording", "idea.hypothesis": "Changes in guidance wording lead front-end yields.", "idea.falsifier": "Yields move first and wording follows." },
      stages: [{ key: "idea", body: "The idea" }, { key: "conditions", body: "" }, { key: "failures", body: "" }, { key: "tool", body: "" }, { key: "follow_up", body: "" }],
      claims: [fact("c1", "The statement is published at the end of each meeting.", "2026-11-04T09:00")],
    });
  });

  for (const kind of ["pre", "post", "research"] as const) {
    it(`${kind}: 카드 PNG(1080×1350)·캡션(고지 포함)·해시태그·대체텍스트 → 릴스 → 묶음 zip`, async () => {
      const id = ids[kind];
      // 정본 변환이 정식 스키마를 통과한다(렌더 단계가 열려 있다)
      let v = await pipeline.status(id);
      expect(v.documentErrors).toEqual([]);
      expect(step(v, "render").enabled).toBe(true);

      v = await pipeline.render(id);
      const r = v.render!;
      expect(r.pieceId).toBe(id);
      expect(r.cards.length).toBeGreaterThanOrEqual(kind === "research" ? 2 : 5);
      for (const c of r.cards) {
        const bytes = readFileSync(c.path);
        expect(probeImage(bytes), c.name).toEqual({ format: "png", width: 1080, height: 1350 });
      }
      expect(r.altTexts).toHaveLength(r.cards.length);
      expect(r.caption).toMatch(/Not investment advice|투자 권유가 아닙니다/);
      expect(r.hashtags.length).toBeGreaterThan(0);
      // 매니페스트(render.json) — 릴스 CLI 가 같은 폴더에서 읽는 이름
      const dir = r.cards[0]!.path.replace(/[\\/][^\\/]+$/, "");
      const manifest = JSON.parse(readFileSync(join(dir, RENDER_MANIFEST), "utf8")) as { pieceId: string; cards: { path: string }[] };
      expect(manifest.pieceId).toBe(id);
      expect(manifest.cards.map((c) => c.path)).toEqual(r.cards.map((c) => c.name));
      // 다시 렌더해도 이전 PNG 가 남지 않는다
      v = await pipeline.render(id);
      expect(readdirSync(dir).filter((f) => f.endsWith(".png")).sort()).toEqual(v.render!.cards.map((c) => c.name).sort());

      if (ffmpeg) {
        v = await pipeline.composeReel(id);
        const reel = v.reel!;
        const probe = await probeMedia(bins, reel.video.path);
        expect(probe.video).toMatchObject({ width: 1080, height: 1920 });
        expect(reel.durationSec).toBeGreaterThanOrEqual(DEFAULT_REEL_PRESET.totalSec.min - 0.5);
        expect(reel.durationSec).toBeLessThanOrEqual(DEFAULT_REEL_PRESET.totalSec.max + 0.5);
      } else {
        expect(step(v, "reel").enabled).toBe(false);
        expect(step(v, "reel").reason).toMatch(/릴스 합성 불가/);
      }

      await pipeline.bundle(id);
      const zip = await pipeline.readBundle(id);
      expect(zip?.name).toMatch(/\.zip$/);
      const entries = unzip(Buffer.from(zip!.bytes));
      const names = [...entries.keys()];
      expect(names.filter((n) => /^cards\/\d+\.png$/.test(n))).toHaveLength(r.cards.length);
      expect(names).toEqual(expect.arrayContaining(["caption.txt", "hashtags.txt", "alt-text.txt", "manifest.json"]));
      expect(names.some((n) => n.endsWith(".mp4"))).toBe(ffmpeg);
      expect(entries.get("caption.txt")!.toString("utf8")).toMatch(/Not investment advice|투자 권유가 아닙니다/);
      const mf = JSON.parse(entries.get("manifest.json")!.toString("utf8")) as { files: { name: string; bytes: number; sha256: string }[] };
      expect(mf.files.map((f) => f.name).sort()).toEqual(names.filter((n) => n !== "manifest.json").sort());
    }, 300_000);
  }

  it("L5 dry-run 게시 계획이 실제 렌더 결과(카드·릴스)를 쓴다", async () => {
    const source = createPipelinePublishSource({ pipeline, files });
    const cards = await source.cards(ids.pre);
    expect(cards?.cards.map((c) => c.sha256)).toEqual((await pipeline.status(ids.pre)).render!.cards.map((c) => c.sha256));
    expect(await source.imageSize!(cards!.cards[0]!)).toEqual({ width: 1080, height: 1350 });
    expect(Boolean(await source.reel(ids.pre))).toBe(ffmpeg);
    const publish = createPublishPlanUseCases({
      repo: sqlite,
      clock: { today: () => "2026-11-05" },
      source,
      instagram: createInstagramDryRunPlanner({ bannedExpressions: presets.bannedExpressions }),
      youtube: createYoutubeDryRunPlanner({ bannedExpressions: presets.bannedExpressions }),
    });
    const feed = await publish.getPublishPreview(ids.pre, "feed");
    expect(feed!.plans).toHaveLength(1);
    expect(feed!.notes.join("\n")).not.toMatch(/카드 산출물이 없다|가정했다 — 파일을 열어 잰 값이 아니다/);
    const reels = await publish.getPublishPreview(ids.pre, "reels");
    if (ffmpeg) expect(reels!.plans.length).toBeGreaterThan(0);
    else expect(reels!.notes.join("\n")).toMatch(/릴스 산출물이 없다/);
  });
});
