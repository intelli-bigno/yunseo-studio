// 「빈 DB 데모 채우기」 명령 — pnpm run demo:seed [-- <파일 경로>] (기본 STUDIO_DB).
// 비어 있는 저장소에만 시안 데이터를 넣는다. 이미 편이 있으면 아무것도 바꾸지 않는다.
import { argv, env, exit } from "node:process";
import { createSqliteStudioRepository } from "./sqlite-studio-repository";

const path = argv[2] ?? env.STUDIO_DB;
if (!path) {
  console.error("STUDIO_DB 또는 첫 인자로 SQLite 파일 경로를 주세요 (메모리 DB 는 채워도 남지 않음)");
  exit(2);
}
const repo = createSqliteStudioRepository({ path });
const seeded = await repo.seedDemo();
console.log(seeded ? `채움: ${path} (편 ${await repo.countPieces()}개)` : `그대로 둠: ${path} 에 이미 편 ${await repo.countPieces()}개`);
repo.close();
