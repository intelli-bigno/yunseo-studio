// /cards·/references·API 성능 측정 하니스 — `next start` 를 임시 DB·작업 폴더(시드)로 띄워 서버 쪽 값을 잰다.
// 브라우저 값(LCP·CLS·실제 이미지 전송량)은 Aside 에서 scripts/perf/browser-metrics.js 로 잰다(docs/09-performance.md §14).
//   node scripts/perf/measure-cards.mjs --label before --out /tmp/perf-cards-before.json [--port 3918]
// 사전 조건: `pnpm --filter @yunseo/app-dashboard run build` 완료. 전후 비교는 같은 스크립트·같은 시드로만 한다.
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync, existsSync, openSync, ftruncateSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, extname } from "node:path";
import { gzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const label = arg("label", "run");
const out = arg("out", `perf-cards-${label}.json`);
const port = Number(arg("port", "3918"));
const serveSeconds = Number(arg("serve", "0")); // >0 이면 측정이 끝난 뒤 같은 서버를 그만큼 더 띄워 둔다(Aside 에서 LCP 를 잴 때, win tunnel <포트>)
const appDir = resolve(arg("app", "apps/dashboard"));
const base = `http://127.0.0.1:${port}`;
const gz = (buf) => gzipSync(buf, { level: 6 }).length;
const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((xs.length * p) / 100))];
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const kb = (n) => round(n / 1024);

// ── 시드: 작업 폴더에 쇼츠 40편 × 렌더 2개(표지 PNG + 릴스 mp4), 그중 하나는 40MB 영상(구간 요청 비용 확인용) ──
const work = mkdtempSync(join(tmpdir(), "ys-perf-work-"));
const dbFile = join(mkdtempSync(join(tmpdir(), "ys-perf-db-")), "studio.db");
const BIG = { pieceId: "P-261101-a000", renderId: "aaaaaa" };
for (let i = 0; i < 40; i++) {
  const pieceId = `P-2611${String(1 + (i % 28)).padStart(2, "0")}-a${String(i).padStart(3, "0")}`;
  for (const renderId of ["aaaaaa", "bbbbbb"]) {
    const dir = join(work, pieceId, renderId);
    mkdirSync(join(dir, "reel"), { recursive: true });
    mkdirSync(join(dir, "cards"), { recursive: true });
    writeFileSync(join(dir, "cards", "01-cover.png"), Buffer.alloc(110 * 1024, 7));
    const mp4 = join(dir, "reel", `${pieceId}-reel.mp4`);
    if (pieceId === BIG.pieceId && renderId === BIG.renderId) {
      const fd = openSync(mp4, "w");
      ftruncateSync(fd, 40 * 1024 * 1024);
      closeSync(fd);
    } else writeFileSync(mp4, Buffer.alloc(64 * 1024, 3));
  }
}

async function get(path, { accept = "*/*", headers = {}, abs = false } = {}) {
  const t0 = performance.now();
  const res = await fetch(abs ? path : base + path, { headers: { accept, "accept-encoding": "gzip", ...headers }, redirect: "manual" });
  const reader = res.body?.getReader(); // 304·204 는 본문이 없다
  const chunks = [];
  let ttfb = null;
  for (;;) {
    const { done, value } = reader ? await reader.read() : { done: true, value: undefined };
    if (ttfb === null) ttfb = performance.now() - t0;
    if (done) break;
    chunks.push(value);
  }
  const body = Buffer.concat(chunks);
  return { status: res.status, headers: res.headers, body, ttfb, total: performance.now() - t0 };
}

async function timed(path, opts, n = 30) {
  for (let i = 0; i < 3; i++) await get(path, opts); // 워밍업
  const times = [];
  for (let i = 0; i < n; i++) times.push((await get(path, opts)).total);
  return { p50: round(pct(times, 50), 2), p95: round(pct(times, 95), 2) };
}

