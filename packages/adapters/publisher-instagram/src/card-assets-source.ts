// PublishSource 의 임시 구현 — 이미 렌더된 카드 PNG(CardAssets 포트)를 읽어 렌더 계약(CardRenderResult) 모양으로 돌려준다.
// 카드 렌더(L1)·릴스 합성(L3)의 실제 결과 폴더가 연결되면 그쪽 구현으로 갈아 끼운다. 지금은 캡션·대체 텍스트가 없어 편의 핵심 관점을 임시 캡션으로 쓴다.
import { createHash } from "node:crypto";
import type { CardAssets, CardRenderResult, PublishSource, RenderedFile, StudioRepository } from "@yunseo/application";
import { probeImage } from "@yunseo/domain";

export interface CardAssetsSourceDeps {
  repo: Pick<StudioRepository, "getPiece">;
  cards: CardAssets;
}

export function createCardAssetsPublishSource({ repo, cards }: CardAssetsSourceDeps): PublishSource {
  // 읽은 카드의 실측 크기 — imageSize 가 같은 파일을 다시 읽지 않게 이름으로 기억한다
  const probed = new Map<string, { width: number; height: number }>();

  return {
    async cards(pieceId: string): Promise<CardRenderResult | null> {
      const piece = await repo.getPiece(pieceId);
      if (!piece?.cards || piece.cards.length === 0) return null;
      const files: RenderedFile[] = [];
      const warnings = ["캡션·대체 텍스트는 렌더 결과가 아니라 편의 핵심 관점으로 임시 구성했다 (카드 렌더 연결 전)"];
      for (const name of piece.cards) {
        const image = await cards.read(name);
        if (!image) {
          warnings.push(`카드 ${name} 파일을 읽지 못했다`);
          continue;
        }
        const file: RenderedFile = { name: `${name}.png`, path: `card-assets:${name}`, bytes: image.bytes.length, sha256: createHash("sha256").update(image.bytes).digest("hex") };
        const probe = probeImage(image.bytes);
        if (probe) probed.set(file.name, { width: probe.width, height: probe.height });
        files.push(file);
      }
      if (files.length === 0) return null;
      return { pieceId, cards: files, caption: piece.viewpoint, hashtags: [], altTexts: [], warnings };
    },

    async reel() {
      return null; // 릴스 합성 결과는 L3 가 연결한다
    },

    async imageSize(file: RenderedFile) {
      return probed.get(file.name) ?? null;
    },
  };
}
