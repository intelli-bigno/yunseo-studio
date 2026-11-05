// 카드별 배경 이미지 슬롯 — 슬롯 이름(cover · <단> · <단>-2 …)마다 이미지 파일 경로를 지정한다. 지정이 없으면 토큰 색 배경이다.
// 렌더 중에는 이미지를 만들지 않는다: 배경은 미리 만들어 둔 파일(생성형이면 따로 생성)을 읽기만 한다.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";

/** 슬롯 이름 → 이미지 파일 경로 */
export type Backgrounds = Readonly<Record<string, string>>;

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };

/**
 * 폴더에서 배경 지정을 읽는다. `backgrounds.json`({"cover": "파일.jpg", …}, 폴더 기준 상대 경로)이 있으면 그것을,
 * 없으면 `<슬롯>.jpg|jpeg|png` 이름 규칙을 쓴다. 폴더 밖을 가리키는 경로는 거부한다.
 */
export function loadBackgroundDir(dir: string): Backgrounds {
  const root = resolve(dir);
  const manifest = join(root, "backgrounds.json");
  const entries: [string, string][] = existsSync(manifest)
    ? Object.entries(JSON.parse(readFileSync(manifest, "utf8")) as Record<string, string>).map(([slot, file]): [string, string] => [slot, resolve(root, file)])
    : readdirSync(root)
        .filter((name) => extname(name).toLowerCase() in MIME)
        .map((name): [string, string] => [name.slice(0, name.length - extname(name).length), join(root, name)]);
  for (const [slot, file] of entries) {
    if (!file.startsWith(root + "/") && !file.startsWith(root + "\\")) throw new Error(`배경 ${slot}: 폴더 밖을 가리킬 수 없다 (${file})`);
  }
  return Object.fromEntries(entries);
}

/** 파일 → data URI. 지원하지 않는 형식이면 null */
export function backgroundDataUri(path: string): string | null {
  const mime = MIME[extname(path).toLowerCase()];
  return mime === undefined ? null : `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}
