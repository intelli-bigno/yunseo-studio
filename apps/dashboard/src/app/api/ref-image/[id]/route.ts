// 수집 레퍼런스 그림(외부 CDN)을 같은 출처로 내려준다 — 편집기 캔버스에 넣어도 PNG 내보내기가 막히지 않고(오염된 캔버스 방지),
// 덱에는 /api/ 주소만 저장된다. 목록(refs.json)에 있는 id 의 i.pinimg.com 그림만 받는다(임의 주소 중계 금지). 내부 참고 전용.
import { AppError } from "@yunseo/domain";
import { notFound, route } from "@/server/api";
import { referenceImageUrl } from "@/server/library";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const upstream = (message: string, cause?: unknown) => new AppError("UPSTREAM_FAILED", message, cause !== undefined ? { cause } : {});

export const GET = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const url = referenceImageUrl(id);
  if (!url) throw notFound("REF_NOT_FOUND", "레퍼런스 그림이 없다");
  let up: Response;
  try {
    up = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "error" });
  } catch (e) {
    throw upstream("레퍼런스 그림을 받지 못했다", e);
  }
  const type = up.headers.get("content-type") ?? "";
  if (!up.ok || !/^image\/(jpeg|png|webp)$/.test(type)) throw upstream(`레퍼런스 그림 서버가 ${up.status} 로 답했다`);
  const buf = await up.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) throw upstream("레퍼런스 그림이 너무 크다");
  return new Response(buf, { headers: { "content-type": type, "content-length": String(buf.byteLength), "cache-control": "private, max-age=31536000, immutable" } });
});
