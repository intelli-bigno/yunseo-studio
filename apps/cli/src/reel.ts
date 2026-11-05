// `reel <cards-dir> --out <dir>` — 카드 세트(PNG 묶음)를 9:16 릴스(MP4 + SRT)로 합성한다.
// 어댑터를 만들어 꽂는 조립부다(04 규칙 4): 환경 변수(FFMPEG_PATH·FFPROBE_PATH)는 여기서만 읽는다.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { FfmpegUnavailableError, ReelComposeError, createFfmpegReelComposer, type AudioSlot } from "@yunseo/adapters-video";
import type { CardRenderResult, RenderedFile } from "@yunseo/application";
import { DEFAULT_REEL_PRESET, REEL_TRANSITIONS, type ReelPreset, type ReelTransitionName } from "@yunseo/domain";
import type { RunResult } from "./run";

export const REEL_USAGE = [
  "사용법: reel <cards-dir> --out <dir> [옵션]",
  "  <cards-dir>   카드 PNG 묶음. render-result.json(CardRenderResult)이 있으면 그것을, 없으면 *.png 를 이름순으로 쓴다",
  "  --out <dir>             산출물(<pieceId>-reel.mp4, .srt) 폴더",
  `  --transition <이름>     ${REEL_TRANSITIONS.join(" | ")} (기본 ${DEFAULT_REEL_PRESET.transition})`,
  "  --subtitles <json>      카드별 자막 문장 배열(JSON). 없으면 카드의 altTexts 첫 문장",
  "  --no-burn               자막을 영상에 새기지 않는다(SRT 만)",
  "  --voice <파일>          음성 트랙(선택, 기본 없음)   --music <파일>   음악 트랙(선택, 기본 없음)",
  "  --font-name <이름>      번인 서체   --fonts-dir <폴더>   서체 폴더   --covers-hangul   서체가 한글을 그린다고 확인됨",
  "  --encoder-preset <이름> x264 preset (기본 medium, 시안 확인은 ultrafast)",
  "환경 변수: FFMPEG_PATH · FFPROBE_PATH (기본 PATH 의 ffmpeg·ffprobe). 합성은 ffmpeg 가 있는 Windows 실행기에서 한다.",
];

export interface ReelArgs {
  cardsDir: string;
  outDir: string;
  transition?: ReelTransitionName;
  subtitlesFile?: string;
  burn: boolean;
  voice?: string;
  music?: string;
  fontName?: string;
  fontsDir?: string;
  coversHangul: boolean;
  encoderPreset?: string;
}

export type ParsedReelArgs = { ok: true; args: ReelArgs } | { ok: false; message: string };

const VALUE_FLAGS = ["--out", "--transition", "--subtitles", "--voice", "--music", "--font-name", "--fonts-dir", "--encoder-preset"] as const;

export function parseReelArgs(argv: readonly string[]): ParsedReelArgs {
  const values = new Map<string, string>();
  const positional: string[] = [];
  let burn = true;
  let coversHangul = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--no-burn") burn = false;
    else if (a === "--covers-hangul") coversHangul = true;
    else if ((VALUE_FLAGS as readonly string[]).includes(a)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) return { ok: false, message: `${a} 에 값이 없다` };
      values.set(a, v);
    } else if (a.startsWith("--")) return { ok: false, message: `알 수 없는 옵션: ${a}` };
    else positional.push(a);
  }
  if (positional.length !== 1) return { ok: false, message: positional.length === 0 ? "<cards-dir> 가 없다" : `<cards-dir> 는 하나여야 한다: ${positional.join(" ")}` };
  const out = values.get("--out");
  if (out === undefined) return { ok: false, message: "--out <dir> 가 없다" };
  const transition = values.get("--transition");
  if (transition !== undefined && !(REEL_TRANSITIONS as readonly string[]).includes(transition)) {
    return { ok: false, message: `--transition 은 ${REEL_TRANSITIONS.join(" | ")} 중 하나: ${transition}` };
  }
  const args: ReelArgs = { cardsDir: positional[0]!, outDir: out, burn, coversHangul };
  const set = <K extends keyof ReelArgs>(key: K, flag: string) => {
    const v = values.get(flag);
    if (v !== undefined) (args as unknown as Record<string, unknown>)[key] = v;
  };
  set("transition", "--transition");
  set("subtitlesFile", "--subtitles");
  set("voice", "--voice");
  set("music", "--music");
  set("fontName", "--font-name");
  set("fontsDir", "--fonts-dir");
  set("encoderPreset", "--encoder-preset");
  return { ok: true, args };
}

const MANIFEST_NAMES = ["render-result.json", "cards.json", "manifest.json"] as const;

