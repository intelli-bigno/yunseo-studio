// [L2] 업로드 묶음 zip 내려받기 — 지금 내용·유효한 G3 승인으로 만든 묶음만(유스케이스가 판단). 아니면 404.
import { notFound, route } from "@/server/api";
import { pipeline } from "@/server/studio";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const file = await pipeline().readBundle(id); // 편이 없으면 PIECE_NOT_FOUND(404) 를 던진다
  if (!file) throw notFound("BUNDLE_NOT_FOUND", "묶음 없음 — 승인본으로 다시 묶으세요");
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${encodeURIComponent(file.name)}"`,
      "cache-control": "no-store",
    },
  });
});
