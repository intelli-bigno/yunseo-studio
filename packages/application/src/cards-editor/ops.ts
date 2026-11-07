// [cards] 덱 편집 명령 유스케이스 — POST /api/cards/:id/ops (docs/13-cards-ops-schema.md). 봉투·오류 모양은 릴스 ops(docs/12) 와 같다.
// 저장은 기존 덱 저장소(revision 낙관적 동시성)를 그대로 쓴다. 실행취소 기록·멱등 응답은 서버 메모리에 덱별로 둔다(재시작하면 비워진다).
import { CardOpError, STICKER_DEFS, applyCardOp, type CardDeck, type CardOpEffects } from "@yunseo/domain";
import type { CardDeckStore } from "./ports";

export interface CardOpsResponse {
  status: number;
  body: Record<string, unknown>;
}

export const CARD_OPS_MAX_BYTES = 1_000_000;
export const CARD_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
const HISTORY_MAX = 100;

interface Step {
  /** 이 단계를 저장한 뒤의 revision */
  revision: number;
  before: CardDeck;
  after: CardDeck;
}
interface History {
  past: Step[];
  future: Step[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const opIdOf = (revision: number) => `op-${String(revision).padStart(6, "0")}`;

export function createCardOpsUseCases(deps: { store: CardDeckStore; now: () => string; newId: () => string; clock?: () => number }) {
  const clock = deps.clock ?? (() => Date.now());
  const history = new Map<string, History>();
  const responses = new Map<string, { at: number; body: Record<string, unknown> }>();
  const fail = (e: CardOpError, revision?: number): CardOpsResponse => ({ status: e.status, body: { error: e.toBody(), ...(revision !== undefined ? { revision } : {}) } });

  /** 기록이 지금 revision 과 이어지지 않으면(통째 PUT 등으로 바뀜) 버린다 */
  const hist = (id: string, revision: number): History => {
    const h = history.get(id) ?? { past: [], future: [] };
    const top = h.past.at(-1) ?? h.future.at(-1);
    if (top && top.revision !== revision) {
      h.past = [];
      h.future = [];
    }
    history.set(id, h);
    return h;
  };
  const undoState = (h: History) => ({ available: h.past.length > 0, redo: h.future.length > 0 });

  return {
    /** GET — 덱·revision·실행취소 상태·스티커 라이브러리(에이전트가 고를 id) */
    async getState(id: string): Promise<CardOpsResponse> {
      const rec = await deps.store.get(id);
      if (!rec) return fail(new CardOpError("DECK_NOT_FOUND", `${id} 없음`));
      return { status: 200, body: { id, revision: rec.revision, deck: rec.deck, undo: undoState(hist(id, rec.revision)), stickers: STICKER_DEFS.map((s) => ({ id: s.id, name: s.name, group: s.group, aspect: s.aspect, hasLabel: s.hasLabel, label: s.look.label })) } };
    },

    async postOp(id: string, raw: unknown, rawBytes = 0): Promise<CardOpsResponse> {
      if (rawBytes > CARD_OPS_MAX_BYTES) return fail(new CardOpError("TOO_LARGE", "요청이 1MB 를 넘는다"));
      if (!isObj(raw) || typeof raw.revision !== "number" || !isObj(raw.op)) return fail(new CardOpError("BAD_REQUEST", "revision(숫자)·op(객체)가 필요하다"));
      const rec = await deps.store.get(id);
      if (!rec) return fail(new CardOpError("DECK_NOT_FOUND", `${id} 없음`));
      const requestId = typeof raw.requestId === "string" && raw.requestId ? `${id}:${raw.requestId.slice(0, 100)}` : null;
      const t = clock();
      for (const [k, v] of responses) if (t - v.at > CARD_REQUEST_TTL_MS) responses.delete(k);
      if (requestId && responses.has(requestId)) return { status: 200, body: responses.get(requestId)!.body };
      if (raw.revision !== rec.revision) return fail(new CardOpError("REVISION_CONFLICT", `revision ${raw.revision} 이 낡았다(현재 ${rec.revision})`), rec.revision);
      const h = hist(id, rec.revision);
      const op = raw.op;
      let next: CardDeck;
      let effects: CardOpEffects;
      let kind: "do" | "undo" | "redo" = "do";
      try {
        if (op.op === "undo" || op.op === "redo") {
          kind = op.op;
          const from = kind === "undo" ? h.past : h.future;
          const s = from.at(-1);
          if (!s) throw new CardOpError(kind === "undo" ? "NOTHING_TO_UNDO" : "NOTHING_TO_REDO", kind === "undo" ? "실행취소할 것이 없다" : "다시실행할 것이 없다");
          next = kind === "undo" ? s.before : s.after;
          effects = { created: [], updated: [id], removed: [] };
        } else {
          ({ deck: next, effects } = applyCardOp(rec.deck, op, deps.newId));
        }
      } catch (e) {
        if (e instanceof CardOpError) return fail(e, rec.revision);
        throw e;
      }
      const revision = rec.revision + 1;
      const opId = opIdOf(revision);
      if (raw.dryRun === true) return { status: 200, body: { revision: rec.revision, opId, effects, deck: next, dryRun: true, undo: undoState(h) } };
      const saved = await deps.store.update(next, rec.revision, deps.now());
      if (!saved.ok) return saved.reason === "missing" ? fail(new CardOpError("DECK_NOT_FOUND", `${id} 없음`)) : fail(new CardOpError("REVISION_CONFLICT", "저장 중 다른 곳이 먼저 고쳤다"), saved.revision);
      if (kind === "do") {
        h.past.push({ revision: saved.record.revision, before: rec.deck, after: saved.record.deck });
        if (h.past.length > HISTORY_MAX) h.past.shift();
        h.future = [];
      } else {
        const s = (kind === "undo" ? h.past : h.future).pop()!;
        (kind === "undo" ? h.future : h.past).push({ ...s, revision: saved.record.revision });
      }
      // 다른 쪽 스택 꼭대기도 지금 revision 으로 맞춘다(이어짐 검사용)
      for (const list of [h.past, h.future]) if (list.length) list[list.length - 1] = { ...list[list.length - 1]!, revision: saved.record.revision };
      const body: Record<string, unknown> = { revision: saved.record.revision, opId, effects, ...(raw.return === "diff" ? {} : { deck: saved.record.deck }), warnings: [], undo: undoState(h) };
      if (requestId) responses.set(requestId, { at: t, body });
      return { status: 200, body };
    },
  };
}

export type CardOpsUseCases = ReturnType<typeof createCardOpsUseCases>;
