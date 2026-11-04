import { fileURLToPath } from "node:url";
import { runValidate } from "./run";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const [command, ...flags] = process.argv.slice(2);

if (command !== "validate") {
  console.error("사용법: validate [--publish]   (--publish: 자리표시자가 남아 있으면 실패)");
  process.exit(2);
}
const { code, lines } = runValidate(root, { publish: flags.includes("--publish") });
console.log(lines.join("\n"));
process.exit(code);
