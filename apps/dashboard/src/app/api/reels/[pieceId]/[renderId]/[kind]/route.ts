// 쇼츠 영상(video)·표지(cover) — ?dl=1 이면 내려받기
import { fileResponse, reelAsset } from "@/server/library";

export async function GET(req: Request, ctx: { params: Promise<{ pieceId: string; renderId: string; kind: string }> }): Promise<Response> {
  const { pieceId, renderId, kind } = await ctx.params;
  if (kind !== "video" && kind !== "cover") return new Response("not found", { status: 404 });
  const dl = kind === "video" && new URL(req.url).searchParams.has("dl");
  return fileResponse(req, reelAsset(pieceId, renderId, kind), dl ? { download: `${pieceId}-${renderId}.mp4` } : {});
}
