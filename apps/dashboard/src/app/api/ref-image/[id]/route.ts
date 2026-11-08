// 수집 레퍼런스 그림(외부 CDN)을 같은 출처로 내려준다 — 편집기 캔버스에 넣어도 PNG 내보내기가 막히지 않고(오염된 캔버스 방지),
// 덱에는 /api/ 주소만 저장된다. 목록(refs.json)에 있는 id 의 i.pinimg.com 그림만 받는다(임의 주소 중계 금지). 내부 참고 전용.
// 서버 메모리에 최근 그림을 두고(상한 24장·24MB) 같은 그림의 동시 요청은 상류를 한 번만 부른다. ETag 로 다시 묻는 요청은 304.
import { contentEtag } from "@/server/http";
import { createLoaderCache } from "@/server/loader-cache";
import { referenceImageUrl } from "@/server/library";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const bad = () => new Response("bad gateway", { status: 502 });

interface RefImage {
  bytes: number;
  body: ArrayBuffer;
  type: string;
  etag: string;
}

const cache = createLoaderCache<RefImage>({ maxEntries: 24, maxBytes: 24 * 1024 * 1024 });

async function load(url: string): Promise<RefImage | null> {
  try {
    const up = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "error" });
    const type = up.headers.get("content-type") ?? "";
    if (!up.ok || !/^image\/(jpeg|png|webp)$/.test(type)) return null;
    const body = await up.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return null;
    return { bytes: body.byteLength, body, type, etag: contentEtag(body) };
  } catch {
    return null;
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const url = referenceImageUrl(id);
  if (!url) return new Response("not found", { status: 404 });
  const image = await cache.get(id, () => load(url));
  if (!image) return bad();
  const headers = { etag: image.etag, "cache-control": "private, max-age=31536000, immutable" };
  if (req.headers.get("if-none-match") === image.etag) return new Response(null, { status: 304, headers });
  return new Response(image.body, { headers: { ...headers, "content-type": image.type, "content-length": String(image.bytes) } });
}
