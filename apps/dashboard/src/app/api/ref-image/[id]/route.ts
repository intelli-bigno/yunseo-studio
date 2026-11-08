// 수집 레퍼런스 그림(외부 CDN)을 같은 출처로 내려준다 — 편집기 캔버스에 넣어도 PNG 내보내기가 막히지 않고(오염된 캔버스 방지),
// 덱에는 /api/ 주소만 저장된다. 목록(refs.json)에 있는 id 의 i.pinimg.com 그림만 받는다(임의 주소 중계 금지). 내부 참고 전용.
// 서버 메모리에 최근 그림을 두고(상한 24장·24MB) 같은 그림의 동시 요청은 상류를 한 번만 부른다. ETag 로 다시 묻는 요청은 304.
// 상류 실패는 UPSTREAM_FAILED(502)로 던진다 — 로더 캐시는 실패를 남기지 않아 다음 요청이 다시 시도한다.
import { AppError } from "@yunseo/domain";
import { notFound, route } from "@/server/api";
import { contentEtag } from "@/server/http";
import { createLoaderCache } from "@/server/loader-cache";
import { referenceImageUrl } from "@/server/library";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const upstream = (message: string, cause?: unknown) => new AppError("UPSTREAM_FAILED", message, cause !== undefined ? { cause } : {});

interface RefImage {
  bytes: number;
  body: ArrayBuffer;
  type: string;
  etag: string;
}

const cache = createLoaderCache<RefImage>({ maxEntries: 24, maxBytes: 24 * 1024 * 1024 });

async function load(url: string): Promise<RefImage> {
  let up: Response;
  try {
    up = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "error" });
  } catch (e) {
    throw upstream("레퍼런스 그림을 받지 못했다", e);
  }
  const type = up.headers.get("content-type") ?? "";
  if (!up.ok || !/^image\/(jpeg|png|webp)$/.test(type)) throw upstream(`레퍼런스 그림 서버가 ${up.status} 로 답했다`);
  const body = await up.arrayBuffer();
  if (body.byteLength > MAX_BYTES) throw upstream("레퍼런스 그림이 너무 크다");
  return { bytes: body.byteLength, body, type, etag: contentEtag(body) };
}

export const GET = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const url = referenceImageUrl(id);
  if (!url) throw notFound("REF_NOT_FOUND", "레퍼런스 그림이 없다");
  const image = await cache.get(id, () => load(url));
  if (!image) throw upstream("레퍼런스 그림을 받지 못했다");
  const headers = { etag: image.etag, "cache-control": "private, max-age=31536000, immutable" };
  if (req.headers.get("if-none-match") === image.etag) return new Response(null, { status: 304, headers });
  return new Response(image.body, { headers: { ...headers, "content-type": image.type, "content-length": String(image.bytes) } });
});
