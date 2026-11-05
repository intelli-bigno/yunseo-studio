import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { createHtmlCardRenderer, ContentBlockedError, InvalidContentError, loadBackgroundDir } from "@yunseo/adapters-render-html/renderer";
import { contentKindOf, validateContentDoc } from "@yunseo/domain";
import { PresetError, loadPresets } from "@yunseo/presets-schema";
import type { RunResult } from "./run";

interface RenderArgs {
  file: string;
  out: string;
  backgrounds: string | null;
}

export function parseRenderArgs(argv: readonly string[]): RenderArgs | string {
  let file: string | null = null;
  let out: string | null = null;
  let backgrounds: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--out" || arg === "--backgrounds") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) return `${arg} 뒤에 경로가 필요하다`;
      if (arg === "--out") out = value;
      else backgrounds = value;
      i += 1;
    } else if (arg.startsWith("--")) {
      return `모르는 옵션: ${arg}`;
    } else if (file === null) {
      file = arg;
    } else {
      return `파일은 하나만 받는다: ${arg}`;
    }
  }
  if (file === null) return "콘텐츠 파일(.yaml)이 필요하다";
  if (out === null) return "--out <폴더> 가 필요하다";
  return { file, out, backgrounds };
}

export const RENDER_USAGE = "사용법: render <content.yaml> --out <폴더> [--backgrounds <폴더>]   (배경: <슬롯>.jpg|png 또는 backgrounds.json)";

/**
 * 콘텐츠 정본 한 편을 카드 PNG 세트로 렌더한다 (카드 + caption.txt · alt-texts.txt · render.json).
 * 렌더 전 검사에서 block 이 나오면 아무것도 쓰지 않고 실패한다(종료 코드 1).
 */
export async function runRender(rootDir: string, argv: readonly string[], cwd: string = process.cwd()): Promise<RunResult> {
  const args = parseRenderArgs(argv);
  if (typeof args === "string") return { code: 2, lines: [`✗ ${args}`, RENDER_USAGE] };

  let presets;
  try {
    presets = loadPresets(join(rootDir, "presets"));
  } catch (error) {
    if (error instanceof PresetError) return { code: 1, lines: error.errors.map((m) => `✗ ${m}`) };
    throw error;
  }

  const file = resolve(cwd, args.file);
  const parsed = validateContentDoc(parse(readFileSync(file, "utf8")) as unknown);
  if (!parsed.ok) return { code: 1, lines: parsed.errors.map((m) => `✗ ${args.file}: ${m}`) };
  const body = parsed.value;

  const outDir = resolve(cwd, args.out);
  const renderer = createHtmlCardRenderer({
    rules: { banned: presets.bannedExpressions, formats: presets.formats },
    brand: { name: presets.brand.name, operator: presets.character.name },
    backgrounds: args.backgrounds === null ? undefined : loadBackgroundDir(resolve(cwd, args.backgrounds)),
  });

  try {
    const result = await renderer.render({ id: body.id, kind: contentKindOf(body), schema: body.schema, body }, outDir);
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, "caption.txt"), `${result.caption}\n`);
    await writeFile(join(outDir, "alt-texts.txt"), `${result.altTexts.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n`);
    await writeFile(
      join(outDir, "render.json"),
      `${JSON.stringify({ pieceId: result.pieceId, cards: result.cards.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })), hashtags: result.hashtags, warnings: result.warnings }, null, 2)}\n`,
    );
    return {
      code: 0,
      lines: [
        `✓ ${result.pieceId}: 카드 ${result.cards.length}장 (1080x1350) → ${args.out}`,
        ...result.cards.map((c) => `  ${c.name}  ${c.bytes}B  ${c.sha256.slice(0, 12)}`),
        `  캡션 ${[...result.caption].length}자 · 해시태그 ${result.hashtags.length}개`,
        ...result.warnings.map((w) => `! ${w}`),
      ],
    };
  } catch (error) {
    if (error instanceof ContentBlockedError) return { code: 1, lines: ["✗ 렌더 거부 — 아래를 고친 뒤 다시 실행한다", ...error.findings.map((f) => `✗ [${f.code}] ${f.path}: ${f.message}`)] };
    if (error instanceof InvalidContentError) return { code: 1, lines: error.errors.map((m) => `✗ ${m}`) };
    throw error;
  }
}
