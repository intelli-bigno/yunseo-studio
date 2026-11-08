// [L2] 렌더한 카드 미리보기 — 지금 내용으로 렌더한 n 번째(1부터) PNG. 낡은 렌더·없는 카드는 404.
import { notFound, route } from "@/server/api";
import { pipeline } from "@/server/studio";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ id: string; n: string }> }) => {
  const { id, n } = await ctx.params;
  const index = Number(n) - 1;
  if (!Number.isInteger(index) || index < 0) throw notFound("CARD_NOT_FOUND", "카드가 없다");
  const bytes = await pipeline().readRenderedCard(id, index);
  if (!bytes) throw notFound("CARD_NOT_FOUND", "카드가 없다");
  return new Response(new Uint8Array(bytes), { headers: { "content-type": "image/png", "cache-control": "no-store" } });
});
