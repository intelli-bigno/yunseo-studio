import { fileURLToPath } from "node:url";
import { runEvents } from "./events";
import { RENDER_USAGE, runRender } from "./render";
import { runValidate } from "./run";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const [command, ...rest] = process.argv.slice(2);

// [L4] 공식 일정 수집 — `events fetch --dry`
if (command === "events") {
  const { code, lines } = await runEvents(rest, { fetch: globalThis.fetch, now: () => new Date().toISOString().replace(/:\d{2}\.\d{3}Z$/, ":00Z") });
  console.log(lines.join("\n"));
  process.exit(code);
} else if (command === "validate") {
  const { code, lines } = runValidate(root, { publish: rest.includes("--publish") });
  console.log(lines.join("\n"));
  process.exit(code);
} else if (command === "render") {
  const { code, lines } = await runRender(root, rest);
  console.log(lines.join("\n"));
  process.exit(code);
} else {
  console.error(`사용법: validate [--publish]   (--publish: 자리표시자가 남아 있으면 실패)  |  events fetch --dry\n${RENDER_USAGE}`);
  process.exit(2);
}
