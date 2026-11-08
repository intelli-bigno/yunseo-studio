// 목록 쿼리 전후(인덱스 없음 → covering 인덱스) — 큰 본문(덱 doc 120KB·릴스 data 200KB) 행이 많을 때의 p50.
//   node scripts/perf/db-list-bench.mjs [행수=400]
import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";

const rows = Number(process.argv[2] ?? 400);
const db = new DatabaseSync(":memory:");
db.exec("PRAGMA page_size = 4096");
db.exec(`CREATE TABLE cards_decks (id TEXT PRIMARY KEY, title TEXT NOT NULL, preset TEXT NOT NULL, card_count INTEGER NOT NULL, doc TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE reels_projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, data TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`);
const ins1 = db.prepare("INSERT INTO cards_decks (id,title,preset,card_count,doc,revision,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)");
const ins2 = db.prepare("INSERT INTO reels_projects (id,title,data,revision,created_at,updated_at) VALUES (?,?,?,1,?,?)");
const blob = (n) => "x".repeat(n);
db.exec("BEGIN");
for (let i = 0; i < rows; i++) {
  const t = new Date(Date.UTC(2026, 10, 1) + ((i * 7919) % rows) * 60000).toISOString();
  ins1.run(`d${i}`, `덱 ${i}`, "4:5", 8, blob(120 * 1024), t, t);
  ins2.run(`r${i}`, `릴스 ${i}`, blob(200 * 1024), t, t);
}
db.exec("COMMIT");

const q1 = db.prepare("SELECT id, title, preset, card_count, revision, updated_at FROM cards_decks ORDER BY updated_at DESC, id");
const q2 = db.prepare("SELECT id, title, revision, created_at, updated_at FROM reels_projects ORDER BY updated_at DESC, id");
const p50 = (q) => {
  for (let i = 0; i < 3; i++) q.all();
  const xs = [];
  for (let i = 0; i < 40; i++) { const t0 = performance.now(); q.all(); xs.push(performance.now() - t0); }
  return Math.round(xs.sort((a, b) => a - b)[20] * 100) / 100;
};
const out = { rows, before: {}, after: {} };
db.exec("CREATE INDEX cards_decks_updated ON cards_decks (updated_at)"); // 전: 단일 열 인덱스(cards_decks), 없음(reels_projects)
out.before = { cardsDecksMs: p50(q1), reelsProjectsMs: p50(q2) };
db.exec("DROP INDEX cards_decks_updated; CREATE INDEX cards_decks_list ON cards_decks (updated_at DESC, id, title, preset, card_count, revision); CREATE INDEX reels_projects_list ON reels_projects (updated_at DESC, id, title, revision, created_at)");
out.after = { cardsDecksMs: p50(q1), reelsProjectsMs: p50(q2) };
console.log(JSON.stringify(out));
