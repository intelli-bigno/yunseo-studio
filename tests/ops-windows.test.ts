// [L6] ops/windows — 명령 생성(설치·중지·복원 단계), 작업 스케줄러 XML, 감시 프로세스 판단, 로그 회전.
// 실제 등록·실행은 Windows 에서 opsctl --dry-run 으로 실측한다(docs/10-operations.md §6).
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { layout, PORTS, serviceDef, TAILNET_HOST } from "../ops/windows/lib/layout";
import { describeStep, firewallSteps, installPlan, restorePlan, stopPlan, uninstallPlan, type PlanContext } from "../ops/windows/lib/plan";
import { RotatingLog } from "../ops/windows/lib/rotating-log";
import { acquireLock, backoffMs, hostPresent, releaseLock } from "../ops/windows/lib/supervisor-core";
import { quoteArg, taskXml, utf16leWithBom } from "../ops/windows/lib/task-xml";

const ctx: PlanContext = { root: "D:\\Services\\yunseo-studio", nodeExe: "C:\\Program Files\\nodejs\\node.exe", userId: "bigno\\yjh99" };
const l = layout(ctx.root);

describe("배치·서비스 정의", () => {
  it("경로는 D:\\Services\\yunseo-studio 아래", () => {
    expect(l).toEqual({
      root: "D:\\Services\\yunseo-studio",
      app: "D:\\Services\\yunseo-studio\\app",
      repo: "D:\\Services\\yunseo-studio\\repo.git",
      data: "D:\\Services\\yunseo-studio\\data",
      db: "D:\\Services\\yunseo-studio\\data\\studio.db",
      backups: "D:\\Services\\yunseo-studio\\data\\backups",
      logs: "D:\\Services\\yunseo-studio\\data\\logs",
      run: "D:\\Services\\yunseo-studio\\run",
    });
  });

  it("대시보드 = next start -H <Tailnet IP> -p 8930, 워커 주소를 환경변수로 안다", () => {
    const d = serviceDef("dashboard", l, { nodeExe: ctx.nodeExe, revision: "abc" });
    expect(d.args).toEqual(["D:\\Services\\yunseo-studio\\app\\apps\\dashboard\\node_modules\\next\\dist\\bin\\next", "start", "-H", "100.84.73.107", "-p", "8930"]);
    expect(d.env).toMatchObject({ STUDIO_DB: l.db, YUNSEO_WORKER_URL: "http://100.84.73.107:8931", NODE_ENV: "production", STUDIO_CLOCK: "system", YUNSEO_REVISION: "abc" });
    expect(d.healthUrl).toBe("http://100.84.73.107:8930/api/health");
    expect(d.taskName).toBe("\\YunseoStudio\\Dashboard");
  });

  it("워커 = tsx 로 src/main.ts, HOST=Tailnet IP·PORT=8931·보존 14", () => {
    const w = serviceDef("worker", l, { nodeExe: ctx.nodeExe });
    expect(w.cwd).toBe("D:\\Services\\yunseo-studio\\app\\apps\\worker");
    expect(w.args).toEqual(["--import", "tsx", "src/main.ts"]);
    expect(w.env).toMatchObject({ HOST: TAILNET_HOST, PORT: "8931", YUNSEO_BACKUP_KEEP: "14", YUNSEO_DATA_DIR: l.data, STUDIO_CLOCK: "system" });
    expect(w.env).not.toHaveProperty("YUNSEO_REVISION");
  });

  it("어떤 서비스도 0.0.0.0 에 바인드하지 않는다", () => {
    for (const s of ["dashboard", "worker"] as const) expect(JSON.stringify(serviceDef(s, l, { nodeExe: "node" }))).not.toMatch(/0\.0\.0\.0|"::"/);
    expect(PORTS).toEqual({ dashboard: 8930, worker: 8931 });
  });
});

