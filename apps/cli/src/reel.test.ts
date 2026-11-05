import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { solidPng, writeCardFixtures } from "@yunseo/adapters-video/testing";
import { loadCardSet, loadSubtitleTexts, parseReelArgs, runReel } from "./reel";

let root = "";
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "yunseo-cli-reel-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("reel 인자", () => {
  it("<cards-dir> 와 --out 이 필요하다", () => {
    expect(parseReelArgs(["cards", "--out", "out"])).toEqual({ ok: true, args: { cardsDir: "cards", outDir: "out", burn: true, coversHangul: false } });
    expect(parseReelArgs(["--out", "out"])).toEqual({ ok: false, message: "<cards-dir> 가 없다" });
    expect(parseReelArgs(["cards"])).toEqual({ ok: false, message: "--out <dir> 가 없다" });
    expect(parseReelArgs(["a", "b", "--out", "o"])).toMatchObject({ ok: false });
    expect(parseReelArgs(["cards", "--out"])).toEqual({ ok: false, message: "--out 에 값이 없다" });
    expect(parseReelArgs(["cards", "--out", "o", "--nope"])).toEqual({ ok: false, message: "알 수 없는 옵션: --nope" });
  });

  it("옵션을 읽는다", () => {
    const r = parseReelArgs(["cards", "--out", "o", "--transition", "dip", "--no-burn", "--voice", "v.wav", "--music", "m.mp3", "--subtitles", "s.json", "--font-name", "Foo", "--fonts-dir", "/f", "--covers-hangul", "--encoder-preset", "ultrafast"]);
    expect(r).toEqual({
      ok: true,
      args: { cardsDir: "cards", outDir: "o", transition: "dip", burn: false, voice: "v.wav", music: "m.mp3", subtitlesFile: "s.json", fontName: "Foo", fontsDir: "/f", coversHangul: true, encoderPreset: "ultrafast" },
    });
  });

  it("모르는 전환 이름은 거절한다", () => {
    expect(parseReelArgs(["cards", "--out", "o", "--transition", "spin"])).toMatchObject({ ok: false });
  });
});

describe("카드 폴더 읽기", () => {
  it("매니페스트(render-result.json)가 있으면 그 순서·altTexts 를 쓴다 (상대 경로는 폴더 기준)", async () => {
    const dir = join(root, "with-manifest");
    const fx = await writeCardFixtures(dir, [[1, 2, 3], [4, 5, 6]], ["First.", "Second."]);
    await writeFile(join(dir, "render-result.json"), JSON.stringify({ ...fx, cards: [fx.cards[1], fx.cards[0]].map((c) => ({ ...c, path: c!.name })) }));
    const set = loadCardSet(dir);
    expect(set.pieceId).toBe("fixture-piece");
    expect(set.cards.map((c) => c.name)).toEqual(["card-2.png", "card-1.png"]);
    expect(set.cards[0]!.path).toBe(join(dir, "card-2.png"));
    expect(set.altTexts).toEqual(["First.", "Second."]);
  });

  it("매니페스트가 깨졌으면 PNG 스캔으로 넘어가지 않고 실패한다", async () => {
    const dir = join(root, "bad-manifest");
    await writeCardFixtures(dir, [[1, 2, 3]], ["x"]);
    await writeFile(join(dir, "render-result.json"), JSON.stringify({ pieceId: 5 }));
    expect(() => loadCardSet(dir)).toThrow("CardRenderResult 모양이 아니다");
  });

  it("매니페스트가 없으면 *.png 를 숫자 순서로 읽는다 (card-2 < card-10)", async () => {
    const dir = join(root, "scan");
    await writeCardFixtures(dir, [[1, 1, 1]], ["x"]);
    for (const n of [10, 2]) await writeFile(join(dir, `card-${n}.png`), solidPng(8, 10, [9, 9, 9]));
    const set = loadCardSet(dir);
    expect(set.cards.map((c) => c.name)).toEqual(["card-1.png", "card-2.png", "card-10.png"]);
    expect(set.pieceId).toBe("scan");
    expect(set.altTexts).toEqual([]);
  });

  it("폴더가 없거나 PNG 가 없으면 실패한다", async () => {
    expect(() => loadCardSet(join(root, "nope"))).toThrow("카드 폴더가 없다");
    await writeFile(join(root, "empty.txt"), "x");
    const dir = join(root, "empty-dir");
    await writeCardFixtures(dir, [], []);
    expect(() => loadCardSet(dir)).toThrow("카드 PNG 가 없다");
  });

  it("--subtitles 파일은 문자열 배열이어야 한다", async () => {
    const ok = join(root, "subs.json");
    await writeFile(ok, JSON.stringify(["a", "b"]));
    expect(loadSubtitleTexts(ok)).toEqual(["a", "b"]);
    const bad = join(root, "subs-bad.json");
    await writeFile(bad, JSON.stringify({ a: 1 }));
    expect(() => loadSubtitleTexts(bad)).toThrow("문자열 배열");
  });
});

describe("runReel", () => {
  it("인자가 틀리면 종료 코드 2 와 사용법을 준다", async () => {
    const r = await runReel([], {});
    expect(r.code).toBe(2);
    expect(r.lines.join("\n")).toContain("사용법: reel <cards-dir> --out <dir>");
  });

  it("규칙 위반(카드 한 장 = 15초 미달)은 종료 코드 1 과 이유를 준다", async () => {
    const dir = join(root, "one");
    await writeCardFixtures(dir, [[10, 20, 30]], ["Only one card."]);
    const r = await runReel([dir, "--out", join(root, "one-out")], {});
    expect(r.code).toBe(1);
    expect(r.lines.join("\n")).toContain("reel/too-short");
  });

  it("ffmpeg 가 없으면 종료 코드 1 과 해결 방법을 준다 (건너뛰지 않음)", async () => {
    const dir = join(root, "three-nobin");
    await writeCardFixtures(dir, [[10, 20, 30], [30, 20, 10], [20, 30, 10]], ["One card sentence here.", "Two card sentence here.", "Three card sentence here."]);
    const r = await runReel([dir, "--out", join(root, "nobin-out")], { FFMPEG_PATH: "/no/such/ffmpeg" });
    expect(r.code).toBe(1);
    expect(r.lines.join("\n")).toMatch(/ffmpeg 를 실행할 수 없다.*win auto/s);
  });

  it("진짜 ffmpeg 로 릴스를 만든다 (cards-dir → MP4 + SRT)", async () => {
    const dir = join(root, "e2e");
    const text = ["Inflation data lands on Tuesday and sets the tone.", "The central bank may hold steady this time.", "Watch the core reading before any conclusion."];
    await writeCardFixtures(dir, [[24, 40, 90], [90, 40, 24], [30, 80, 40]], text);
    const out = join(root, "e2e-out");
    const r = await runReel([dir, "--out", out, "--encoder-preset", "ultrafast"], { FFMPEG_PATH: process.env.FFMPEG_PATH, FFPROBE_PATH: process.env.FFPROBE_PATH });
    expect(r.code, r.lines.join("\n")).toBe(0);
    expect(r.lines[0]).toMatch(/^✓ .*e2e-reel\.mp4 {2}\(\d+(\.\d+)?초, \d+KB, sha256 [0-9a-f]{12}\)$/);
    expect(await readFile(join(out, "e2e-reel.srt"), "utf8")).toContain("Inflation data lands on Tuesday and sets the tone.");
  }, 240_000);
});
