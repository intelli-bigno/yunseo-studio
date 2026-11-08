// [W3 릴스] 편집 소스 — 렌더 카드 그림(PNG)
import { route } from "@/server/api";
import { fileResponse } from "@/server/library";
import { reelsCardAsset } from "@/server/reels";

export const GET = route(async (req: Request, ctx: { params: Promise<{ pieceId: string; renderId: string; file: string }> }) => {
  const { pieceId, renderId, file } = await ctx.params;
  return fileResponse(req, reelsCardAsset(pieceId, renderId, file));
});
