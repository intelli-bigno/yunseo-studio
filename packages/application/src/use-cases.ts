// 유스케이스 — 화면이 부르는 유일한 입구(06 §1.5). 포트만 알고, 구현(SQLite·파일)은 모른다(04 규칙 2).
import { addDays, awaitingMe, blocked, claimIssues, currentGate, queueState, queueSummary, weekDates, weekStartOf, type Piece, type PieceKind } from "@yunseo/domain";
import type { CardAssets, CardImage, CardSet, Clock, StudioRepository } from "./ports";
import type { ContentList, DayColumn, NavSummary, PaletteIndex, PieceDetail, PieceRow, PublishQueueView, QueueRow, ScheduleMode, ScheduleView, TodayBoard } from "./views";

export interface StudioDeps {
  repo: StudioRepository;
  clock: Clock;
  cards: CardAssets;
}

const row = (piece: Piece): PieceRow => ({ piece, gate: currentGate(piece) });
const bySlot = (a: Piece, b: Piece) => a.slot.localeCompare(b.slot);

export function createStudioUseCases({ repo, clock, cards }: StudioDeps) {
  // 편이 사라진 대기열 행은 건너뛴다 — 요약도 보이는 행만 센다
  const queueRows = async (): Promise<QueueRow[]> => {
    const [items, pieces] = await Promise.all([repo.listQueue(), repo.listPieces()]);
    const byId = new Map(pieces.map((p) => [p.id, p]));
    return items.flatMap((item) => {
      const piece = byId.get(item.pieceId);
      return piece ? [{ item, piece, state: queueState(item) }] : [];
    });
  };
  const summarize = (rows: readonly QueueRow[]) => queueSummary(rows.map((r) => r.item));

  const columns = (dates: string[], pieces: readonly Piece[], today: string): DayColumn[] =>
    dates.map((date) => ({
      date,
      state: date === today ? "today" : date < today ? "past" : "default",
      pieces: pieces.filter((p) => p.slot.startsWith(date)).sort(bySlot).map(row),
    }));

  return {
    /** 사이드바 숫자 */
    async getNavSummary(): Promise<NavSummary> {
      const [pieces, queue] = await Promise.all([repo.listPieces(), queueRows()]);
      const stuck = blocked(pieces).length;
      return {
        today: clock.today(),
        awaiting: awaitingMe(pieces).length,
        stuck,
        unpublished: pieces.filter((p) => p.status !== "published").length,
        ready: queue.filter((q) => q.state === "ready").length,
      };
    },

    /** 오늘 — 내 게이트·막힌 편·대기열·이번 주 */
    async getTodayBoard(): Promise<TodayBoard> {
      const today = clock.today();
      const [pieces, variables, queue] = await Promise.all([repo.listPieces(), repo.listWeekVariables(), queueRows()]);
      const mine = awaitingMe(pieces).map(row);
      const stuck = blocked(pieces).map(row);
      const focus = mine[0] ?? stuck[0] ?? null;
      return {
        today,
        focus,
        focusChecked: focus ? focus.piece.claims.filter((c) => claimIssues(c).length === 0).length : 0,
        mine,
        stuck,
        queueSummary: summarize(queue),
        queue,
        variables: [...variables],
        week: columns(weekDates(weekStartOf(today)), pieces, today),
      };
    },

    /** 편성 — 주(기본)·월 */
    async getSchedule(mode: ScheduleMode = "week"): Promise<ScheduleView> {
      const today = clock.today();
      const [pieces, variables, candidates] = await Promise.all([repo.listPieces(), repo.listWeekVariables(), repo.listEventCandidates()]);
      const start = mode === "month" ? weekStartOf(`${today.slice(0, 7)}-01`) : weekStartOf(today);
      const dates = mode === "month" ? Array.from({ length: 35 }, (_, i) => addDays(start, i)) : weekDates(start);
      return { today, mode, from: dates[0]!, to: dates[dates.length - 1]!, days: columns(dates, pieces, today), variables: [...variables], candidates: [...candidates] };
    },

    /** 콘텐츠 목록 — 종류로 거르고 최근 슬롯부터. limit 은 화면이 한 번에 받는 상한이다 */
    async listContent(kind: PieceKind | "all" = "all", limit = 200): Promise<ContentList> {
      const pieces = await repo.listPieces();
      const picked = pieces.filter((p) => kind === "all" || p.kind === kind).sort((a, b) => bySlot(b, a));
      return { kind, rows: picked.slice(0, limit).map(row), total: picked.length };
    },

    /** 편 상세. 없으면 null */
    async getPieceDetail(id: string): Promise<PieceDetail | null> {
      const piece = await repo.getPiece(id);
      if (!piece) return null;
      const preIssue = piece.preIssueId ? await repo.getPiece(piece.preIssueId) : null;
      return { piece, preIssue, openClaims: piece.claims.filter((c) => claimIssues(c).length > 0).length };
    },

    /** 발행 대기열 */
    async getPublishQueue(): Promise<PublishQueueView> {
      const rows = await queueRows();
      return { summary: summarize(rows), rows };
    },

    /** 빠른 이동 색인 원료 */
    async getPaletteIndex(): Promise<PaletteIndex> {
      const pieces = await repo.listPieces();
      return { pieces: pieces.map((p) => ({ id: p.id, title: p.title, kind: p.kind, hasClaims: p.claims.length > 0 })) };
    },

    getCardSet(): Promise<CardSet> {
      return cards.activeSet();
    },

    readCardImage(name: string): Promise<CardImage | null> {
      return cards.read(name);
    },
  };
}

export type StudioUseCases = ReturnType<typeof createStudioUseCases>;