describe("작업 스케줄러 XML", () => {
  const xml = taskXml(serviceDef("worker", l, { nodeExe: ctx.nodeExe }), { userId: ctx.userId, nodeExe: ctx.nodeExe, appDir: l.app, root: l.root });

  it("부팅 트리거 + 2분 반복, S4U(로그온 없이·암호 저장 없이), 시간 제한 없음, 중복 실행 무시", () => {
    expect(xml).toContain("<BootTrigger>");
    expect(xml).toContain("<Interval>PT2M</Interval>");
    expect(xml).toContain("<LogonType>S4U</LogonType>");
    expect(xml).toContain("<UserId>bigno\\yjh99</UserId>");
    expect(xml).toContain("<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>");
    expect(xml).toContain("<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>");
    expect(xml).toContain("<RunLevel>LeastPrivilege</RunLevel>");
    expect(xml).not.toMatch(/<Password>/);
  });

  it("실행 명령: node --import tsx <app>\\ops\\windows\\supervise.ts worker --root <root> (공백 경로는 따옴표)", () => {
    expect(xml).toContain("<Command>C:\\Program Files\\nodejs\\node.exe</Command>");
    expect(xml).toContain("<Arguments>--import tsx D:\\Services\\yunseo-studio\\app\\ops\\windows\\supervise.ts worker --root D:\\Services\\yunseo-studio</Arguments>");
    expect(xml).toContain("<WorkingDirectory>D:\\Services\\yunseo-studio\\app</WorkingDirectory>");
    expect(quoteArg("C:\\Program Files\\x")).toBe('"C:\\Program Files\\x"');
  });

  it("XML 특수문자를 이스케이프하고, 파일은 UTF-16LE BOM + CRLF", () => {
    expect(taskXml(serviceDef("worker", l, { nodeExe: "a&b" }), { userId: "u<1>", nodeExe: "a&b", appDir: "C:\\x", root: "C:\\x" })).toContain("<UserId>u&lt;1&gt;</UserId>");
    const buf = utf16leWithBom("a\nb");
    expect([...buf.subarray(0, 2)]).toEqual([0xff, 0xfe]);
    expect(buf.subarray(2).toString("utf16le")).toBe("a\r\nb");
  });
});

describe("opsctl 단계(명령 생성)", () => {
  it("install: 폴더 → XML·schtasks /Create ×2 → 방화벽(Tailnet 대역만) → 시작 → 헬스 대기", () => {
    const lines = installPlan(ctx).map(describeStep);
    expect(lines.slice(0, 4)).toEqual([`mkdir ${l.data}`, `mkdir ${l.backups}`, `mkdir ${l.logs}`, `mkdir ${l.run}`]);
    expect(lines).toContain(`schtasks.exe /Create /TN \\YunseoStudio\\Dashboard /XML ${l.run}\\dashboard.task.xml /F`);
    expect(lines).toContain(`schtasks.exe /Create /TN \\YunseoStudio\\Worker /XML ${l.run}\\worker.task.xml /F`);
    expect(lines).toContain(`schtasks.exe /Run /TN \\YunseoStudio\\Worker`);
    expect(lines.at(-1)).toBe("wait worker healthy http://100.84.73.107:8931/health (≤90s)");
  });

  it("방화벽 규칙은 8930·8931, 로컬 주소 = Tailnet IP, 원격 = 100.64.0.0/10 만", () => {
    const cmd = (firewallSteps()[1] as { args: string[] }).args.at(-1)!;
    expect(cmd).toContain("-LocalPort 8930,8931");
    expect(cmd).toContain("-LocalAddress 100.84.73.107");
    expect(cmd).toContain("-RemoteAddress 100.64.0.0/10");
    expect(cmd).toContain("-Direction Inbound");
  });

  it("stop: 중지 표식을 만든 뒤 감시 프로세스가 끝나길 기다린다(반복 트리거가 다시 띄우지 않게)", () => {
    expect(stopPlan(ctx, "worker").map((s) => s.kind)).toEqual(["flag", "wait-stopped"]);
    expect(stopPlan(ctx, "worker")[0]).toEqual({ kind: "flag", path: `${l.run}\\worker.stop`, present: true });
  });

  it("uninstall: 작업·방화벽 규칙만 지우고 데이터 폴더는 건드리지 않는다", () => {
    const lines = uninstallPlan(ctx).map(describeStep).join("\n");
    expect(lines).toContain("schtasks.exe /Delete /TN \\YunseoStudio\\Dashboard /F");
    expect(lines).toContain("Remove-NetFirewallRule");
    expect(lines).not.toMatch(/Remove-Item|rmdir|del |rm /);
  });

  it("restore: 두 서비스 중지 → ops-cli restore --yes(워커 환경) → 다시 시작", () => {
    const steps = restorePlan(ctx, "studio-20261105-033000.db");
    const i = steps.findIndex((s) => s.kind === "exec");
    expect(steps.slice(0, i).filter((s) => s.kind === "wait-stopped")).toHaveLength(2);
    expect(steps[i]).toMatchObject({ args: ["--import", "tsx", "src/ops-cli.ts", "restore", "studio-20261105-033000.db", "--yes"], cwd: `${l.app}\\apps\\worker`, env: { STUDIO_DB: l.db } });
    expect(steps.slice(i + 1).map((s) => s.kind)).toContain("wait-healthy");
  });
});

