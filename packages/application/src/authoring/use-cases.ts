// [L2] 작성·검수 쓰기 유스케이스 — 새 편·명시 저장(낙관적 동시성)·문장 확인·게이트 행동·이력.
// 규칙 판단은 전부 도메인(story/authoring.ts)이 한다. 여기서는 읽고 → 규칙 적용 → 원자적으로 저장만 한다.
import {
  AUTHORING_KINDS,
  ID_PREFIX,
  applyAction,
  applyEdit,
  availableActions,
  claimBlockers,
  confirmClaim,
  contentHash,
  g3Checklist,
  lastApproval,
  newPiece,
  refresh,
  validApproval,
  pieceBlockers,
  type ActionInput,
  type ActionOption,
  type Approval,
  type AuthoringKind,
  type EditMeta,
  type GateAction,
  type GateDocumentContext,
  type GateId,
  type Piece,
  type PiecePatch,
} from "@yunseo/domain";
import { PieceNotFoundError, type AuthoringClock, type AuthoringStore, type IdGenerator, type RevisionEntry } from "./ports";

export interface AuthoringDeps {
  store: AuthoringStore;
  clock: AuthoringClock;
  ids: IdGenerator;
  /** [L9] 게이트가 쓰는 렌더 전 검사 규칙(금지 표현·포맷·발행 언어). 없어도 출처 없는 수치 등 확인 조건은 도메인이 늘 본다 */
  document?: GateDocumentContext;
}

export interface GateRecordView {
  last: Approval | null;
  /** 마지막 기록이 승인이고 지금 내용과 해시가 같다 */
  valid: boolean;
}

/** 편 상세 편집 화면이 받는 읽기 모델 */
export interface AuthoringView {
  piece: Piece;
  revision: number;
  contentHash: string;
  /** 이후 편이 가리키는 이전 편 */
  preIssue: Piece | null;
  /** 이 이전 편을 가리키는 이후 편들 */
  linkedPosts: Piece[];
  /** 이후 편이 고를 수 있는 이전 편(id·제목) */
  preIssueOptions: { id: string; title: string; slot: string }[];
  /** G2 를 막는 이유(지금 내용 기준) */
  blockers: string[];
  /** 문장별 갖출 것 */
  claimIssues: Record<string, string[]>;
  actions: ActionOption[];
  checklist: string[];
  gates: Record<GateId, GateRecordView>;
}

export interface NewPieceCommand {
  kind: AuthoringKind;
  title: string;
  slot: string;
  viewpoint?: string;
  preIssueId?: string | null;
  actor: string;
}

export interface SaveCommand {
  expectedRevision: number;
  patch: PiecePatch;
  meta: Omit<EditMeta, "at">;
}

export interface SaveResult {
  revision: number;
  invalidated: GateId[];
  changed: number;
}

