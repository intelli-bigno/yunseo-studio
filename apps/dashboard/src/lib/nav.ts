// 화면 사이 이동 규칙 — 한 편을 열 때 어느 탭으로 가는가(06 §1.1: 편의 길 = 탭 순서).
import type { GateId, Piece } from "@yunseo/domain";
import type { PieceRow } from "@yunseo/application";
import type { DetailTab } from "./shortcuts";

/** 지금 서 있는 게이트가 가리키는 탭. 자료 대기 편은 작성에서 시작한다 */
export function tabFor(piece: Pick<Piece, "status">, gate: GateId | null): DetailTab {
  if (piece.status === "evidence_wait") return "write";
  return gate === "G2" ? "sources" : gate === "G3" ? "review" : "write";
}

export const pieceHref = ({ piece, gate }: PieceRow): string => `/content/${piece.id}?tab=${tabFor(piece, gate)}`;
