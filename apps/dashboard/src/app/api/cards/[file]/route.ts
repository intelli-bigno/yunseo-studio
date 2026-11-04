// 카드 미리보기 이미지 — 저장소의 카드 렌더(docs/design/card-reference/example/render)를 읽기만 한다.
import { readFile } from "node:fs/promises";
import { cardPaths } from "@/lib/cards";

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const paths = cardPaths(file, process.cwd());
  if (!paths) return new Response("not found", { status: 404 });
  for (const p of paths) {
    try {
      const buf = await readFile(p);
      return new Response(new Uint8Array(buf), { headers: { "content-type": "image/png", "cache-control": "private, max-age=300" } });
    } catch {
      // 다음 후보 경로
    }
  }
  return new Response("not found", { status: 404 });
}
