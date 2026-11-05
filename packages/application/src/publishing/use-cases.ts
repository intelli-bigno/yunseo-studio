// 발행 대기열의 dry-run 미리보기 — 렌더 산출물로 IG·YouTube 게시 계획을 만들고 규격 위반을 보여 준다.
// 이 유스케이스에는 게시(실행) 경로가 없다: 포트가 계획만 돌려준다.
import type { ImageFacts, InstagramPostInput, InstagramReelInput, PieceKind, PublishPlan, QueueItem, VideoFacts, YoutubeUploadInput } from "@yunseo/domain";
import type { Clock, StudioRepository } from "../ports";
import type { CardRenderResult, RenderedFile, ReelResult } from "../pipeline/contracts";
import type { InstagramPublishPlanner, PublishSource, YoutubePublishPlanner } from "./ports";

/** 렌더 계약이 약속한 크기 — 직접 잰 값이 없을 때 쓴다 */
export const CONTRACT_CARD_SIZE = { width: 1080, height: 1350 } as const;
export const CONTRACT_REEL_SIZE = { width: 1080, height: 1920 } as const;

export interface PublishPreview {
  piece: { id: string; title: string; kind: PieceKind; slot: string };
  channel: QueueItem["channel"];
  plans: PublishPlan[];
  /** 계획을 못 만든 이유·가정 — 화면이 그대로 보여 준다 */
  notes: string[];
}

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

function imageFormat(name: string): ImageFacts["format"] {
  const ext = extension(name);
  return ext === "png" ? "png" : ext === "jpg" || ext === "jpeg" ? "jpeg" : ext === "webp" ? "webp" : "other";
}

export interface FactsDeps {
  imageSize?: ((file: RenderedFile) => Promise<{ width: number; height: number } | null>) | undefined;
}

/** 계약 타입 → 도메인 입력. 크기는 직접 잰 값이 있으면 그것, 없으면 계약 값 */
export async function imageFactsOf(file: RenderedFile, deps: FactsDeps = {}): Promise<{ facts: ImageFacts; measured: boolean }> {
  const size = (await deps.imageSize?.(file)) ?? null;
  return { facts: { name: file.name, format: imageFormat(file.name), width: size?.width ?? CONTRACT_CARD_SIZE.width, height: size?.height ?? CONTRACT_CARD_SIZE.height, bytes: file.bytes }, measured: size !== null };
}

export function videoFactsOf(reel: ReelResult): VideoFacts {
  const ext = extension(reel.video.name);
  return {
    name: reel.video.name,
    container: ext === "mp4" ? "mp4" : ext === "mov" ? "mov" : "other",
    videoCodec: null,
    fps: null,
    width: CONTRACT_REEL_SIZE.width,
    height: CONTRACT_REEL_SIZE.height,
    durationSec: reel.durationSec,
    bytes: reel.video.bytes,
  };
}

export interface PublishPlanDeps {
  repo: StudioRepository;
  clock: Clock;
  source: PublishSource;
  instagram: InstagramPublishPlanner;
  youtube: YoutubePublishPlanner;
}

export function createPublishPlanUseCases({ repo, clock, source, instagram, youtube }: PublishPlanDeps) {
  const postInput = async (cards: CardRenderResult): Promise<{ input: InstagramPostInput; measured: boolean }> => {
    const built = await Promise.all(cards.cards.map((c) => imageFactsOf(c, { imageSize: source.imageSize?.bind(source) })));
    return {
      input: { images: built.map((b) => b.facts), altTexts: cards.altTexts, caption: cards.caption, hashtags: cards.hashtags, aiGenerated: null },
      measured: built.every((b) => b.measured),
    };
  };

  return {
    /** 한 편·한 채널의 dry-run 계획. 편이 없으면 null */
    async getPublishPreview(pieceId: string, channel: QueueItem["channel"]): Promise<PublishPreview | null> {
      const piece = await repo.getPiece(pieceId);
      if (!piece) return null;
      const preview: PublishPreview = { piece: { id: piece.id, title: piece.title, kind: piece.kind, slot: piece.slot }, channel, plans: [], notes: [] };

      if (channel === "story") {
        preview.notes.push("스토리는 수동 게시 — 이 화면의 dry-run 대상이 아니다.");
        return preview;
      }

      const cards = await source.cards(pieceId);
      if (channel === "feed") {
        if (!cards) {
          preview.notes.push("카드 산출물이 없다 — 카드 렌더(L1) 결과가 있어야 게시 계획을 만들 수 있다.");
          return preview;
        }
        const { input, measured } = await postInput(cards);
        if (!measured) preview.notes.push(`이미지 크기는 렌더 계약 값(${CONTRACT_CARD_SIZE.width}x${CONTRACT_CARD_SIZE.height})을 가정했다 — 파일을 열어 잰 값이 아니다.`);
        for (const w of cards.warnings) preview.notes.push(`렌더 경고: ${w}`);
        preview.plans.push(instagram.plan({ platform: "instagram", pieceId, kind: "post", input }));
        return preview;
      }

      // reels
      const reel = await source.reel(pieceId);
      if (!reel) {
        preview.notes.push("릴스 산출물이 없다 — 릴스 합성(L3) 결과가 있어야 게시 계획을 만들 수 있다.");
        return preview;
      }
      for (const w of reel.warnings) preview.notes.push(`합성 경고: ${w}`);
      preview.notes.push(`영상 크기는 렌더 계약 값(${CONTRACT_REEL_SIZE.width}x${CONTRACT_REEL_SIZE.height})을 가정했고, 코덱·프레임율은 렌더 결과에 없어 검사하지 못한다.`);
      const video = videoFactsOf(reel);
      const caption = cards?.caption ?? piece.viewpoint;
      const hashtags = cards?.hashtags ?? [];
      const reelInput: InstagramReelInput = { video, cover: null, caption, hashtags, aiGenerated: null, shareToFeed: true };
      preview.plans.push(instagram.plan({ platform: "instagram", pieceId, kind: "reel", input: reelInput }));
      const ytInput: YoutubeUploadInput = {
        video,
        title: piece.title,
        description: caption,
        tags: hashtags.map((t) => t.replace(/^#+/, "")),
        privacyStatus: "private",
        // 편성 슬롯(KST)을 예약 공개 시각으로 — 사람이 Studio 에서 확인 후 공개하는 흐름의 기본값
        publishAt: `${piece.slot}:00+09:00`,
        selfDeclaredMadeForKids: null,
        containsSyntheticMedia: null,
      };
      preview.plans.push(youtube.plan({ platform: "youtube", pieceId, kind: "short", input: ytInput, now: `${clock.today()}T00:00:00+09:00` }));
      return preview;
    },
  };
}

export type PublishPlanUseCases = ReturnType<typeof createPublishPlanUseCases>;
