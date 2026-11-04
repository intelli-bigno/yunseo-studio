// 테스트용 가짜 포트 — 유스케이스·캐시를 어댑터 없이 검증한다(04 테스트 전략).
import type { EventCandidate, Piece, QueueItem, WeekVariable } from "@yunseo/domain";
import type { CardAssets, StudioRepository } from "./ports";

export const piece = (id: string, patch: Partial<Piece> = {}): Piece => ({
  id,
  kind: "pre",
  title: `편 ${id}`,
  slot: "2026-11-04T21:00",
  status: "drafted",
  gates: { G1: "passed", G2: "todo", G3: "todo" },
  blocker: null,
  viewpoint: "",
  stages: [],
  claims: [],
  ...patch,
});

export class FakeRepository implements StudioRepository {
  rev = 1;
  reads = { pieces: 0, queue: 0, revision: 0 };
  constructor(
    public pieces: Piece[] = [],
    public queue: QueueItem[] = [],
    public variables: WeekVariable[] = [],
    public candidates: EventCandidate[] = [],
  ) {}
  async listPieces() {
    this.reads.pieces += 1;
    return structuredClone(this.pieces);
  }
  async getPiece(id: string) {
    return structuredClone(this.pieces.find((p) => p.id === id) ?? null);
  }
  async listWeekVariables() {
    return structuredClone(this.variables);
  }
  async listEventCandidates() {
    return structuredClone(this.candidates);
  }
  async listQueue() {
    this.reads.queue += 1;
    return structuredClone(this.queue);
  }
  async revision() {
    this.reads.revision += 1;
    return this.rev;
  }
}

export const noCards: CardAssets = {
  activeSet: async () => ({ id: "a", label: "없음", names: [], aspect: "3 / 4" }),
  read: async () => null,
};