const decode = (s) => s.replace(/&amp;/g, "&");
const imgUrls = (html) => [...html.matchAll(/<img\b[^>]*>/g)].map((m) => {
  const tag = m[0];
  const set = /srcset="([^"]+)"/.exec(tag)?.[1];
  const src = /\ssrc="([^"]+)"/.exec(tag)?.[1];
  const first = set ? set.split(",")[0].trim().split(/\s+/)[0] : src;
  return { url: first ? decode(first) : null, lazy: /loading="lazy"/.test(tag), sized: /\swidth="\d+"/.test(tag) && /\sheight="\d+"/.test(tag), priority: /fetchpriority="high"/i.test(tag) };
}).filter((x) => x.url && !x.url.startsWith("data:"));

async function measurePage(route) {
  const first = await get(route, { accept: "text/html" });
  const html = first.body.toString("utf8");
  const row = { status: first.status, htmlRaw: first.body.length, htmlGzip: gz(first.body), cacheControl: first.headers.get("cache-control") };
  row.rscInline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].reduce((n, m) => n + Buffer.byteLength(m[1]), 0);
  // JS·CSS = 첫 화면에 선언된 것(모듈 스크립트 + 스타일시트), gzip 근사
  const sum = { js: { n: 0, raw: 0, gzip: 0 }, css: { n: 0, raw: 0, gzip: 0 } };
  const jsFiles = [];
  const seen = new Set();
  const add = async (kind, url) => {
    const u = decode(url);
    if (seen.has(u)) return;
    seen.add(u);
    const r = await get(u);
    if (r.status !== 200) return;
    sum[kind].n += 1; sum[kind].raw += r.body.length; sum[kind].gzip += gz(r.body);
    if (kind === "js") jsFiles.push({ file: u.split("/").pop(), gzipKb: kb(gz(r.body)) });
  };
  for (const m of html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"[^>]*>/g)) if (!/\snomodule\b/i.test(m[0])) await add("js", m[1]);
  for (const m of html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)) await add("css", m[1]);
  row.js = { n: sum.js.n, rawKb: kb(sum.js.raw), gzipKb: kb(sum.js.gzip), files: jsFiles.sort((a, b) => b.gzipKb - a.gzipKb) };
  row.css = { n: sum.css.n, gzipKb: kb(sum.css.gzip) };
  // 그림: 태그 수·종류·지연/크기 지정 여부, 앞 12장을 실제로 받아 본다(첫 화면 근사 — 외부 주소는 직접)
  const imgs = imgUrls(html);
  const kind = (u) => (u.startsWith("/_next/image") ? "optimized" : u.startsWith("/api/") ? "api" : u.startsWith("http") ? "external" : "other");
  row.images = { tags: imgs.length, lazy: imgs.filter((i) => i.lazy).length, sized: imgs.filter((i) => i.sized).length, priority: imgs.filter((i) => i.priority).length, kinds: {} };
  for (const i of imgs) row.images.kinds[kind(i.url)] = (row.images.kinds[kind(i.url)] ?? 0) + 1;
  const sample = [];
  for (const i of imgs.slice(0, 12)) {
    const abs = i.url.startsWith("http");
    try {
      const cold = await get(i.url, { accept: "image/webp,image/*,*/*", abs });
      const warm = await get(i.url, { accept: "image/webp,image/*,*/*", abs });
      sample.push({ kind: kind(i.url), status: cold.status, type: cold.headers.get("content-type"), bytes: cold.body.length, coldMs: round(cold.total), warmMs: round(warm.total) });
    } catch (e) {
      sample.push({ kind: kind(i.url), status: 0, error: String(e.message ?? e) });
    }
  }
  row.sample12 = { ok: sample.filter((s) => s.status === 200).length, bytes: sample.reduce((n, s) => n + (s.bytes ?? 0), 0), coldMsSum: round(sample.reduce((n, s) => n + (s.coldMs ?? 0), 0)), warmMsSum: round(sample.reduce((n, s) => n + (s.warmMs ?? 0), 0)), items: sample };
  row.latencyMs = await timed(route, { accept: "text/html" });
  return row;
}

function descendantsRssKb(pid) {
  try {
    const rows = execFileSync("ps", ["-eo", "pid=,ppid=,rss="], { encoding: "utf8" }).trim().split("\n").map((l) => l.trim().split(/\s+/).map(Number));
    const set = new Set([pid]);
    for (let grew = true; grew;) { grew = false; for (const [p, pp] of rows) if (set.has(pp) && !set.has(p)) { set.add(p); grew = true; } }
    return rows.filter(([p]) => set.has(p)).reduce((s, [, , rss]) => s + rss, 0);
  } catch { return null; }
}