describe("감시 프로세스 판단", () => {
  it("재시작 간격 1·2·4…초, 최대 60초", () => {
    expect([1, 2, 3, 6, 7, 20].map(backoffMs)).toEqual([1000, 2000, 4000, 32000, 60000, 60000]);
  });

  it("바인드 주소가 인터페이스에 있어야 띄운다(부팅 직후 Tailscale 대기)", () => {
    const ifs = { Tailscale: [{ address: "100.84.73.107", family: "IPv4" }] } as unknown as NodeJS.Dict<import("node:os").NetworkInterfaceInfo[]>;
    expect(hostPresent("100.84.73.107", ifs)).toBe(true);
    expect(hostPresent("100.84.73.107", {})).toBe(false);
    expect(hostPresent("127.0.0.1", {})).toBe(true);
  });

  it("잠금: 살아 있는 주인이 있으면 실패, 죽은 주인의 잠금은 넘겨받는다", () => {
    const d = mkdtempSync(join(tmpdir(), "yunseo-lock-"));
    const f = join(d, "worker.lock");
    expect(acquireLock(f, 100, () => true)).toBe(true);
    expect(acquireLock(f, 200, () => true)).toBe(false);
    expect(acquireLock(f, 200, () => false)).toBe(true);
    expect(readFileSync(f, "utf8")).toBe("200");
    releaseLock(f, 100); // 남의 잠금은 풀지 않는다
    expect(existsSync(f)).toBe(true);
    releaseLock(f, 200);
    expect(existsSync(f)).toBe(false);
  });
});

describe("로그 회전", () => {
  it("크기를 넘기기 직전에 .1 로 밀고, keep 개까지만 남긴다", () => {
    const d = mkdtempSync(join(tmpdir(), "yunseo-log-"));
    const f = join(d, "worker.log");
    const log = new RotatingLog(f, { maxBytes: 1024, keep: 2 });
    for (let i = 0; i < 10; i++) log.write(`${String(i).repeat(400)}\n`); // 401 바이트 × 10
    log.close();
    expect(readdirSync(d).sort()).toEqual(["worker.log", "worker.log.1", "worker.log.2"]);
    expect(readFileSync(f, "utf8").startsWith("8")).toBe(true);
    expect(readFileSync(`${f}.1`, "utf8").startsWith("6")).toBe(true);
  });

  it("다시 열면 기존 크기를 이어서 센다", () => {
    const d = mkdtempSync(join(tmpdir(), "yunseo-log-"));
    const f = join(d, "dashboard.log");
    writeFileSync(f, "x".repeat(1000));
    const log = new RotatingLog(f, { maxBytes: 1024, keep: 3 });
    log.write("y".repeat(100));
    log.close();
    expect(readFileSync(`${f}.1`, "utf8")).toHaveLength(1000);
  });
});
