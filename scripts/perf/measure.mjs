// 대시보드 성능 측정 하니스 — `next start` 를 띄워 화면별 초기 전송량·서버 응답 시간·메모리를 잰다.
// 브라우저를 쓰지 않는다(Lighthouse·Web Vitals 는 미측정). 전후 비교는 같은 스크립트·같은 경로 목록으로만 한다.
//   node scripts/perf/measure.mjs --label before --out perf-before.json [--port 3917]
// 사전 조건: `pnpm --filter @yunseo/app-dashboard run build` 완료.
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { gzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const label = arg("label", "run");
const out = arg("out", `perf-${label}.json`);
const dump = arg("dump", "");
const port = Number(arg("port", "3917"));
const appDir = resolve(arg("app", "apps/dashboard"));
const base = `http://127.0.0.1:${port}`;
const VIEWPORT = 1440; // 가정 화면 폭(px, DPR 1) — srcset 후보 선택에 쓴다
const USED_WEIGHTS = new Set([400, 500, 600]); // 토큰(type)이 쓰는 서체 굵기

export const ROUTES = [
  "/",
  "/schedule",
  "/schedule?view=month",
  "/content",
  "/content/P-1104?tab=write",
  "/content/P-1104?tab=sources",
  "/content/P-1104?tab=preview",
  "/content/P-1104?tab=review",
  "/publish",
];

const gz = (buf) => gzipSync(buf, { level: 6 }).length;
const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((xs.length * p) / 100))];
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

async function get(path, accept = "*/*") {
  const t0 = performance.now();
  const res = await fetch(base + path, { headers: { accept, "accept-encoding": "gzip" }, redirect: "manual" });
  const reader = res.body.getReader();
  const chunks = [];
  let ttfb = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (ttfb === null) ttfb = performance.now() - t0;
    if (done) break;
    chunks.push(value);
  }
  const body = Buffer.concat(chunks);
  return { status: res.status, headers: res.headers, body, ttfb, total: performance.now() - t0 };
}

// ── 서체: CSS @font-face 의 unicode-range 가 이 화면의 글자와 겹치는 것만 센다(브라우저 동작 근사) ──
function parseRange(spec) {
  return spec.split(",").map((s) => {
    const m = /U\+([0-9A-Fa-f?]+)(?:-([0-9A-Fa-f]+))?/i.exec(s.trim());
    if (!m) return null;
    if (m[1].includes("?")) return [parseInt(m[1].replace(/\?/g, "0"), 16), parseInt(m[1].replace(/\?/g, "F"), 16)];
    return [parseInt(m[1], 16), parseInt(m[2] ?? m[1], 16)];
  }).filter(Boolean);
}
function neededFonts(css, text) {
  const cps = new Set([...text].map((c) => c.codePointAt(0)));
  const urls = [];
  urls.faces = 0;
  for (const m of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
    urls.faces += 1;
    const block = m[1];
    const weight = Number(/font-weight:\s*(\d+)/.exec(block)?.[1] ?? 400);
    const url = /url\(([^)]+)\)/.exec(block)?.[1]?.replace(/["']/g, "");
    const range = /unicode-range:\s*([^;]+)/.exec(block)?.[1];
    if (!url || !USED_WEIGHTS.has(weight)) continue;
    const ranges = range ? parseRange(range) : [[0, 0x10ffff]];
    if (ranges.some(([a, b]) => [...cps].some((c) => c >= a && c <= b))) urls.push(url);
  }
  return urls;
}

// sizes 속성을 가정 화면 폭(VIEWPORT)으로 풀어 그릴 폭(px)을 구한다: 앞에서부터 조건이 맞는 첫 항목
function slotWidth(sizes) {
  for (const entry of (sizes ?? "100vw").split(",").map((e) => e.trim())) {
    const cond = /^\((min|max)-width:\s*([\d.]+)px\)\s+(.+)$/.exec(entry);
    if (cond && (cond[1] === "min" ? VIEWPORT < Number(cond[2]) : VIEWPORT > Number(cond[2]))) continue;
    const size = cond ? cond[3] : entry;
    const vw = /^([\d.]+)vw$/.exec(size);
    return vw ? (Number(vw[1]) / 100) * VIEWPORT : Number(/^([\d.]+)px$/.exec(size)?.[1] ?? VIEWPORT);
  }
  return VIEWPORT;
}

function pickSrcset(srcset, sizes) {
  const cands = srcset.split(",").map((s) => s.trim().split(/\s+/)).map(([url, d]) => ({ url, w: /w$/.test(d ?? "") ? Number(d.slice(0, -1)) : 0, x: /x$/.test(d ?? "") ? Number(d.slice(0, -1)) : 0 }));
  if (cands.every((c) => c.x)) return (cands.find((c) => c.x === 1) ?? cands[0]).url; // 1x 화면
  const px = slotWidth(sizes);
  return (cands.filter((c) => c.w >= px).sort((a, b) => a.w - b.w)[0] ?? cands.sort((a, b) => b.w - a.w)[0]).url;
}

function assetsOf(html) {
  const urls = new Map(); // url → kind
  const add = (u, kind) => u && !u.startsWith("data:") && !urls.has(u) && urls.set(u.replace(/&amp;/g, "&"), kind);
  for (const m of html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"[^>]*>/g)) if (!/\snomodule\b/i.test(m[0])) add(m[1], "js"); // nomodule 폴리필은 현대 브라우저가 받지 않는다
  for (const m of html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)) add(m[1], "css");
  for (const m of html.matchAll(/<link[^>]*rel="preload"[^>]*>/g)) {
    const href = /href="([^"]+)"/.exec(m[0])?.[1];
    const as = /as="([^"]+)"/.exec(m[0])?.[1];
    if (as === "font") add(href, "font");
    else if (as === "image") {
      const set = /imagesrcset="([^"]+)"/.exec(m[0])?.[1];
      add(set ? pickSrcset(set, /imagesizes="([^"]+)"/.exec(m[0])?.[1]) : href, "image");
    }
  }
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    const tag = m[0];
    const set = /srcset="([^"]+)"/.exec(tag)?.[1];
    const src = /\ssrc="([^"]+)"/.exec(tag)?.[1];
    add(set ? pickSrcset(set, /sizes="([^"]+)"/.exec(tag)?.[1]) : src, "image");
  }
  for (const m of html.matchAll(/url\((\/[^)]+)\)/g)) add(m[1], "image"); // 인라인 배경
  return urls;
}

