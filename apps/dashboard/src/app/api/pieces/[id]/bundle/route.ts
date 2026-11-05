// [L2] 업로드 묶음 zip 내려받기 — 지금 내용·유효한 G3 승인으로 만든 묶음만(유스케이스가 판단). 아니면 404.
import { pipeline } from "@/server/studio";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const file = await pipeline().readBundle(id).catch(() => null);
  if (!file) return new Response("묶음 없음 — 승인본으로 다시 묶으세요", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${encodeURIComponent(file.name)}"`,
      "cache-control": "no-store",
    },
  });
}
