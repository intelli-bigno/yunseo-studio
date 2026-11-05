// 운영 제어 — Windows(windows-desktop)에서 실행한다. 모든 변경 명령은 --dry-run 으로 단계만 볼 수 있다.
//   node --import tsx ops/windows/opsctl.ts <명령> [--root D:\Services\yunseo-studio] [--dry-run]
//   preflight               설치 전 점검(읽기만)
//   install | uninstall     작업 스케줄러 작업·방화벽 규칙 등록/제거(데이터는 남김) — 관리자 셸 필요
//   start | stop | restart [dashboard|worker]
//   status                  작업·감시 프로세스·헬스
//   backup-now | list-backups | restore <파일>
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { hostname, networkInterfaces, userInfo } from "node:os";
import { win32 } from "node:path";
import { DEFAULT_ROOT, layout, PORTS, SERVICES, TAILNET_HOST, type ServiceName } from "./lib/layout";
import { defs, describeStep, installPlan, restartPlan, restorePlan, startPlan, stopPlan, uninstallPlan, workerCliStep, type PlanContext, type Step } from "./lib/plan";
import { hostPresent, lockOwner, pidAlive } from "./lib/supervisor-core";
import { utf16leWithBom } from "./lib/task-xml";

const argv = process.argv.slice(2);
const cmd = argv[0] ?? "";
const dry = argv.includes("--dry-run");
const opt = (k: string) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const positional = argv.slice(1).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--root");
const only = SERVICES.includes(positional[0] as ServiceName) ? (positional[0] as ServiceName) : undefined;

const ctx: PlanContext = { root: opt("--root") ?? DEFAULT_ROOT, nodeExe: process.execPath, userId: `${hostname()}\\${userInfo().username}` };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function healthy(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.ok && ((await res.json()) as { status?: string }).status === "ok";
  } catch {
    return false;
  }
}

async function runStep(s: Step): Promise<void> {
  switch (s.kind) {
    case "mkdir":
      mkdirSync(s.path, { recursive: true });
      return;
    case "write-utf16":
      writeFileSync(s.path, utf16leWithBom(s.content));
      return;
    case "flag":
      if (s.present) writeFileSync(s.path, new Date().toISOString());
      else if (existsSync(s.path)) unlinkSync(s.path);
      return;
    case "exec":
      try {
        execFileSync(s.file, s.args, { cwd: s.cwd, env: s.env ? { ...process.env, ...s.env } : process.env, stdio: "inherit" });
      } catch (e) {
        if (!s.allowFail) throw e;
      }
      return;
    case "wait-stopped": {
      const until = Date.now() + s.timeoutMs;
      while (Date.now() < until) {
        const pid = lockOwner(s.lockFile);
        if (pid === null || !pidAlive(pid)) return;
        await sleep(1000);
      }
      console.log(`  ${s.service}: 감시 프로세스가 제때 끝나지 않아 작업을 강제 종료한다`);
      execFileSync("schtasks.exe", ["/End", "/TN", s.taskName], { stdio: "inherit" });
      return;
    }
    case "wait-healthy": {
      const until = Date.now() + s.timeoutMs;
      while (Date.now() < until) {
        if (await healthy(s.url)) return;
        await sleep(2000);
      }
      throw new Error(`${s.service} 가 ${s.timeoutMs / 1000}초 안에 응답하지 않았다: ${s.url} — 로그를 본다`);
    }
  }
}

async function execute(steps: Step[]): Promise<void> {
  for (const [i, s] of steps.entries()) {
    console.log(`${dry ? "[dry-run] " : ""}${String(i + 1).padStart(2)}. ${describeStep(s)}`);
    if (!dry) await runStep(s);
  }
}

function portState(host: string, port: number): Promise<"listening" | "free"> {
  return new Promise((resolve) => {
    const sock = createConnection({ host, port, timeout: 1500 });
    sock.once("connect", () => (sock.destroy(), resolve("listening")));
    sock.once("error", () => resolve("free"));
    sock.once("timeout", () => (sock.destroy(), resolve("free")));
  });
}

