// 레인 공용 계약(Lead 고정, 2026-11-05) — 콘텐츠 정본 → 카드 → 릴스 → 업로드 묶음.
// 여러 레인이 이 파일을 바이트 그대로 추가한다. 고치지 않는다(바꿀 일이 있으면 Lead 에게 묻는다).
export const CONTENT_KINDS = ["pre-issue", "post-issue", "research"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

/** 콘텐츠 정본 한 편(docs/01 §4). body 의 모양은 domain 의 kind 별 스키마가 정한다 */
export interface ContentDocument {
  id: string;
  kind: ContentKind;
  /** 예: "pre-issue-5/v1" */
  schema: string;
  /** domain 검증기를 통과한 kind 별 본문(공통 봉투 포함) */
  body: unknown;
}

export interface RenderedFile {
  name: string;
  path: string;
  bytes: number;
  sha256: string;
}

export interface CardRenderResult {
  pieceId: string;
  /** 1080x1350 PNG, 게시 순서 */
  cards: RenderedFile[];
  caption: string;
  hashtags: string[];
  /** cards 와 같은 순서 */
  altTexts: string[];
  warnings: string[];
}

export interface CardRenderer {
  render(doc: ContentDocument, outDir: string): Promise<CardRenderResult>;
}

export interface ReelResult {
  pieceId: string;
  /** 1080x1920 MP4 */
  video: RenderedFile;
  durationSec: number;
  subtitles: RenderedFile | null;
  warnings: string[];
}

export interface ReelComposer {
  compose(cards: CardRenderResult, outDir: string): Promise<ReelResult>;
}

export interface UploadBundle {
  pieceId: string;
  zip: RenderedFile;
}

export interface UploadPackager {
  bundle(cards: CardRenderResult, reel: ReelResult | null, outDir: string): Promise<UploadBundle>;
}
