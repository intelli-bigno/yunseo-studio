// 콘텐츠 탭 「최근 카드뉴스」 — 편집기에서 저장한 덱과 렌더한 편(카드 1장 이상)을 한 줄로 합쳐 최신순으로.
// 덱은 마지막 저장 시각, 렌더본은 게시 예정 시각(slot — 편에 수정 시각이 없어서)을 기준으로 삼는다.
export type RecentItem<D, P> = { kind: "deck"; at: string; deck: D } | { kind: "piece"; at: string; piece: P };

export function recentCards<D extends { updatedAt: string }, P>(decks: readonly D[], pieces: readonly { piece: P; at: string; cards: number }[], limit = 24): RecentItem<D, P>[] {
  const all: RecentItem<D, P>[] = [
    ...decks.map((d) => ({ kind: "deck" as const, at: d.updatedAt, deck: d })),
    ...pieces.filter((p) => p.cards > 0).map((p) => ({ kind: "piece" as const, at: p.at, piece: p.piece })),
  ];
  return all.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || (a.kind === b.kind ? 0 : a.kind === "deck" ? -1 : 1)).slice(0, limit);
}
