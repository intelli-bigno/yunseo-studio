// 렌더 결과 폴더(scripts/render-examples.sh 의 출력)에서 스냅샷 기준값과 대표 PNG 를 만든다.
// 카드 모양·문구·서체·프리셋을 일부러 바꿨을 때만 다시 만든다 — 바뀐 카드를 눈으로 확인한 뒤에.
//   1) Windows:  win auto -- bash scripts/render-examples.sh /mnt/c/Users/…/폴더
//   2) 결과 폴더를 가져온 뒤:  node scripts/render-golden.mjs <폴더>
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = resolve(process.argv[2] ?? "");
if (process.argv[2] === undefined) {
  console.error("사용법: node scripts/render-golden.mjs <render-examples.sh 의 출력 폴더>");
  process.exit(2);
}
const fixtures = resolve(new URL("../apps/cli/src/__fixtures__", import.meta.url).pathname);
mkdirSync(fixtures, { recursive: true });

// 예시 이름(출력 폴더 이름) → 대표 PNG(용량 최소: 종마다 한 장만 커밋한다)
const SETS = { "pre-issue": "02-why_it_matters.png", "post-issue": "03-result_vs_expectation-2.png", research: "03-tool-2.png", "research-ko": null };

const golden = {};
for (const [name, representative] of Object.entries(SETS)) {
  const meta = JSON.parse(readFileSync(join(dir, name, "render.json"), "utf8"));
  golden[name] = {
    cards: Object.fromEntries(meta.cards.map((c) => [c.name, c.sha256])),
    caption: readFileSync(join(dir, name, "caption.txt"), "utf8").trimEnd(),
    hashtags: meta.hashtags,
  };
  if (representative !== null) copyFileSync(join(dir, name, representative), join(fixtures, `${name}.png`));
}
writeFileSync(join(fixtures, "render-golden.json"), `${JSON.stringify(golden, null, 2)}\n`);
console.log(`기준값 ${Object.keys(golden).length}종 + 대표 PNG ${Object.values(SETS).filter(Boolean).length}장 → ${fixtures}`);
