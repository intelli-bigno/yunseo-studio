// 저장소 안 레퍼런스 캡처(docs/design 아래 jpg·png) — 내부 참고 전용
import { route } from "@/server/api";
import { fileResponse, referenceAsset } from "@/server/library";

export const GET = route(async (req: Request, ctx: { params: Promise<{ path: string[] }> }) => {
  const { path } = await ctx.params;
  return fileResponse(req, referenceAsset(path));
});
