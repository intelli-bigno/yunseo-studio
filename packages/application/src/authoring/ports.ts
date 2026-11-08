// [L2] 작성·검수 쓰기 포트 — 저장(낙관적 동시성·수정 이력·게이트 기록)과 업로드 묶음 파일 읽기.
// 어댑터(storage·publisher-manual)가 구현하고 apps 가 조립한다(04 규칙 3·4).
import { AppError, type Approval, type FieldChange, type Piece, type PieceStatus } from "@yunseo/domain";
import type { CardRenderResult, ReelResult, UploadBundle } from "../pipeline/contracts";

/** 수정 이력 한 줄 — 누가·언제·무엇이·이유(01 §6). 저장·게이트 행동·문장 확인마다 하나 */
export interface RevisionEntry {
  pieceId: string;
  /** 이 기록으로 생긴 편의 저장 버전 */
  revision: number;
  at: string;
  actor: string;
  /** create · edit · correction · update · clarification · confirm · action:<행동> */
  changeKind: string;
  reason: string | null;
  readerNote: string | null;
  /** 후속 게시물 id 또는 기한 */
  followUp: string | null;
  changes: FieldChange[];
  contentHash: string;
  status: PieceStatus;
}

export type NewRevision = Omit<RevisionEntry, "pieceId" | "revision">;

export interface SavePieceCommand {
  /** 저장할 다음 상태(게이트·막힘 한 줄은 도메인이 이미 계산) */
  piece: Piece;
  /** 화면이 읽었던 버전 — 지금 저장 버전과 다르면 RevisionConflictError */
  expectedRevision: number;
  entry: NewRevision;
  /** 이번에 새로 생긴 게이트 기록(없으면 null) */
  approval: Approval | null;
}

/** 파이프라인 산출물 기록 — 어떤 내용 해시로 만들었는지와 함께 */
export interface PipelineRecord {
  pieceId: string;
  contentHash: string;
  render: CardRenderResult | null;
  reel: ReelResult | null;
  bundle: UploadBundle | null;
  updatedAt: string;
}

/** 누군가 먼저 저장했다 — 화면은 새로 읽고 다시 고쳐야 한다 */
export class RevisionConflictError extends AppError<"REVISION_CONFLICT"> {
  constructor(
    readonly pieceId: string,
    readonly expected: number,
    readonly actual: number,
  ) {
    super("REVISION_CONFLICT", `${pieceId}: 다른 곳에서 먼저 저장됨 (읽은 버전 ${expected}, 지금 ${actual})`, { details: { pieceId, expected, actual } });
    this.name = "RevisionConflictError";
  }
}

export class PieceNotFoundError extends AppError<"PIECE_NOT_FOUND"> {
  constructor(readonly pieceId: string) {
    super("PIECE_NOT_FOUND", `편 ${pieceId} 없음`, { status: 404, details: { pieceId } });
    this.name = "PieceNotFoundError";
  }
}

export interface AuthoringStore {
  /** 편 하나(저장 버전·게이트 기록 포함). 없으면 null */
  loadPiece(id: string): Promise<Piece | null>;
  /** 이 이전 편을 가리키는 이후 편들 */
  findLinkedPosts(preIssueId: string): Promise<Piece[]>;
  /** 이후 편이 가리킬 수 있는 이전 편 목록(최근 슬롯부터) */
  listPreIssues(): Promise<Piece[]>;
  /** 새 편 — 저장 버전 1 로 만든다. 같은 id 가 있으면 예외 */
  createPiece(piece: Piece, entry: NewRevision): Promise<number>;
  /** 원자적 저장: 편 + 이력 + 게이트 기록 + 대기열 해시. 새 저장 버전을 돌려준다 */
  savePiece(command: SavePieceCommand): Promise<number>;
  listRevisions(pieceId: string): Promise<RevisionEntry[]>;
  getPipeline(pieceId: string): Promise<PipelineRecord | null>;
  savePipeline(record: PipelineRecord): Promise<void>;
  countPieces(): Promise<number>;
  /** 빈 저장소에만 시안 데이터를 채운다(「빈 DB 데모 채우기」). 채웠으면 true */
  seedDemo(): Promise<boolean>;
}

/** 지금 시각(ISO, 분 이상 정밀도) */
export interface AuthoringClock {
  now(): string;
}

export interface IdGenerator {
  /** 접두사(P·A·R) + 겹치지 않는 꼬리 */
  next(prefix: string): string;
}

/** 산출물 파일(묶음 zip·렌더 카드)을 읽는다(publisher-manual 이 구현, 작업 폴더 안만) */
export interface BundleFiles {
  read(path: string): Promise<Uint8Array | null>;
  /** read 가 읽을 수 있는 파일인가 — 내용을 읽지 않고 같은 규칙(작업 폴더 안·허용 확장자)으로 판정한다(목록 썸네일이 쓴다) */
  has(path: string): Promise<boolean>;
}
