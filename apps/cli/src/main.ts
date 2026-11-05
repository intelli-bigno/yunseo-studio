import { fileURLToPath } from "node:url";
import { runEvents } from "./events";
import { runValidate } from "./run";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const [command, ...flags] = process.argv.slice(2);

// [L4] 공식 일정 수집 — `events fetch --dry`
if (command === "events") {
  const { code, lines } = await runEvents(flags, { fetch: globalThis.fetch, now: () => new Date().toISOString().replace(/:\d{2}\.\d{3}Z$/, ":00Z") });
  console.log(lines.join("\n"));
  process.exit(code);
}

if (command !== "validate") {
  console.error("사용법: validate [--publish]   (--publish: 자리표시자가 남아 있으면 실패)  |  events fetch --dry");
  process.exit(2);
}
const { code, lines } = runValidate(root, { publish: flags.includes("--publish") });
console.log(lines.join("\n"));
process.exit(code);
