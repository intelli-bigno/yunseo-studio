// 수집 레퍼런스 그림(외부 CDN)을 같은 출처로 내려준다 — 편집기 캔버스에 넣어도 PNG 내보내기가 막히지 않고(오염된 캔버스 방지),
// 덱에는 /api/ 주소만 저장된다. 목록(refs.json)에 있는 id 의 i.pinimg.com 그림만 받는다(임의 주소 중계 금지). 내부 참고 전용.
import { referenceImageUrl } from "@/server/library";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const bad = () => new Response("bad gateway", { status: 502 });

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const url = referenceImageUrl(id);
  if (!url) return new Response("not found", { status: 404 });
  try {
    const up = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "error" });
    const type = up.headers.get("content-type") ?? "";
    if (!up.ok || !/^image\/(jpeg|png|webp)$/.test(type)) return bad();
    const buf = await up.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return bad();
    return new Response(buf, { headers: { "content-type": type, "content-length": String(buf.byteLength), "cache-control": "private, max-age=31536000, immutable" } });
  } catch {
    return bad();
  }
}
