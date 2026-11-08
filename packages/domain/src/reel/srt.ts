// SRT 자막 파일 만들기(순수 함수).
import { AppError } from "../errors";

export interface SrtCue {
  startMs: number;
  endMs: number;
  /** 줄바꿈은 \n */
  text: string;
}

export function formatSrtTime(ms: number): string {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  const s = Math.floor((t % 60_000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(t % 1000, 3)}`;
}

export function buildSrt(cues: readonly SrtCue[]): string {
  return cues.map((c, i) => `${i + 1}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\n${c.text}\n`).join("\n");
}

/** SRT 읽기 실패 — line 은 1부터 */
export class SrtParseError extends AppError<"SRT_PARSE_ERROR"> {
  override name = "SrtParseError";
  constructor(message: string, readonly line: number) {
    super("SRT_PARSE_ERROR", message, { status: 422, path: `line ${line}` });
  }
}

const SRT_TIME = /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/;
const parseSrtTime = (s: string, line: number): number => {
  const m = SRT_TIME.exec(s.trim());
  if (!m) throw new SrtParseError(`시각 모양이 틀렸다: ${s.trim()}`, line);
  const [, h, mi, se, ms] = m;
  return Number(h) * 3_600_000 + Number(mi) * 60_000 + Number(se) * 1000 + Number(ms!.padEnd(3, "0"));
};

/** SRT 본문 → 큐 목록. 번호 줄은 없어도 된다. BOM·CRLF 허용 */
export function parseSrt(srt: string): SrtCue[] {
  const lines = srt.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const cues: SrtCue[] = [];
  let i = 0;
  while (i < lines.length) {
    while (i < lines.length && !lines[i]!.trim()) i += 1;
    if (i >= lines.length) break;
    if (/^\d+$/.test(lines[i]!.trim()) && lines[i + 1]?.includes("-->")) i += 1;
    const timing = lines[i]!;
    if (!timing.includes("-->")) throw new SrtParseError(`시각 줄(-->)이 없다: ${timing.trim()}`, i + 1);
    const [a, b] = timing.split("-->");
    const startMs = parseSrtTime(a!, i + 1);
    const endMs = parseSrtTime(b!.trim().split(/\s+/)[0]!, i + 1);
    if (!(endMs > startMs)) throw new SrtParseError("끝 시각이 시작보다 빠르다", i + 1);
    i += 1;
    const text: string[] = [];
    while (i < lines.length && lines[i]!.trim()) text.push(lines[i++]!.trim());
    cues.push({ startMs, endMs, text: text.join("\n") });
  }
  return cues;
}
