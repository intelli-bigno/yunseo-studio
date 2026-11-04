// 카드 미리보기 이미지 — 카드 렌더 폴더를 읽기만 한다(화이트리스트 이름만).
import { readFile } from "node:fs/promises";
import { cardPaths } from "@/lib/cards";

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const paths = cardPaths(file, process.cwd(), process.env.CARD_V2_DIR);
  for (const p of paths ?? []) {
    try {
      const buf = await readFile(p);
      return new Response(new Uint8Array(buf), { headers: { "content-type": "image/png", "cache-control": "private, max-age=300" } });
    } catch {
      // 다음 후보 경로
    }
  }
  return new Response("not found", { status: 404 });
}
