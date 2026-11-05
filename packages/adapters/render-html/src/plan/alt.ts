// 장마다 대체텍스트 — 질문·답과 본문 앞부분을 이어 붙인다 (결정적, 새 문장을 쓰지 않는다).
import { plainText } from "@yunseo/domain";
import type { Strings } from "../strings";
import type { Block, CardPage } from "./types";

/** 대체텍스트 길이 상한(글자). Instagram 대체텍스트 한도는 확인하지 못해 짧게 잡은 가정값이다 [미검증] */
export const ALT_TEXT_MAX = 250;

function blockTexts(block: Block): string[] {
  switch (block.t) {
    case "para":
    case "close":
    case "placeholder":
    case "banner":
      return [plainText(block.text)];
    case "box":
      return block.rows.map((r) => plainText([r.title, r.text].filter((x): x is string => x !== undefined).join(": ")));
    case "checks":
      return block.items.map((i) => plainText(i.title));
    case "sources":
      return block.rows.map((r) => plainText(r.title));
  }
}

function clip(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  const cut = chars.slice(0, max - 1).join("");
  const space = cut.lastIndexOf(" ");
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
}

export function altTextOf(page: CardPage, index: number, count: number, s: Strings): string {
  const head = s.cardOf(index + 1, count);
  const lead = page.kind === "cover" ? plainText(page.title ?? "") : [page.question, page.answer].filter((x): x is string => Boolean(x)).map(plainText).join(" → ");
  const gist = page.blocks.flatMap(blockTexts).filter((t) => t !== "");
  return clip([`${head}.`, lead === "" ? null : `${lead}.`, ...gist.slice(0, 3)].filter((x): x is string => x !== null).join(" "), ALT_TEXT_MAX);
}
