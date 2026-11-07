// 레퍼런스 그리드 검색·묶음 필터 — 순수 함수. 검색어는 공백으로 나눠 모두 들어 있어야 한다(제목·묶음·태그, 대소문자 무시).
export interface RefLike {
  label: string;
  set?: string | undefined;
  tags?: string[] | undefined;
}

export function filterRefs<T extends RefLike>(items: T[], query: string, set: string): T[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((it) => {
    if (set && it.set !== set) return false;
    if (!terms.length) return true;
    const hay = `${it.label} ${it.set ?? ""} ${(it.tags ?? []).join(" ")}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

/** 묶음 이름과 장수 — 많은 순 */
export function refSets<T extends RefLike>(items: T[]): { name: string; count: number }[] {
  const n = new Map<string, number>();
  for (const it of items) if (it.set) n.set(it.set, (n.get(it.set) ?? 0) + 1);
  return [...n.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
