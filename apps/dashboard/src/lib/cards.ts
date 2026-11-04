import { existsSync } from "node:fs";
import { join } from "node:path";

// 카드 미리보기 이미지 묶음. v2(사진 배경판, 4:5)가 있으면 그것을, 없으면 저장소의 v1 시안 A(3:4)를 쓴다.
// v2 렌더는 아직 저장소 밖(Windows 산출물 폴더)에 있어 환경변수 CARD_V2_DIR 로 가리킨다.
export interface CardSet {
  id: "v2" | "a";
  label: string;
  names: string[];
  aspect: string; // CSS aspect-ratio
}

const REPO_REL = ["docs", "design", "card-reference", "example", "render"];
const NAME = /^(?:a-0[1-7]|v2-0[1-8])$/;

const V1: CardSet = { id: "a", label: "카드 v1 시안 A (3:4, 저장소 docs/design/card-reference)", names: ["a-01", "a-02", "a-03", "a-04", "a-05", "a-06", "a-07"], aspect: "3 / 4" };
const V2: CardSet = { id: "v2", label: "카드 v2 사진 배경판 (4:5, CARD_V2_DIR)", names: ["v2-01", "v2-02", "v2-03", "v2-04", "v2-05", "v2-06", "v2-07", "v2-08"], aspect: "4 / 5" };

/** 이름 화이트리스트 — 경로 조작(../) 차단. 후보 파일 경로를 순서대로 돌려준다 */
export function cardPaths(name: string, cwd: string, v2Dir?: string): string[] | null {
  if (!NAME.test(name)) return null;
  if (name.startsWith("v2-")) return v2Dir ? [join(v2Dir, `${name}.png`)] : [];
  // cwd 가 apps/dashboard(next start) 또는 저장소 루트일 때 둘 다 찾는다
  return [join(cwd, "..", "..", ...REPO_REL, `${name}.png`), join(cwd, ...REPO_REL, `${name}.png`)];
}

export function activeCardSet(cwd: string, v2Dir?: string): CardSet {
  const v2Ready = !!v2Dir && V2.names.every((n) => existsSync(join(v2Dir, `${n}.png`)));
  return v2Ready ? V2 : V1;
}
