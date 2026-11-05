// [L7] 게시 계획(L5 dry-run)의 입력 = 작성·검수 파이프라인(L2)이 지금 내용으로 만든 실제 산출물(L1 카드·L3 릴스).
// 낡은 산출물(내용이 바뀐 뒤의 렌더)은 쓰지 않는다 — pipeline.status 가 지금 내용 해시로 만든 것만 돌려준다.
import { probeImage } from "@yunseo/domain";
import type { CardRenderResult, ReelResult, RenderedFile } from "../pipeline/contracts";
import type { PublishSource } from "../publishing/ports";
import type { PipelineUseCases } from "./pipeline";
import { PieceNotFoundError, type BundleFiles } from "./ports";

export interface PipelinePublishSourceDeps {
  pipeline: Pick<PipelineUseCases, "status">;
  /** 카드 파일을 열어 실제 크기를 잰다. 없으면 렌더 계약(1080x1350)을 가정한다 */
  files?: BundleFiles | null;
}

export function createPipelinePublishSource({ pipeline, files = null }: PipelinePublishSourceDeps): PublishSource {
  const view = async (pieceId: string) => {
    try {
      return await pipeline.status(pieceId);
    } catch (error) {
      if (error instanceof PieceNotFoundError) return null;
      throw error;
    }
  };
  return {
    async cards(pieceId: string): Promise<CardRenderResult | null> {
      return (await view(pieceId))?.render ?? null;
    },
    async reel(pieceId: string): Promise<ReelResult | null> {
      return (await view(pieceId))?.reel ?? null;
    },
    async imageSize(file: RenderedFile) {
      const bytes = files ? await files.read(file.path) : null;
      const probe = bytes ? probeImage(bytes) : null;
      return probe ? { width: probe.width, height: probe.height } : null;
    },
  };
}