export function createAuthoringUseCases({ store, clock, ids, document = {} }: AuthoringDeps) {
  const load = async (id: string): Promise<Piece> => {
    const p = await store.loadPiece(id);
    if (!p) throw new PieceNotFoundError(id);
    return p;
  };
  /** 이후 편이면 가리키는 이전 편(없는 id 면 null, 연결 없음이면 undefined) */
  const preOf = async (p: Pick<Piece, "kind" | "preIssueId">): Promise<Piece | null | undefined> =>
    p.kind === "post" && p.preIssueId ? await store.loadPiece(p.preIssueId) : undefined;

  return {
    async isEmpty(): Promise<boolean> {
      return (await store.countPieces()) === 0;
    },

    async seedDemo(): Promise<{ seeded: boolean }> {
      return { seeded: await store.seedDemo() };
    },

    /** 새 편 — 3종만. 이후 편은 이전 편을 가리킬 수 있다(없는 편·이전 편이 아닌 편이면 거절) */
    async createPiece(cmd: NewPieceCommand): Promise<{ id: string; revision: number }> {
      if (!(AUTHORING_KINDS as readonly string[]).includes(cmd.kind)) throw new Error(`종류 ${cmd.kind} 는 만들 수 없음`);
      if (cmd.preIssueId) {
        const pre = await store.loadPiece(cmd.preIssueId);
        if (!pre || pre.kind !== "pre") throw new Error(`이전 편 ${cmd.preIssueId} 없음`);
      }
      const at = clock.now();
      const piece = newPiece({ id: ids.next(ID_PREFIX[cmd.kind]), kind: cmd.kind, title: cmd.title, slot: cmd.slot, viewpoint: cmd.viewpoint ?? "", preIssueId: cmd.preIssueId ?? null });
      const revision = await store.createPiece(piece, { at, actor: cmd.actor.trim() || "운영자", changeKind: "create", reason: null, readerNote: null, followUp: null, changes: [], contentHash: contentHash(piece), status: piece.status });
      return { id: piece.id, revision };
    },

    /** 편집 화면 읽기 모델 */
    async getAuthoring(id: string): Promise<AuthoringView | null> {
      const piece = await store.loadPiece(id);
      if (!piece) return null;
      const pre = await preOf(piece);
      const ctx = { preIssue: pre ?? null, document };
      const [linkedPosts, pres] = await Promise.all([piece.kind === "pre" ? store.findLinkedPosts(id) : Promise.resolve([]), piece.kind === "post" ? store.listPreIssues() : Promise.resolve([])]);
      const fresh = refresh(piece, ctx);
      const gate = (g: GateId): GateRecordView => ({ last: lastApproval(fresh, g), valid: !!validApproval(fresh, g) });
      return {
        piece: fresh,
        revision: piece.revision ?? 0,
        contentHash: contentHash(fresh),
        preIssue: pre ?? null,
        linkedPosts,
        preIssueOptions: pres.map((p) => ({ id: p.id, title: p.title, slot: p.slot })),
        blockers: pieceBlockers(fresh, ctx),
        claimIssues: Object.fromEntries(fresh.claims.map((c) => [c.id, claimBlockers(c, fresh.claims)])),
        actions: availableActions(fresh, ctx),
        checklist: g3Checklist(fresh.kind),
        gates: { G1: gate("G1"), G2: gate("G2"), G3: gate("G3") },
      };
    },

    /** 명시 저장 — 자동 저장 아님. 읽은 버전이 다르면 RevisionConflictError */
    async savePiece(id: string, cmd: SaveCommand): Promise<SaveResult> {
      const before = await load(id);
      const at = clock.now();
      const nextPre = cmd.patch.preIssueId !== undefined ? (cmd.patch.preIssueId ? await store.loadPiece(cmd.patch.preIssueId) : undefined) : await preOf(before);
      const linkedPosts = before.kind === "pre" ? await store.findLinkedPosts(id) : [];
      const meta: EditMeta = { ...cmd.meta, at };
      const r = applyEdit(before, cmd.patch, meta, { preIssue: nextPre, linkedPosts, document });
      const changeKind = before.status === "published" ? (cmd.meta.changeKind ?? "edit") : "edit";
      const revision = await store.savePiece({
        piece: r.piece,
        expectedRevision: cmd.expectedRevision,
        approval: null,
        entry: {
          at,
          actor: cmd.meta.actor.trim(),
          changeKind,
          reason: cmd.meta.reason?.trim() || null,
          readerNote: cmd.meta.readerNote?.trim() || null,
          followUp: cmd.meta.followUp?.trim() || null,
          changes: r.changes,
          contentHash: contentHash(r.piece),
          status: r.piece.status,
        },
      });
      return { revision, invalidated: r.invalidated, changed: r.changes.length };
    },

    /** 사람 확인(G2 문장 단위) — 저장된 내용 기준으로만 */
    async confirmClaim(id: string, cmd: { expectedRevision: number; claimId: string; actor: string }): Promise<{ revision: number }> {
      const before = await load(id);
      const at = clock.now();
      const next = refresh(confirmClaim(before, cmd.claimId, cmd.actor, at), { preIssue: (await preOf(before)) ?? null, document });
      const revision = await store.savePiece({
        piece: next,
        expectedRevision: cmd.expectedRevision,
        approval: null,
        entry: { at, actor: cmd.actor.trim(), changeKind: "confirm", reason: null, readerNote: null, followUp: null, changes: [{ path: `claims.${cmd.claimId}.verified`, before: "false", after: "true" }], contentHash: contentHash(next), status: next.status },
      });
      return { revision };
    },

    /** 게이트·상태 행동 — 허용 안 된 전이·조건 미충족이면 도메인이 예외 */
    async act(id: string, cmd: { expectedRevision: number; action: GateAction; input: Omit<ActionInput, "at"> }): Promise<{ revision: number; status: Piece["status"] }> {
      const before = await load(id);
      const at = clock.now();
      const pre = await preOf(before);
      const r = applyAction(before, cmd.action, { ...cmd.input, at }, { preIssue: pre ?? null, document });
      const revision = await store.savePiece({
        piece: r.piece,
        expectedRevision: cmd.expectedRevision,
        approval: r.approval,
        entry: {
          at,
          actor: cmd.input.actor.trim(),
          changeKind: `action:${cmd.action}`,
          reason: cmd.input.reason?.trim() || null,
          readerNote: null,
          followUp: null,
          changes: [{ path: "status", before: before.status, after: r.piece.status }],
          contentHash: contentHash(r.piece),
          status: r.piece.status,
        },
      });
      return { revision, status: r.piece.status };
    },

    /** 새 이후 편이 가리킬 수 있는 이전 편 */
    async listPreIssueOptions(): Promise<{ id: string; title: string; slot: string }[]> {
      return (await store.listPreIssues()).map((p) => ({ id: p.id, title: p.title, slot: p.slot }));
    },

    /** 수정 이력(최근 것부터) */
    async history(id: string): Promise<RevisionEntry[]> {
      return (await store.listRevisions(id)).sort((a, b) => b.revision - a.revision);
    },
  };
}

export type AuthoringUseCases = ReturnType<typeof createAuthoringUseCases>;