async function measureRoute(route) {
  const first = await get(route, "text/html");
  const html = first.body.toString("utf8");
  if (dump) { mkdirSync(dump, { recursive: true }); writeFileSync(join(dump, `${route.replace(/[^a-z0-9]+/gi, "_")}.html`), html); }
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ");
  const row = { status: first.status, cache: first.headers.get("x-nextjs-cache"), cacheControl: first.headers.get("cache-control"), html: { raw: first.body.length, gzip: gz(first.body) }, js: { n: 0, raw: 0, gzip: 0 }, css: { n: 0, raw: 0, gzip: 0 }, font: { n: 0, bytes: 0 }, image: { n: 0, bytes: 0 } };
  // HTML 안 구성 — 인라인 스크립트(RSC 페이로드)·스타일·링크 태그. 전후 비교에서 HTML 이 달라진 이유를 찾는 데 쓴다
  row.html.inlineScript = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].reduce((n, m) => n + Buffer.byteLength(m[1]), 0);
  row.html.inlineStyle = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].reduce((n, m) => n + Buffer.byteLength(m[1]), 0);
  row.html.links = (html.match(/<link\b[^>]*>/g) ?? []).length;
  const urls = assetsOf(html);
  let cssAll = "";
  // 미리보기 탭: 서버 HTML 에 카드 주소가 없으면(구) 브라우저가 /api/cards 를 받아 이미지를 이어 요청한다 — 같은 요청을 흉내 낸다
  if (route.includes("tab=preview") && !html.includes("/api/cards/") && !html.includes("%2Fapi%2Fcards%2F")) {
    const set = await get("/api/cards");
    if (set.status === 200) for (const n of JSON.parse(set.body.toString("utf8")).names) urls.set(`/api/cards/${n}`, "image");
  }
  row.js.files = [];
  for (const [u, kind] of urls) {
    const r = await get(u, kind === "image" ? "image/avif,image/webp,image/*,*/*" : "*/*");
    if (r.status !== 200) continue;
    if (kind === "js" || kind === "css") {
      row[kind].n += 1; row[kind].raw += r.body.length; row[kind].gzip += gz(r.body);
      if (kind === "js") row.js.files.push({ url: u.split("/").pop(), gzip: gz(r.body) });
      if (kind === "css") cssAll += r.body.toString("utf8");
    } else if (kind !== "font") {
      row[kind].n += 1; row[kind].bytes += r.body.length;
      if (kind === "image") { row.image.types = [...new Set([...(row.image.types ?? []), r.headers.get("content-type")])]; row.image.slowestMs = Math.max(row.image.slowestMs ?? 0, round(r.total)); }
    }
  }
  // 서체 = (미리 받기로 선언된 파일) ∪ (이 화면 글자가 걸리는 조각) — 미리 받기가 과하면 여기서 바로 드러난다
  const preloaded = [...urls].filter(([, k]) => k === "font").map(([u]) => u);
  const needed = neededFonts(cssAll, text);
  row.font.faces = needed.faces;
  row.font.preloaded = preloaded.length;
  for (const u of new Set([...preloaded, ...needed])) {
    const r = await get(u.startsWith("http") ? new URL(u).pathname : u);
    if (r.status === 200) { row.font.n += 1; row.font.bytes += r.body.length; }
  }
  row.initialTransfer = row.html.gzip + row.js.gzip + row.css.gzip + row.font.bytes + row.image.bytes;
  const times = [], ttfbs = [];
  for (let i = 0; i < 3; i++) await get(route, "text/html"); // 워밍업
  for (let i = 0; i < 30; i++) { const r = await get(route, "text/html"); times.push(r.total); ttfbs.push(r.ttfb); }
  row.latencyMs = { p50: round(pct(times, 50)), p95: round(pct(times, 95)), ttfbP50: round(pct(ttfbs, 50)) };
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
  const sums = { js: 0, css: 0, media: 0, jsFiles: 0 };
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else { const s = statSync(p).size; const x = extname(p); if (x === ".js") { sums.js += s; sums.jsFiles += 1; } else if (x === ".css") sums.css += s; else sums.media += s; } } };
  if (existsSync(dir)) walk(dir);
  return sums;
}

