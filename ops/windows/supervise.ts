// 감시 프로세스 — 작업 스케줄러가 서비스마다 하나 띄운다(lib/task-xml.ts). 자식(대시보드·워커)을 띄우고,
// 출력은 회전 로그로 받고, 죽으면 1·2·4…60초 간격으로 다시 띄운다. 중지 표식(run/<svc>.stop)이 생기면 자식을 끄고 나간다.
//   node --import tsx ops/windows/supervise.ts <dashboard|worker> [--root D:\Services\yunseo-studio] [--dry-run]
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { DEFAULT_ROOT, layout, SERVICES, serviceDef, type ServiceName } from "./lib/layout";
import { RotatingLog } from "./lib/rotating-log";
import { acquireLock, backoffMs, hostPresent, releaseLock, STABLE_MS } from "./lib/supervisor-core";

const argv = process.argv.slice(2);
const name = argv[0] as ServiceName;
const opt = (k: string) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
if (!SERVICES.includes(name)) {
  console.error(`usage: supervise.ts <${SERVICES.join("|")}> [--root DIR] [--dry-run]`);
  process.exit(64);
}
const root = opt("--root") ?? DEFAULT_ROOT;
const l = layout(root);

function revision(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: l.app, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

const def = serviceDef(name, l, { nodeExe: process.execPath, revision: revision() });

if (argv.includes("--dry-run")) {
  console.log(JSON.stringify({ ...def, hostPresent: hostPresent(def.host, networkInterfaces()), stopFlag: existsSync(def.stopFlag) }, null, 2));
  process.exit(0);
}

if (existsSync(def.stopFlag)) process.exit(0); // 운영자가 멈춰 둔 서비스 — 반복 트리거가 다시 띄우지 않는다
mkdirSync(l.run, { recursive: true });
if (!acquireLock(def.lockFile, process.pid)) process.exit(0); // 이미 감시 중

const log = new RotatingLog(def.logFile);
const say = (m: string) => log.line(`[supervisor] ${m}`);
let child: ChildProcess | null = null;
let stopping = false;
let failures = 0;
let restartTimer: ReturnType<typeof setTimeout> | null = null;

function killTree(pid: number) {
  try {
    if (process.platform === "win32") execFileSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(pid, "SIGTERM");
  } catch {
    // 이미 끝남
  }
}

function shutdown(reason: string) {
  if (stopping) return;
  stopping = true;
  say(`중지(${reason})`);
  if (restartTimer) clearTimeout(restartTimer);
  clearInterval(flagWatch);
  if (child?.pid && child.exitCode === null) killTree(child.pid);
  releaseLock(def.lockFile, process.pid);
  log.close();
  process.exit(0);
}

function launch() {
  restartTimer = null;
  if (stopping) return;
  if (!hostPresent(def.host, networkInterfaces())) {
    say(`바인드 주소 ${def.host} 가 아직 없다(Tailscale 기동 대기) — 5초 뒤 다시 확인`);
    restartTimer = setTimeout(launch, 5000);
    return;
  }
  const startedAt = Date.now();
  say(`시작: ${def.command} ${def.args.join(" ")} (cwd ${def.cwd}, revision ${def.env.YUNSEO_REVISION ?? "-"})`);
  child = spawn(def.command, def.args, { cwd: def.cwd, env: { ...process.env, ...def.env }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  child.stdout?.on("data", (b: Buffer) => log.write(b));
  child.stderr?.on("data", (b: Buffer) => log.write(b));
  child.on("error", (e) => say(`실행 실패: ${e.message}`));
  child.on("exit", (code, signal) => {
    child = null;
    if (stopping) return;
    failures = Date.now() - startedAt >= STABLE_MS ? 1 : failures + 1;
    const wait = backoffMs(failures);
    say(`종료(code ${code ?? "-"}, signal ${signal ?? "-"}) — ${wait / 1000}초 뒤 재시작(연속 ${failures})`);
    restartTimer = setTimeout(launch, wait);
  });
}

const flagWatch = setInterval(() => {
  if (existsSync(def.stopFlag)) shutdown("중지 표식");
}, 2000);
for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK"] as const) process.on(sig, () => shutdown(sig));
say(`감시 시작 pid ${process.pid}, 로그 ${def.logFile}`);
launch();
