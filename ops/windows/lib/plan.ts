// opsctl 명령 → 실행 단계 목록(순수 함수). 실행기는 단계를 그대로 돌리고, --dry-run 은 단계를 출력만 한다.
// 단계를 데이터로 두어 「어떤 명령이 나가는가」를 단위 테스트로 고정한다.
import { FIREWALL_RULE, layout, PORTS, SERVICES, serviceDef, TAILNET_HOST, type Layout, type ServiceDef, type ServiceName } from "./layout";
import { taskXml } from "./task-xml";

export type Step =
  | { kind: "mkdir"; path: string }
  | { kind: "write-utf16"; path: string; content: string }
  | { kind: "exec"; file: string; args: string[]; cwd?: string; env?: Record<string, string>; allowFail?: boolean }
  | { kind: "flag"; path: string; present: boolean }
  | { kind: "wait-stopped"; service: ServiceName; lockFile: string; taskName: string; timeoutMs: number }
  | { kind: "wait-healthy"; service: ServiceName; url: string; timeoutMs: number };

export interface PlanContext {
  root: string;
  nodeExe: string;
  userId: string;
  revision?: string | null;
  host?: string;
}

const ps = (command: string): Step => ({ kind: "exec", file: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-Command", command] });
const schtasks = (args: string[], allowFail = false): Step => ({ kind: "exec", file: "schtasks.exe", args, allowFail });

export function defs(ctx: PlanContext, only?: ServiceName): ServiceDef[] {
  const l = layout(ctx.root);
  return SERVICES.filter((s) => !only || s === only).map((s) => serviceDef(s, l, { nodeExe: ctx.nodeExe, host: ctx.host ?? TAILNET_HOST, revision: ctx.revision ?? null }));
}

export function firewallSteps(host: string = TAILNET_HOST): Step[] {
  const name = `'${FIREWALL_RULE}'`;
  return [
    ps(`Get-NetFirewallRule -DisplayName ${name} -ErrorAction SilentlyContinue | Remove-NetFirewallRule`),
    ps(
      `New-NetFirewallRule -DisplayName ${name} -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${PORTS.dashboard},${PORTS.worker} -LocalAddress ${host} -RemoteAddress 100.64.0.0/10 -Profile Any | Out-Null`,
    ),
  ];
}

function startSteps(ds: ServiceDef[]): Step[] {
  return ds.flatMap((d): Step[] => [{ kind: "flag", path: d.stopFlag, present: false }, schtasks(["/Run", "/TN", d.taskName])]);
}

function stopSteps(ds: ServiceDef[]): Step[] {
  return ds.flatMap((d): Step[] => [
    { kind: "flag", path: d.stopFlag, present: true },
    { kind: "wait-stopped", service: d.name, lockFile: d.lockFile, taskName: d.taskName, timeoutMs: 30_000 },
  ]);
}

const healthSteps = (ds: ServiceDef[]): Step[] => ds.map((d) => ({ kind: "wait-healthy", service: d.name, url: d.healthUrl, timeoutMs: 90_000 }));

export function installPlan(ctx: PlanContext): Step[] {
  const l: Layout = layout(ctx.root);
  const ds = defs(ctx);
  return [
    ...[l.data, l.backups, l.logs, l.run].map((path): Step => ({ kind: "mkdir", path })),
    ...ds.flatMap((d): Step[] => {
      const xml = `${l.run}\\${d.name}.task.xml`;
      return [
        { kind: "write-utf16", path: xml, content: taskXml(d, { userId: ctx.userId, nodeExe: ctx.nodeExe, appDir: l.app, root: ctx.root }) },
        schtasks(["/Create", "/TN", d.taskName, "/XML", xml, "/F"]),
      ];
    }),
    ...firewallSteps(ctx.host),
    ...startSteps(ds),
    ...healthSteps(ds),
  ];
}

export function uninstallPlan(ctx: PlanContext): Step[] {
  const ds = defs(ctx);
  return [
    ...stopSteps(ds),
    ...ds.map((d) => schtasks(["/Delete", "/TN", d.taskName, "/F"], true)),
    ps(`Get-NetFirewallRule -DisplayName '${FIREWALL_RULE}' -ErrorAction SilentlyContinue | Remove-NetFirewallRule`),
    // 데이터(DB·백업·로그)는 남긴다 — 지우는 단계는 두지 않는다
  ];
}

export const startPlan = (ctx: PlanContext, only?: ServiceName): Step[] => [...startSteps(defs(ctx, only)), ...healthSteps(defs(ctx, only))];
export const stopPlan = (ctx: PlanContext, only?: ServiceName): Step[] => stopSteps(defs(ctx, only));
export const restartPlan = (ctx: PlanContext, only?: ServiceName): Step[] => [...stopPlan(ctx, only), ...startPlan(ctx, only)];

/** 워커의 운영 명령(ops-cli)을 워커와 같은 환경변수로 부른다 */
export function workerCliStep(ctx: PlanContext, args: string[]): Step {
  const w = defs(ctx, "worker")[0]!;
  return { kind: "exec", file: ctx.nodeExe, args: ["--import", "tsx", "src/ops-cli.ts", ...args], cwd: w.cwd, env: w.env };
}

/** 복원: 두 서비스를 멈추고 → 복원 → 다시 켠다(DB 를 쥔 프로세스가 없을 때만 파일을 바꾼다) */
export function restorePlan(ctx: PlanContext, file: string): Step[] {
  return [...stopPlan(ctx), workerCliStep(ctx, ["restore", file, "--yes"]), ...startPlan(ctx)];
}

export function describeStep(s: Step): string {
  switch (s.kind) {
    case "mkdir":
      return `mkdir ${s.path}`;
    case "write-utf16":
      return `write ${s.path} (UTF-16LE, ${s.content.length} chars)`;
    case "exec":
      return `${s.cwd ? `[cwd ${s.cwd}] ` : ""}${s.env ? `[env ${Object.keys(s.env).join(",")}] ` : ""}${s.file} ${s.args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ")}${s.allowFail ? "  (실패 허용)" : ""}`;
    case "flag":
      return `${s.present ? "create" : "remove"} stop flag ${s.path}`;
    case "wait-stopped":
      return `wait ${s.service} supervisor exit (${s.lockFile}, ≤${s.timeoutMs / 1000}s, then schtasks /End ${s.taskName})`;
    case "wait-healthy":
      return `wait ${s.service} healthy ${s.url} (≤${s.timeoutMs / 1000}s)`;
  }
}