// 응답 정책 확인 — 신규 엔드포인트가 약속한 헤더·상태를 실제로 내는가(구 하니스에서는 해당 없음 = null)
async function extraChecks() {
  const out = {};
  const card = await get("/api/cards/a-01");
  const etag = card.headers.get("etag");
  out.cardImage = { status: card.status, etag: !!etag, cacheControl: card.headers.get("cache-control") };
  if (etag) {
    const res = await fetch(`${base}/api/cards/a-01`, { headers: { "if-none-match": etag } });
    out.cardImage.conditional = res.status;
  }
  const palette = await get("/api/palette");
  out.palette = palette.status === 200 ? { status: 200, entries: JSON.parse(palette.body.toString("utf8")).length, cacheControl: palette.headers.get("cache-control") } : { status: palette.status };
  const hero = await get("/img/hero.jpg");
  out.originalHero = { bytes: hero.body.length };
  return out;
}

const req = createRequire(join(appDir, "package.json"));
const nextBin = req.resolve("next/dist/bin/next");
const server = spawn(process.execPath, [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"], { cwd: appDir, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NODE_ENV: "production" } });
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
  const rssIdle = descendantsRssKb(server.pid);
  const routes = {};
  for (const r of ROUTES) routes[r] = await measureRoute(r);
  const rssRoutes = descendantsRssKb(server.pid);
  for (let i = 0; i < 100; i++) for (const r of ROUTES) await get(r, "text/html"); // 부하 뒤 메모리
  const rssAfter = descendantsRssKb(server.pid);
  for (let i = 0; i < 100; i++) for (const r of ROUTES) await get(r, "text/html"); // 한 번 더 — 두 번째 뒤에도 같은 수준이면 누수가 아니라 GC 여유다
  const rssAfter2 = descendantsRssKb(server.pid);
  const result = { label, at: new Date().toISOString(), node: process.version, staticBuild: staticBuild(), rssKb: { idle: rssIdle, afterRoutes: rssRoutes, afterLoad: rssAfter, afterLoad2: rssAfter2 }, checks: await extraChecks(), routes };
  writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(`\n| 경로 | HTML gz | JS gz (n) | CSS gz | 서체 | 이미지 | 초기 전송 | p50 ms | p95 ms | cache |`);
  console.log(`|---|---|---|---|---|---|---|---|---|---|`);
  const kb = (n) => `${round(n / 1024)}KB`;
  for (const [r, v] of Object.entries(routes)) console.log(`| ${r} | ${kb(v.html.gzip)} | ${kb(v.js.gzip)} (${v.js.n}) | ${kb(v.css.gzip)} | ${kb(v.font.bytes)} (${v.font.n}) | ${kb(v.image.bytes)} (${v.image.n}) | **${kb(v.initialTransfer)}** | ${v.latencyMs.p50} | ${v.latencyMs.p95} | ${v.cache ?? "-"} |`);
  const mb = (v) => (v === null ? "미측정" : `${Math.round(v / 1024)}MB`);
  console.log(`\nstatic: js ${kb(result.staticBuild.js)} (${result.staticBuild.jsFiles}개) · css ${kb(result.staticBuild.css)} · media ${kb(result.staticBuild.media)} · RSS idle ${mb(rssIdle)} → 경로 1회전 ${mb(rssRoutes)} → 부하 900회 ${mb(rssAfter)} → 1800회 ${mb(rssAfter2)}`);
  console.log(`checks: ${JSON.stringify(result.checks)}`);
} finally {
  stop();
}
