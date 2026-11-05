// 게시 계획 — 실제로 호출하지 않고(dry-run) 「무엇을 어떤 순서로 부를 것인가」만 값으로 표현한다.
// 이 모델에는 토큰·계정 정보 칸이 없다: 인증은 `needsAuth` 표시뿐이고, 값은 어디에도 들어오지 않는다.

export type PublishPlatform = "instagram" | "youtube";

/** block: 이 계획은 게시 불가(고쳐야 함) / warn: 사람이 보고 판정 */
export type IssueSeverity = "block" | "warn";

export interface SpecIssue {
  /** 기계가 읽는 코드 — 표·테스트 스냅샷의 키 */
  code: string;
  severity: IssueSeverity;
  /** 어느 대상인가(예: 「카드 3」「캡션」「영상」) */
  subject: string;
  message: string;
  /** 고치는 방법 한 줄 */
  fix?: string;
}

export const isBlocked = (issues: readonly SpecIssue[]): boolean => issues.some((i) => i.severity === "block");

export type PlanParamValue = string | number | boolean | readonly string[];

export interface PlannedStep {
  order: number;
  /** 같은 계획 안에서 유일한 이름 — dependsOn 이 가리킨다 */
  id: string;
  title: string;
  /** local: 우리 쪽에서만 하는 준비(호출 아님) / request: 플랫폼 API 호출 */
  kind: "local" | "request";
  method: "GET" | "POST" | "PUT" | null;
  /** 호출 주소(자리표시자 포함). local 단계는 null */
  url: string | null;
  params: Readonly<Record<string, PlanParamValue>>;
  dependsOn: readonly string[];
  /** 사용자 액세스 토큰이 필요한 호출인가 — 값은 이 시스템 어디에도 저장하지 않는다 */
  needsAuth: boolean;
  note?: string;
}

export interface QuotaForecast {
  label: string;
  /** 이 계획이 쓰는 양 */
  used: number;
  /** 문서에 적힌 한도(없으면 null) */
  limit: number | null;
  unit: string;
  window: string;
  basis: string;
}

export type PlanKind = "ig_carousel" | "ig_image" | "ig_reel" | "yt_short";

export interface PublishPlan {
  /** 영구히 dry-run — 실제 호출 경로가 없다 */
  mode: "dry-run";
  platform: PublishPlatform;
  kind: PlanKind;
  pieceId: string;
  steps: PlannedStep[];
  quota: QuotaForecast[];
  issues: SpecIssue[];
  blocked: boolean;
  /** 계획이 가정한 입력의 한 줄 요약(예: 「카드 7장 · 캡션 312자」) */
  summary: string;
}

// ---- 계획 입력 — 렌더 산출물에서 뽑은 사실(파일 형식·크기·길이). 계약 타입(RenderedFile)과 분리해 도메인은 외부를 모른다.

export interface ImageFacts {
  name: string;
  format: "png" | "jpeg" | "webp" | "other";
  width: number;
  height: number;
  bytes: number;
}

export interface VideoFacts {
  name: string;
  container: "mp4" | "mov" | "other";
  /** 모르면 null — 렌더 계약에 없는 값이다 */
  videoCodec: "h264" | "hevc" | "other" | null;
  fps: number | null;
  width: number;
  height: number;
  durationSec: number;
  bytes: number;
}

export interface InstagramPostInput {
  images: readonly ImageFacts[];
  /** images 와 같은 순서 */
  altTexts: readonly string[];
  caption: string;
  hashtags: readonly string[];
  /** AI 생성 이미지 자기 공개(is_ai_generated). 정하지 않았으면 null — 사람이 정한다 */
  aiGenerated: boolean | null;
}

export interface InstagramReelInput {
  video: VideoFacts;
  cover: ImageFacts | null;
  caption: string;
  hashtags: readonly string[];
  aiGenerated: boolean | null;
  shareToFeed: boolean;
}

export interface YoutubeUploadInput {
  video: VideoFacts;
  title: string;
  description: string;
  tags: readonly string[];
  /** 계획은 항상 private 로 시작한다(사람이 Studio 에서 공개). publishAt 이 있으면 반드시 private */
  privacyStatus: "private" | "public" | "unlisted";
  /** 예약 공개 시각(ISO 8601). 없으면 null */
  publishAt: string | null;
  /** 아동용 여부 — 채널 소유자가 밝힌다. 정하지 않았으면 null */
  selfDeclaredMadeForKids: boolean | null;
  /** 실제처럼 보이는 합성 콘텐츠 공개 여부. 정하지 않았으면 null */
  containsSyntheticMedia: boolean | null;
}

export type PublishPlanRequest =
  | { platform: "instagram"; pieceId: string; kind: "post"; input: InstagramPostInput }
  | { platform: "instagram"; pieceId: string; kind: "reel"; input: InstagramReelInput }
  | { platform: "youtube"; pieceId: string; kind: "short"; input: YoutubeUploadInput; /** 계획 시점(ISO) — 예약 시각이 과거인지 본다 */ now: string };
