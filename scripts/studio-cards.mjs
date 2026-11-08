#!/usr/bin/env node
// 카드뉴스 덱 도우미 — 대시보드의 HTTP API(docs/13-cards-ops-schema.md)만 쓴다. 의존성 없음(Node 22 의 fetch).
// 서버가 떠 있어야 한다(bash scripts/start.sh). 주소는 STUDIO_URL, 없으면 http://127.0.0.1:<PORT 또는 8930>.
//
//   node scripts/studio-cards.mjs list                          덱 목록
//   node scripts/studio-cards.mjs create [제목] [--preset 4:5]   빈 덱 만들기 → id 출력
//   node scripts/studio-cards.mjs get <덱 id> [--json]           현재 revision 과 장·레이어 요약(--json = 덱 전체)
//   node scripts/studio-cards.mjs apply <덱 id> <파일|-> [--dry-run]
//                                                               op 하나({"op":…}) 또는 op 배열(→ batch 로 묶음)을 적용
//   node scripts/studio-cards.mjs sample                        샘플 덱을 만든다(이미 있으면 건너뜀)
//
// apply 는 보내기 직전에 최신 revision 을 읽어 붙인다. 화면에서 같은 덱을 열어 둔 채 고치면 화면 저장이 409 로 막히니 덱을 다시 불러온다.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = (process.env.STUDIO_URL || `http://127.0.0.1:${process.env.PORT || 8930}`).replace(/\/$/, "");
const SAMPLE_FILE = fileURLToPath(new URL("../docs/handoff/sample-deck.json", import.meta.url));
const CLIENT_ID = "agent:claude";

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

/** JSON 요청. 서버가 안 떠 있으면 안내하고 끝낸다. */
async function call(method, path, body) {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("30초 안에 응답이 없다")), 30_000).unref();
  });
  try {
    const res = await Promise.race([
      fetch(BASE + path, { method, headers: body === undefined ? {} : { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
      timeout,
    ]);
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 300) };
    }
    return { status: res.status, ok: res.ok, json };
  } catch (e) {
    return fail(`서버에 연결하지 못했다 (${BASE}) — ${e instanceof Error ? e.message : e}\n먼저 실행: bash scripts/start.sh`);
  }
}

/** 실패 응답을 사람이 읽게 출력하고 종료. ops 오류는 { error: { code, message, path? }, revision } */
function failResponse(r, what) {
  const e = r.json?.error;
  if (e && typeof e === "object") fail(`${what} 실패 (${r.status} ${e.code}) — ${e.message}${e.path ? `\n  위치: ${e.path}` : ""}${e.details?.errors ? `\n  칸: ${e.details.errors.join(", ")}` : ""}`);
  fail(`${what} 실패 (${r.status}) — ${JSON.stringify(r.json)}`);
}

const deckUrl = (id) => `${BASE}/cards?deck=${encodeURIComponent(id)}`;

async function apply(id, op, { dryRun = false } = {}) {
  const cur = await call("GET", `/api/cards/${encodeURIComponent(id)}/ops`);
  if (!cur.ok) failResponse(cur, "덱 읽기");
  const r = await call("POST", `/api/cards/${encodeURIComponent(id)}/ops`, { revision: cur.json.revision, clientId: CLIENT_ID, requestId: randomUUID(), op, dryRun, return: "diff" });
  if (!r.ok) failResponse(r, "적용");
  return r.json;
}

const asOp = (value, label) => {
  if (Array.isArray(value)) return { op: "batch", label, ops: value };
  if (value && typeof value === "object" && typeof value.op === "string") return value;
  return fail('op 파일은 {"op": "..."} 하나이거나 op 배열이어야 한다');
};

const readInput = (file) => {
  try {
    return JSON.parse(readFileSync(file === "-" ? 0 : file, "utf8"));
  } catch (e) {
    return fail(`${file} 를 JSON 으로 읽지 못했다 — ${e instanceof Error ? e.message : e}`);
  }
};

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const [, value] = argv.splice(i, 2);
  return value ?? "";
};
const has = (name) => {
  const i = argv.indexOf(name);
  if (i < 0) return false;
  argv.splice(i, 1);
  return true;
};

const preset = flag("--preset");
const dryRun = has("--dry-run");
const asJson = has("--json");
const [cmd, ...rest] = argv;

if (cmd === "list") {
  const r = await call("GET", "/api/cards-decks");
  if (!r.ok) failResponse(r, "목록");
  const rows = Array.isArray(r.json) ? r.json : [];
  if (!rows.length) console.log("(덱 없음)");
  for (const d of rows) console.log(`${d.id}\t${d.title ?? ""}\t${deckUrl(d.id)}`);
} else if (cmd === "create") {
  const r = await call("POST", "/api/cards-decks", { ...(rest[0] ? { title: rest[0] } : {}), ...(preset ? { preset } : {}) });
  if (!r.ok) failResponse(r, "만들기");
  console.log(`${r.json.deck.id}\trevision ${r.json.revision}\t${deckUrl(r.json.deck.id)}`);
} else if (cmd === "get") {
  if (!rest[0]) fail("사용법: get <덱 id> [--json]");
  const r = await call("GET", `/api/cards/${encodeURIComponent(rest[0])}/ops`);
  if (!r.ok) failResponse(r, "읽기");
  if (asJson) console.log(JSON.stringify(r.json.deck, null, 2));
  else {
    const d = r.json.deck;
    console.log(`${d.id} · ${d.title} · ${d.preset} · revision ${r.json.revision} · ${deckUrl(d.id)}`);
    d.cards.forEach((c, i) => console.log(`  [${i}] ${c.id} 바탕 ${c.background} — ${c.layers.map((l) => `${l.id}(${l.kind})`).join(" ") || "빈 장"}`));
  }
} else if (cmd === "apply") {
  if (!rest[0] || !rest[1]) fail("사용법: apply <덱 id> <파일|-> [--dry-run]");
  const r = await apply(rest[0], asOp(readInput(rest[1]), "agent"), { dryRun });
  console.log(`${dryRun ? "[dry-run] " : ""}revision ${r.revision} · 만든 것 ${r.effects?.created?.length ?? 0} · 고친 것 ${r.effects?.updated?.length ?? 0} · 지운 것 ${r.effects?.removed?.length ?? 0}`);
  for (const w of r.warnings ?? []) console.log(`  경고: ${typeof w === "string" ? w : JSON.stringify(w)}`);
  if (!dryRun) console.log(deckUrl(rest[0]));
} else if (cmd === "sample") {
  const sample = readInput(SAMPLE_FILE);
  const list = await call("GET", "/api/cards-decks");
  if (!list.ok) failResponse(list, "목록");
  const found = (Array.isArray(list.json) ? list.json : []).find((d) => d.title === sample.title);
  if (found) {
    console.log(`샘플 덱이 이미 있다 — ${deckUrl(found.id)}`);
  } else {
    const made = await call("POST", "/api/cards-decks", { title: sample.title, preset: sample.preset });
    if (!made.ok) failResponse(made, "샘플 덱 만들기");
    const id = made.json.deck.id;
    await apply(id, asOp(sample.ops, "샘플 덱"));
    console.log(`샘플 덱을 만들었다 — ${deckUrl(id)}`);
  }
} else {
  fail("사용법: node scripts/studio-cards.mjs <list|create|get|apply|sample> … (맨 위 주석 참고)");
}
