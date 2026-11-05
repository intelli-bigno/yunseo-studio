// `pnpm --filter @yunseo/app-worker run collect-events` — 공식 일정을 받아 STUDIO_DB 에 한 번 반영하고 끝난다.
import { collectEventsOnce } from "./collect-events";

const dbPath = process.env["STUDIO_DB"];
if (!dbPath) {
  console.error("STUDIO_DB(SQLite 파일 경로)를 지정한다");
  process.exit(2);
}
const report = await collectEventsOnce({ dbPath });
for (const s of report.sources) {
  const r = s.report;
  console.log(s.ok ? `✓ ${s.source}: 받음 ${s.fetched} · 신규 ${r?.inserted} · 변경 ${r?.changed} · 그대로 ${r?.unchanged} · 사라짐 ${r?.removed}` : `✗ ${s.source}: ${s.error}`);
  for (const w of s.warnings.slice(0, 5)) console.log(`  ! ${w}`);
}
process.exit(report.sources.every((s) => s.ok) ? 0 : 1);
