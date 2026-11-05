// [L9] 자막 서체 실측 준비 — 저장소 Pretendard(WOFF)를 릴스 합성기와 같은 함수(stageSubtitleFonts)로 OTF 로 바꿔 <out>/fonts 에 두고,
// 한글 자막 한 줄짜리 test.ass 를 쓴다. 그다음 Windows 네이티브 ffmpeg 로 아래처럼 돌려 libass 가 Pretendard 를 고르는지 본다(서체 시스템 설치 없음).
//   pnpm exec tsx scripts/reel-font-check.ts <out>
//   ffmpeg -loglevel debug -f lavfi -i color=c=black:s=1080x1920:d=1 -vf subtitles=filename=test.ass:fontsdir=fonts -frames:v 1 shot.png
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stageSubtitleFonts } from "../packages/adapters/video/src/composer";

const out = process.argv[2];
if (!out) throw new Error("usage: reel-font-check.ts <out-dir>");
await mkdir(join(out, "fonts"), { recursive: true });
const fonts = await stageSubtitleFonts(fileURLToPath(new URL("../packages/adapters/render-html/fonts/", import.meta.url)), join(out, "fonts"));
const ass = [
  "[Script Info]",
  "ScriptType: v4.00+",
  "PlayResX: 1080",
  "PlayResY: 1920",
  "",
  "[V4+ Styles]",
  "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  "Style: Default,Pretendard,72,&H00FFFFFF,&H00FFFFFF,&H80000000,&H80000000,0,0,0,0,100,100,0,0,3,16,0,2,60,60,200,1",
  "",
  "[Events]",
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  "Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,금리가 먼저 움직인다",
  "",
].join("\r\n");
await writeFile(join(out, "test.ass"), `${String.fromCharCode(0xfeff)}${ass}`, "utf8");
console.log(JSON.stringify({ out, fonts }));