function describe(path: string): RenderedFile {
  const bytes = readFileSync(path);
  return { name: basename(path), path, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** cards-dir 에서 카드 세트를 읽는다. 매니페스트가 있는데 깨졌으면 PNG 로 조용히 넘어가지 않고 실패한다 */
export function loadCardSet(cardsDir: string): CardRenderResult {
  const dir = resolve(cardsDir);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`카드 폴더가 없다: ${dir}`);

  const manifestName = MANIFEST_NAMES.find((n) => existsSync(join(dir, n)));
  if (manifestName !== undefined) {
    const raw = JSON.parse(readFileSync(join(dir, manifestName), "utf8")) as Partial<CardRenderResult>;
    if (typeof raw.pieceId !== "string" || !Array.isArray(raw.cards) || raw.cards.length === 0) throw new Error(`${manifestName} 가 CardRenderResult 모양이 아니다(pieceId·cards 필요)`);
    const cards = raw.cards.map((c) => {
      if (typeof c?.path !== "string") throw new Error(`${manifestName} 의 cards 항목에 path 가 없다`);
      const path = isAbsolute(c.path) ? c.path : join(dir, c.path);
      return { name: c.name ?? basename(path), path, bytes: c.bytes ?? 0, sha256: c.sha256 ?? "" };
    });
    return { pieceId: raw.pieceId, cards, caption: raw.caption ?? "", hashtags: isStringArray(raw.hashtags) ? raw.hashtags : [], altTexts: isStringArray(raw.altTexts) ? raw.altTexts : [], warnings: isStringArray(raw.warnings) ? raw.warnings : [] };
  }

  const collator = new Intl.Collator("en", { numeric: true });
  const pngs = readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort(collator.compare);
  if (pngs.length === 0) throw new Error(`카드 PNG 가 없다: ${dir} (render-result.json 도 없음)`);
  return { pieceId: basename(dir), cards: pngs.map((f) => describe(join(dir, f))), caption: "", hashtags: [], altTexts: [], warnings: [] };
}

export function loadSubtitleTexts(file: string): string[] {
  const raw: unknown = JSON.parse(readFileSync(resolve(file), "utf8"));
  if (!isStringArray(raw)) throw new Error(`--subtitles 파일은 문자열 배열(JSON)이어야 한다: ${file}`);
  return raw;
}

export async function runReel(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): Promise<RunResult> {
  const parsed = parseReelArgs(argv);
  if (!parsed.ok) return { code: 2, lines: [`✗ ${parsed.message}`, ...REEL_USAGE] };
  const a = parsed.args;

  try {
    const cards = loadCardSet(a.cardsDir);
    const tracks: AudioSlot[] = [...(a.voice ? [{ role: "voice" as const, path: a.voice }] : []), ...(a.music ? [{ role: "music" as const, path: a.music }] : [])];
    const preset: ReelPreset = {
      ...DEFAULT_REEL_PRESET,
      subtitle: { ...DEFAULT_REEL_PRESET.subtitle, burnIn: a.burn, coversHangul: a.coversHangul, ...(a.fontName ? { fontName: a.fontName } : {}) },
    };
    const composer = createFfmpegReelComposer({
      ...(env.FFMPEG_PATH ? { ffmpegPath: env.FFMPEG_PATH } : {}),
      ...(env.FFPROBE_PATH ? { ffprobePath: env.FFPROBE_PATH } : {}),
      preset,
      tracks,
      ...(a.transition ? { transition: a.transition } : {}),
      ...(a.fontsDir ? { fontsDir: a.fontsDir } : {}),
      ...(a.subtitlesFile ? { subtitleTexts: loadSubtitleTexts(a.subtitlesFile) } : {}),
      ...(a.encoderPreset ? { encoder: { preset: a.encoderPreset } } : {}),
    });
    const reel = await composer.compose(cards, a.outDir);
    return {
      code: 0,
      lines: [
        `✓ ${reel.video.path}  (${reel.durationSec}초, ${(reel.video.bytes / 1024).toFixed(0)}KB, sha256 ${reel.video.sha256.slice(0, 12)})`,
        reel.subtitles ? `✓ ${reel.subtitles.path}` : "· 자막 파일 없음(자막으로 쓸 문장이 없다)",
        ...reel.warnings.map((w) => `! ${w}`),
      ],
    };
  } catch (error) {
    if (error instanceof ReelComposeError || error instanceof FfmpegUnavailableError) return { code: 1, lines: [`✗ ${error.message}`] };
    return { code: 1, lines: [`✗ ${error instanceof Error ? error.message : String(error)}`] };
  }
}
