// 자막 번인용 ASS 파일 만들기(순수 함수). SRT 는 납품용, ASS 는 ffmpeg(libass)가 영상에 새길 때만 쓰는 중간 파일이다.
// PlayRes 를 영상 크기와 같게 두어 글자 크기·여백이 전부 픽셀 값이다 — force_style 로 SRT 를 새기면 PlayRes 가 384x288 이라 값이 어긋난다.
import { computeReelLayout, type ReelPlan, type ReelPreset } from "@yunseo/domain";

const clock = (ms: number): string => {
  const t = Math.max(0, Math.round(ms / 10) * 10); // ASS 시각은 1/100 초
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  const s = Math.floor((t % 60_000) / 1000);
  const cs = Math.floor((t % 1000) / 10);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
};

/** ASS 에서 { } 는 효과 블록이고 \ 는 이스케이프다 — 자막 글자로는 쓰지 않는다 */
const escapeAssText = (line: string): string => line.replace(/\\/g, "/").replace(/\{/g, "(").replace(/\}/g, ")");

// ASS 색은 &HAABBGGRR (AA=00 불투명). 자막은 흰 글자 + 70% 불투명 검은 상자.
const WHITE = "&H00FFFFFF";
const BOX = "&H4D000000";

export function buildAss(plan: ReelPlan, preset: ReelPreset): string {
  const { canvas, subtitle: sub, safeArea } = preset;
  const layout = computeReelLayout(preset);
  // 상자(BorderStyle=3)는 글자 둘레로 Outline 만큼 번진다 → 번진 상자가 안전영역 안에 들도록 여백에 pad 를 더한다
  const marginL = safeArea.left + sub.padPx;
  const marginR = safeArea.right + sub.padPx;
  const marginV = canvas.height - (layout.subtitleBox.y + layout.subtitleBox.h) + sub.padPx;

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${canvas.width}`,
    `PlayResY: ${canvas.height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${sub.fontName},${sub.fontSize},${WHITE},${WHITE},${BOX},${BOX},0,0,0,0,100,100,0,0,3,${sub.padPx},0,2,${marginL},${marginR},${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events = plan.scenes.flatMap((s) =>
    s.cue === null ? [] : [`Dialogue: 0,${clock((s.cue.startFrame * 1000) / plan.fps)},${clock((s.cue.endFrame * 1000) / plan.fps)},Default,,0,0,0,,${s.cue.lines.map(escapeAssText).join("\\N")}`],
  );
  return `${[...header, ...events].join("\n")}\n`;
}
