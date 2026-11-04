// CardAssets 포트의 파일 구현 — 렌더된 카드 PNG 폴더를 읽기만 한다.
// v2(사진 배경판, 4:5)가 있으면 그것을, 없으면 저장소의 v1 시안 A(3:4)를 쓴다.
// v2 렌더는 아직 저장소 밖(Windows 산출물 폴더)에 있어 폴더 경로를 주입받는다(환경변수 CARD_V2_DIR 은 apps 가 읽는다).
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { CardAssets, CardImage, CardSet } from "@yunseo/application";

const NAME = /^(?:a-0[1-7]|v2-0[1-8])$/;

const V1: CardSet = { id: "a", label: "카드 v1 시안 A (3:4, 저장소 docs/design/card-reference)", names: ["a-01", "a-02", "a-03", "a-04", "a-05", "a-06", "a-07"], aspect: "3 / 4" };
const V2: CardSet = { id: "v2", label: "카드 v2 사진 배경판 (4:5, CARD_V2_DIR)", names: ["v2-01", "v2-02", "v2-03", "v2-04", "v2-05", "v2-06", "v2-07", "v2-08"], aspect: "4 / 5" };

export interface FileCardAssetsOptions {
  /** v1 렌더 폴더 후보 — 앞에서부터 먼저 찾은 파일을 쓴다 */
  renderDirs: readonly string[];
  /** v2 렌더 폴더(없으면 v2 는 쓰지 않는다) */
  v2Dir?: string | undefined;
}

/** 이름 화이트리스트 — 경로 조작(../) 차단. 후보 파일 경로를 순서대로 돌려준다 */
export function cardPaths(name: string, { renderDirs, v2Dir }: FileCardAssetsOptions): string[] | null {
  if (!NAME.test(name)) return null;
  if (name.startsWith("v2-")) return v2Dir ? [join(v2Dir, `${name}.png`)] : [];
  return renderDirs.map((dir) => join(dir, `${name}.png`));
}

export function createFileCardAssets(options: FileCardAssetsOptions): CardAssets {
  return {
    async activeSet(): Promise<CardSet> {
      const { v2Dir } = options;
      return v2Dir && V2.names.every((n) => existsSync(join(v2Dir, `${n}.png`))) ? V2 : V1;
    },

    async read(name: string): Promise<CardImage | null> {
      for (const path of cardPaths(name, options) ?? []) {
        try {
          const [bytes, info] = await Promise.all([readFile(path), stat(path)]);
          return { bytes, contentType: "image/png", etag: `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"` };
        } catch {
          // 다음 후보 경로
        }
      }
      return null;
    },
  };
}
