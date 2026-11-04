// 빠른 이동(⌘K) 색인 — 처음 열 때 한 번 받는다. 모든 화면 HTML 에 편 목록을 싣지 않기 위해 분리했다.
import { buildPalette } from "@/lib/palette";
import { studio } from "@/server/studio";

export async function GET(): Promise<Response> {
  const entries = buildPalette(await studio().getPaletteIndex());
  return Response.json(entries, { headers: { "cache-control": "private, max-age=60, stale-while-revalidate=600" } });
}
