// 저장소 안 레퍼런스 캡처(docs/design 아래 jpg·png) — 내부 참고 전용
import { route } from "@/server/api";
import { fileResponse, referenceAsset } from "@/server/library";

export const GET = route(async (req: Request, ctx: { params: Promise<{ path: string[] }> }) => {
  const { path } = await ctx.params;
  // 저장소에 커밋된 캡처 — 하루 동안 다시 묻지 않고, 그 뒤엔 ETag 로 확인(304)
  return fileResponse(req, referenceAsset(path), { cacheControl: "public, max-age=86400, stale-while-revalidate=604800" });
});
