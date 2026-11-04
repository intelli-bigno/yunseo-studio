// 키보드 단축키 — 「g 다음 글자」로 이동, 그 밖 단일 키. 표는 도움말(?)이 그대로 보여 준다.
export interface Shortcut {
  keys: string;
  label: string;
  href?: string;
  action?: "palette" | "help" | "prevTab" | "nextTab" | "close";
}

export const SHORTCUTS: Shortcut[] = [
  { keys: "g t", label: "오늘", href: "/" },
  { keys: "g s", label: "편성 캘린더", href: "/schedule" },
  { keys: "g c", label: "콘텐츠", href: "/content" },
  { keys: "g p", label: "발행 대기열", href: "/publish" },
  { keys: "⌘ k", label: "빠른 이동", action: "palette" },
  { keys: "?", label: "단축키 보기", action: "help" },
  { keys: "[", label: "이전 탭 (편 상세)", action: "prevTab" },
  { keys: "]", label: "다음 탭 (편 상세)", action: "nextTab" },
  { keys: "esc", label: "닫기", action: "close" },
];

/** 「g」 다음 키 → 이동 경로 */
export function goTarget(second: string): string | null {
  const hit = SHORTCUTS.find((s) => s.keys === `g ${second.toLowerCase()}`);
  return hit?.href ?? null;
}

export const DETAIL_TABS = ["write", "sources", "preview", "review"] as const;
export type DetailTab = (typeof DETAIL_TABS)[number];
export const DETAIL_TAB_LABEL: Record<DetailTab, string> = { write: "작성", sources: "출처·기준 시점", preview: "미리보기", review: "검수" };

export function stepTab(current: DetailTab, dir: 1 | -1): DetailTab {
  const i = DETAIL_TABS.indexOf(current);
  return DETAIL_TABS[(i + dir + DETAIL_TABS.length) % DETAIL_TABS.length] ?? current;
}

export function isDetailTab(v: unknown): v is DetailTab {
  return typeof v === "string" && (DETAIL_TABS as readonly string[]).includes(v);
}
