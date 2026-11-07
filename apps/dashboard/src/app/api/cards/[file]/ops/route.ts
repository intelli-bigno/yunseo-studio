// [cards] 덱 편집 명령 — GET 상태(덱·revision·실행취소·스티커 목록) · POST op/batch/undo/redo (docs/13-cards-ops-schema.md)
// 폴더 이름이 [file] 인 것은 같은 단계의 기존 라우트(api/cards/[file] — 카드 그림)와 슬러그 이름을 맞춰야 해서다 — 값은 덱 id.
import { cardOps } from "@/server/studio";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ file: string }> };
const DECK_ID = /^[A-Za-z0-9_-]{1,40}$/;
const notFound = (id: string) => Response.json({ error: { code: "DECK_NOT_FOUND", message: `${id} 없음` } }, { status: 404 });

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const id = (await ctx.params).file;
  if (!DECK_ID.test(id)) return notFound(id);
  const r = await cardOps().getState(id);
  return Response.json(r.body, { status: r.status });
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const id = (await ctx.params).file;
  if (!DECK_ID.test(id)) return notFound(id);
  const text = await req.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  const r = await cardOps().postOp(id, body, Buffer.byteLength(text));
  return Response.json(r.body, { status: r.status });
}
