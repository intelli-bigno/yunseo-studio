// 쇼츠 영상(video)·표지(cover) — ?dl=1 이면 내려받기
import { notFound, route } from "@/server/api";
import { fileResponse, reelAsset } from "@/server/library";

export const GET = route(async (req: Request, ctx: { params: Promise<{ pieceId: string; renderId: string; kind: string }> }) => {
  const { pieceId, renderId, kind } = await ctx.params;
  if (kind !== "video" && kind !== "cover") throw notFound("FILE_NOT_FOUND", "파일이 없다");
  const dl = kind === "video" && new URL(req.url).searchParams.has("dl");
  return fileResponse(req, reelAsset(pieceId, renderId, kind), dl ? { download: `${pieceId}-${renderId}.mp4` } : {});
});
