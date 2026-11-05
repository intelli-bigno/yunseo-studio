// [L2] 렌더한 카드 미리보기 — 지금 내용으로 렌더한 n 번째(1부터) PNG. 낡은 렌더·없는 카드는 404.
import { pipeline } from "@/server/studio";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; n: string }> }): Promise<Response> {
  const { id, n } = await ctx.params;
  const index = Number(n) - 1;
  if (!Number.isInteger(index) || index < 0) return new Response("not found", { status: 404 });
  const bytes = await pipeline().readRenderedCard(id, index).catch(() => null);
  if (!bytes) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: { "content-type": "image/png", "cache-control": "no-store" } });
}
