// [W3 릴스] 편집 소스 — 렌더 카드 그림(PNG)
import { fileResponse } from "@/server/library";
import { reelsCardAsset } from "@/server/reels";

export async function GET(req: Request, ctx: { params: Promise<{ pieceId: string; renderId: string; file: string }> }): Promise<Response> {
  const { pieceId, renderId, file } = await ctx.params;
  return fileResponse(req, reelsCardAsset(pieceId, renderId, file));
}
