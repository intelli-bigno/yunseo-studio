// 카드 미리보기 이미지 — 유스케이스가 화이트리스트 이름만 읽는다. 내용이 같으면 304(ETag) 로 본문을 다시 보내지 않는다.
import { studio } from "@/server/studio";

export async function GET(req: Request, ctx: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await ctx.params;
  const image = await studio().readCardImage(file);
  if (!image) return new Response("not found", { status: 404 });
  const headers = { "content-type": image.contentType, etag: image.etag, "cache-control": "private, max-age=3600, stale-while-revalidate=86400" };
  if (req.headers.get("if-none-match") === image.etag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(image.bytes), { headers });
}
