// 자막 문장 만들기 — 카드 텍스트에서 핵심 문장 하나를 뽑고, 줄바꿈하고, 길면 줄인다(순수 함수).
import type { ReelPreset } from "./preset";

type SubtitleStyle = ReelPreset["subtitle"];

/** 한글·한자·가나·전각 문자 — 폭이 넓고, 서체에 글리프가 없으면 네모(□)로 나온다 */
const WIDE = /[ᄀ-ᇿ⺀-〿぀-ヿ㄰-㆏㐀-䶿一-鿿가-힯＀-￯]/u;
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/u;

export const hasHangul = (text: string): boolean => HANGUL.test(text);

/** 글자 폭 추정(em) */
export function measureEm(text: string, style: Pick<SubtitleStyle, "latinWidthEm" | "wideWidthEm">): number {
  let em = 0;
  for (const ch of text) em += WIDE.test(ch) ? style.wideWidthEm : style.latinWidthEm;
  return em;
}

const ABBREVIATIONS = new Set(["u.s", "u.k", "e.g", "i.e", "vs", "etc", "inc", "ltd", "mr", "mrs", "ms", "dr", "jr", "sr"]);

/** 마크다운 기호·목록 머리표·여러 공백을 걷어낸다 */
export function cleanCardText(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
    .replace(/[*_`#>]+/g, "")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** 문장 나누기. 마침표 뒤 공백에서 끊되 약어(U.S.)·소수점은 건드리지 않는다 */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (!/[.!?。！？]/.test(ch)) continue;
    const next = text[i + 1];
    const wide = /[。！？]/.test(ch);
    if (!wide && next !== undefined && !/\s/.test(next)) continue; // 3.5% · U.S 처럼 붙어 있는 마침표
    if (ch === ".") {
      const word = text.slice(start, i).split(/\s+/).pop()?.toLowerCase().replace(/^[("'“]+/, "") ?? "";
      if (ABBREVIATIONS.has(word) || /^[a-z]$/.test(word)) continue;
    }
    out.push(text.slice(start, i + 1).trim());
    start = i + 1;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

/** 카드 텍스트(대체 텍스트)에서 핵심 문장 — 첫 문단·첫 목록 항목의 첫 문장 */
export function keySentence(raw: string): string {
  const blocks = raw.replace(/\r/g, "").split(/\n\s*\n|\n\s*(?:[-*•]|\d+[.)])\s+/);
  for (const block of blocks) {
    const first = splitSentences(cleanCardText(block))[0];
    if (first) return first;
  }
  return "";
}

export interface WrappedSubtitle {
  lines: string[];
  /** 줄 수 한도에 맞추려고 문장을 잘랐는가 */
  truncated: boolean;
}

const CLAUSE_BREAKS = /[,;:–—]\s|\s[–—-]\s|[,;:、，]/gu;

/** 한 줄에 들어가는 폭(em)으로 단어 단위 줄바꿈. 공백이 없는 긴 덩어리(한글 등)는 글자 단위로 끊는다 */
function wrapLines(text: string, widthEm: number, style: SubtitleStyle): string[] {
  const lines: string[] = [];
  let line = "";
  const push = () => {
    if (line) lines.push(line);
    line = "";
  };
  for (const word of text.split(" ")) {
    const candidate = line ? `${line} ${word}` : word;
    if (measureEm(candidate, style) <= widthEm) {
      line = candidate;
      continue;
    }
    push();
    if (measureEm(word, style) <= widthEm) {
      line = word;
      continue;
    }
    for (const ch of word) {
      if (measureEm(line + ch, style) > widthEm) push();
      line += ch;
    }
  }
  push();
  return lines;
}

/**
 * 자막 줄 만들기. 줄 수 한도(maxLines)를 넘으면 절(쉼표 등) 경계에서, 그것도 안 되면 단어 경계에서 자르고 말줄임표를 붙인다.
 * widthEm = 자막 글자가 들어가는 폭 ÷ 글자 크기.
 */
export function wrapSubtitle(text: string, widthEm: number, style: SubtitleStyle): WrappedSubtitle {
  const clean = cleanCardText(text);
  if (!clean) return { lines: [], truncated: false };
  const full = wrapLines(clean, widthEm, style);
  if (full.length <= style.maxLines) return { lines: full, truncated: false };

  // 절 경계 후보(긴 것부터) → 한도 안에 들어가는 첫 후보
  const cuts: number[] = [];
  for (const m of clean.matchAll(CLAUSE_BREAKS)) cuts.push(m.index + (/[,;:、，]/u.test(m[0]![0]!) ? 1 : 0));
  for (const cut of cuts.reverse()) {
    const head = clean.slice(0, cut).trim().replace(/[,;:–—-]+$/, "").trim();
    if (head.length >= 12 && wrapLines(head, widthEm, style).length <= style.maxLines) return { lines: wrapLines(head, widthEm, style), truncated: true };
  }
  // 단어 경계에서 자르고 말줄임표
  const words = clean.split(" ");
  while (words.length > 1) {
    words.pop();
    const head = `${words.join(" ").replace(/[,;:.–—-]+$/, "")}…`;
    const lines = wrapLines(head, widthEm, style);
    if (lines.length <= style.maxLines) return { lines, truncated: true };
  }
  const hard = [...clean].slice(0, Math.max(1, Math.floor(widthEm * style.maxLines) - 1)).join("");
  return { lines: wrapLines(`${hard}…`, widthEm, style).slice(0, style.maxLines), truncated: true };
}