function sh(file: string, args: string[]): { ok: boolean; out: string } {
  try {
    return { ok: true, out: execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    return { ok: false, out: String((e as { stdout?: string }).stdout ?? "") };
  }
}

async function preflight(): Promise<number> {
  const l = layout(ctx.root);
  const rows: [string, "ok" | "warn" | "fail", string][] = [];
  const add = (n: string, s: "ok" | "warn" | "fail", d: string) => rows.push([n, s, d]);
  add("platform", process.platform === "win32" ? "ok" : "fail", `${process.platform} ${process.arch}`);
  const [maj, min] = process.versions.node.split(".").map(Number) as [number, number];
  add("node", maj > 22 || (maj === 22 && min >= 13) ? "ok" : "fail", `${process.version} ${process.execPath}`);
  add("account", "ok", ctx.userId);
  const admin = sh("net.exe", ["session"]).ok;
  add("admin", admin ? "ok" : "warn", admin ? "관리자 셸" : "관리자 아님 — install/uninstall(S4U 작업 등록)은 관리자 셸 필요");
  add("tailnet-ip", hostPresent(TAILNET_HOST, networkInterfaces()) ? "ok" : "fail", TAILNET_HOST);
  for (const [svc, port] of Object.entries(PORTS)) {
    const st = await portState(TAILNET_HOST, port);
    add(`port ${port}`, st === "free" ? "ok" : "warn", st === "free" ? `${svc} 용 비어 있음` : `이미 듣는 중 — ${svc} 가 이미 떠 있는지 status 로 확인`);
  }
  add("root-drive", existsSync(win32.parse(ctx.root).root) ? "ok" : "fail", win32.parse(ctx.root).root);
  const check = (n: string, ok: boolean, yes: string, no: string) => add(n, ok ? "ok" : "warn", ok ? yes : no);
  check("checkout", existsSync(win32.join(l.app, ".git")), l.app, `${l.app} 없음 — deploy.sh --first-time 이 만든다`);
  check("node_modules", existsSync(win32.join(l.app, "node_modules", "tsx")), "설치됨", "없음 — pnpm install --frozen-lockfile");
  check("dashboard-build", existsSync(win32.join(l.app, "apps", "dashboard", ".next", "BUILD_ID")), "빌드 있음", "없음 — pnpm --filter @yunseo/app-dashboard run build");
  check("db", existsSync(l.db), l.db, `${l.db} 없음 — 대시보드가 처음 열 때 시안 데이터로 만든다`);
  for (const d of defs(ctx)) {
    const q = sh("schtasks.exe", ["/Query", "/TN", d.taskName]);
    add(`task ${d.name}`, "ok", q.ok ? `등록됨 ${d.taskName}` : `미등록 ${d.taskName}`);
  }
  for (const [n, s, d] of rows) console.log(`${s.padEnd(4)} ${n.padEnd(16)} ${d}`);
  return rows.some((r) => r[1] === "fail") ? 1 : 0;
}

async function status(): Promise<number> {
  let bad = 0;
  for (const d of defs(ctx, only)) {
    const pid = lockOwner(d.lockFile);
    const sup = pid !== null && pidAlive(pid) ? `감시 pid ${pid}` : "감시 없음";
    const stopped = existsSync(d.stopFlag) ? " · 중지 표식 있음" : "";
    const ok = await healthy(d.healthUrl);
    if (!ok) bad++;
    console.log(`${d.name.padEnd(9)} ${ok ? "healthy" : "DOWN   "} ${d.healthUrl} · ${sup}${stopped} · task ${sh("schtasks.exe", ["/Query", "/TN", d.taskName]).ok ? "등록됨" : "미등록"}`);
  }
  return bad ? 1 : 0;
}

/** 2026-11-05 은퇴 — 상주는 WSL Docker(ops/docker). 등록·시작은 YUNSEO_ALLOW_NATIVE=1 일 때만(데이터가 두 곳으로 갈라지지 않게) */
const RETIRED = ["install", "start", "restart"];

async function main(): Promise<number> {
  if (RETIRED.includes(cmd) && !dry && process.env.YUNSEO_ALLOW_NATIVE !== "1") {
    console.error("네이티브 상주는 은퇴했다 — ops/docker/ctl.sh 를 쓴다(되살리려면 YUNSEO_ALLOW_NATIVE=1).");
    return 3;
  }
  switch (cmd) {
    case "preflight":
      return preflight();
    case "status":
      return status();
    case "install":
      await execute(installPlan(ctx));
      return 0;
    case "uninstall":
      await execute(uninstallPlan(ctx));
      return 0;
    case "start":
      await execute(startPlan(ctx, only));
      return 0;
    case "stop":
      await execute(stopPlan(ctx, only));
      return 0;
    case "restart":
      await execute(restartPlan(ctx, only));
      return 0;
    case "backup-now":
    case "list-backups":
      await execute([workerCliStep(ctx, [cmd])]);
      return 0;
    case "restore":
      if (!positional[0]) throw new Error("restore <백업 파일 이름>");
      await execute(restorePlan(ctx, positional[0]));
      return 0;
    default:
      console.log("usage: opsctl.ts <preflight|install|uninstall|start|stop|restart|status|backup-now|list-backups|restore <file>> [dashboard|worker] [--root DIR] [--dry-run]");
      return 64;
  }
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