function staticBuild() {
  const dir = join(appDir, ".next", "static");
  const sums = { js: 0, css: 0, jsFiles: 0 };
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else { const s = statSync(p).size; const x = extname(p); if (x === ".js") { sums.js += s; sums.jsFiles += 1; } else if (x === ".css") sums.css += s; } } };
  if (existsSync(dir)) walk(dir);
  return sums;
}

const req = createRequire(join(appDir, "package.json"));
const nextBin = req.resolve("next/dist/bin/next");
const server = spawn(process.execPath, [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"], {
  cwd: appDir,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, NODE_ENV: "production", STUDIO_DB: dbFile, STUDIO_WORK_DIR: work },
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
const stop = () => { try { server.kill("SIGTERM"); } catch { /* 이미 종료 */ } };
process.on("exit", stop);

try {
  for (let i = 0; ; i++) {
    try { if ((await get("/api/health")).status === 200) break; } catch { /* 기동 대기 */ }
    if (i > 120) throw new Error(`서버 기동 실패\n${serverLog}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  // 덱 30개 시드 — 새 덱(POST) 뒤 제목만 다른 목록
  const deckIds = [];
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`${base}/api/cards-decks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: `perf 덱 ${i}` }) });
    deckIds.push((await r.json()).deck.id);
  }
  const rssIdle = descendantsRssKb(server.pid);
  const pages = {};
  for (const r of ["/cards", `/cards?deck=${deckIds[0]}`, "/references", "/references?source=pinterest", "/references?pick=ref-001,ref-002,ref-003"]) pages[r] = await measurePage(r);

  // API — 상태·헤더·p50/p95, 조건부 요청(304) 확인
  const api = {};
  const apiCheck = async (name, path, opts = {}) => {
    const r = await get(path, opts);
    const etag = r.headers.get("etag");
    const row = { status: r.status, bytes: r.body.length, type: r.headers.get("content-type"), cacheControl: r.headers.get("cache-control"), etag: !!etag };
    if (etag) row.conditional = (await get(path, { ...opts, headers: { ...(opts.headers ?? {}), "if-none-match": etag } })).status;
    if (r.status === 200 || r.status === 206) row.latencyMs = await timed(path, opts);
    api[name] = row;
  };
  await apiCheck("GET /api/cards-decks (30덱)", "/api/cards-decks");
  await apiCheck("GET /api/cards-decks/:id", `/api/cards-decks/${deckIds[0]}`);
  await apiCheck("GET /api/palette", "/api/palette");
  await apiCheck("GET /api/cards", "/api/cards");
  await apiCheck("GET /api/reels/projects", "/api/reels/projects");
  await apiCheck("GET /api/refs/…/ref-01.jpg", "/api/refs/card-reference/capture/ref-01.jpg");
  await apiCheck("GET /api/reels/…/cover (110KB)", `/api/reels/${BIG.pieceId}/${BIG.renderId}/cover`);
  await apiCheck("GET video 40MB 전체 아님: Range 0-1023", `/api/reels/${BIG.pieceId}/${BIG.renderId}/video`, { headers: { range: "bytes=0-1023" } });
  await apiCheck("GET video 40MB Range 끝 1KB", `/api/reels/${BIG.pieceId}/${BIG.renderId}/video`, { headers: { range: `bytes=${40 * 1024 * 1024 - 1024}-` } });
  // 외부 중계(핀터레스트) — 망 의존. 첫 호출(상류 받기)과 두 번째(서버 캐시 여부)를 따로 본다
  {
    const t0 = performance.now();
    const a = await get("/api/ref-image/ref-001");
    const aMs = performance.now() - t0;
    const b = await get("/api/ref-image/ref-001");
    const etag = b.headers.get("etag");
    api["GET /api/ref-image/:id (외부 중계)"] = { status: a.status, bytes: a.body.length, cacheControl: a.headers.get("cache-control"), etag: !!etag, coldMs: round(aMs), secondMs: round(b.total), conditional: etag ? (await get("/api/ref-image/ref-001", { headers: { "if-none-match": etag } })).status : null };
  }
  // 한 번에 5개 동시(캐시 없으면 상류 5번)
  {
    const t0 = performance.now();
    await Promise.all(["ref-002", "ref-002", "ref-002", "ref-002", "ref-002"].map((id) => get(`/api/ref-image/${id}`)));
    api["GET /api/ref-image/:id ×5 동시(같은 id)"] = { totalMs: round(performance.now() - t0) };
  }

  // 정적 자산 캐시 정책 — 해시 이름 JS 는 immutable 이어야 하고, 고정 이름 /img 는 재검증 가능해야 한다
  const staticHeaders = {};
  {
    const html = (await get("/cards", { accept: "text/html" })).body.toString("utf8");
    const js = /<script[^>]*\ssrc="(\/_next\/static\/[^"]+\.js)"/.exec(html)?.[1];
    const header = async (name, path) => {
      const r = await get(path);
      staticHeaders[name] = { status: r.status, cacheControl: r.headers.get("cache-control"), etag: !!r.headers.get("etag") };
    };
    if (js) await header("/_next/static/*.js", js);
    await header("/img/empty.jpg", "/img/empty.jpg");
    await header("/icon-192.png", "/icon-192.png");
  }
  const rssAfter = descendantsRssKb(server.pid);
  const result = { label, at: new Date().toISOString(), node: process.version, staticBuild: staticBuild(), rssKb: { idle: rssIdle, after: rssAfter }, staticHeaders, pages, api };
  writeFileSync(out, JSON.stringify(result, null, 2));

  console.log(`\n| 경로 | HTML raw/gz KB | RSC 인라인 KB | JS gz KB (n) | CSS gz KB | 그림 태그(lazy/sized/priority) | 앞 12장 KB | p50 ms | p95 ms |`);
  console.log(`|---|---|---|---|---|---|---|---|---|`);
  for (const [r, v] of Object.entries(pages)) console.log(`| ${r} | ${kb(v.htmlRaw)}/${kb(v.htmlGzip)} | ${kb(v.rscInline)} | ${v.js.gzipKb} (${v.js.n}) | ${v.css.gzipKb} | ${v.images.tags} (${v.images.lazy}/${v.images.sized}/${v.images.priority}) ${JSON.stringify(v.images.kinds)} | ${kb(v.sample12.bytes)} (ok ${v.sample12.ok}, cold ${v.sample12.coldMsSum}ms, warm ${v.sample12.warmMsSum}ms) | ${v.latencyMs.p50} | ${v.latencyMs.p95} |`);
  console.log(`\n| API | 상태 | 바이트 | cache-control | etag | 304 | p50 ms | p95 ms |`);
  console.log(`|---|---|---|---|---|---|---|---|`);
  for (const [n, v] of Object.entries(api)) console.log(`| ${n} | ${v.status ?? "-"} | ${v.bytes ?? "-"} | ${v.cacheControl ?? "-"} | ${v.etag ?? "-"} | ${v.conditional ?? "-"} | ${v.latencyMs?.p50 ?? v.coldMs ?? v.totalMs ?? "-"} | ${v.latencyMs?.p95 ?? v.secondMs ?? "-"} |`);
  console.log(`\nstatic headers: ${JSON.stringify(staticHeaders)}`);
  for (const [r, v] of Object.entries(pages).slice(0, 3)) console.log(`${r} JS: ${v.js.files.map((f) => `${f.file}=${f.gzipKb}`).join(" ")}`);
  const mb = (v) => (v === null ? "미측정" : `${Math.round(v / 1024)}MB`);
  console.log(`\nstatic: js ${kb(result.staticBuild.js)}KB (${result.staticBuild.jsFiles}개) · css ${kb(result.staticBuild.css)}KB · RSS idle ${mb(rssIdle)} → 측정 뒤 ${mb(rssAfter)}`);
  if (serveSeconds > 0) {
    console.log(`SERVING http://127.0.0.1:${port} for ${serveSeconds}s (decks ${deckIds.length})`);
    await new Promise((r) => setTimeout(r, serveSeconds * 1000));
  }
} finally {
  stop();
}
