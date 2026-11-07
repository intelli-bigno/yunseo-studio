// 빠른 이동(⌘K) 항목 — 화면 5개 + 편마다 한 줄(+ 출처 문장이 있으면 출처 바로가기).
import type { PaletteIndex } from "@yunseo/application";
import { KIND_LABEL } from "./labels";

export interface PaletteEntry {
  href: string;
  label: string;
  tag: string;
  hint?: string;
}

const SCREENS: PaletteEntry[] = [
  { href: "/content", label: "콘텐츠", tag: "화면", hint: "g c" },
  { href: "/cards", label: "카드뉴스 제작", tag: "화면", hint: "g n" },
  { href: "/reels", label: "릴스 제작", tag: "화면", hint: "g r" },
  { href: "/shorts", label: "쇼츠", tag: "화면", hint: "g s" },
  { href: "/references", label: "레퍼런스", tag: "화면", hint: "g f" },
];

export function buildPalette(index: PaletteIndex): PaletteEntry[] {
  return [
    ...SCREENS,
    ...index.pieces.map((p) => ({ href: `/content/${p.id}`, label: p.title, tag: KIND_LABEL[p.kind], hint: p.id })),
    ...index.pieces.filter((p) => p.hasClaims).map((p) => ({ href: `/content/${p.id}?tab=sources`, label: `출처 — ${p.title}`, tag: "G2", hint: p.id })),
  ];
}
