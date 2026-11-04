import { join } from "node:path";

// 카드 렌더 이름 화이트리스트 — 경로 조작(../) 차단. 카드 v2 렌더가 생기면 이 목록과 폴더만 바꾼다.
const NAME = /^[ab]-0[1-9]$/;
const REL = ["docs", "design", "card-reference", "example", "render"];

/** cwd 가 apps/dashboard(next start) 또는 저장소 루트일 때 둘 다 찾는다 */
export function cardPaths(name: string, cwd: string): string[] | null {
  if (!NAME.test(name)) return null;
  return [join(cwd, "..", "..", ...REL, `${name}.png`), join(cwd, ...REL, `${name}.png`)];
}
