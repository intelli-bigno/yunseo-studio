// 테스트용 가짜 초안 명령 — 실제 모델을 부르지 않는다. 첫 인자가 동작을 고른다.
import { readFileSync } from "node:fs";
import process from "node:process";
import { setTimeout } from "node:timers";

const mode = process.argv[2] ?? "ok";
const request = JSON.parse(readFileSync(0, "utf8"));

if (mode === "ok") {
  process.stdout.write(JSON.stringify({ stages: request.stages.map((s) => ({ key: s.key, body: `[초안] ${request.subject} — ${s.question}` })) }));
} else if (mode === "stray") {
  process.stdout.write(JSON.stringify({ stages: [{ key: "not_requested", body: "x" }] }));
} else if (mode === "banned") {
  process.stdout.write(JSON.stringify({ stages: [{ key: request.stages[0].key, body: "수익 보장" }] }));
} else if (mode === "bad-json") {
  process.stdout.write("not json");
} else if (mode === "exit1") {
  process.stderr.write("boom");
  process.exit(1);
} else if (mode === "slow") {
  setTimeout(() => process.stdout.write("{}"), 10_000);
}
