// 작업 스케줄러 정의(XML) — 서비스마다 감시 프로세스(supervise.ts) 하나를 띄운다.
// - 부팅 트리거(30초 지연) → 재부팅 뒤 로그온 없이 자동 시작. 로그온 유형 S4U = 「사용자가 로그온하지 않아도 실행」, 암호 저장 없음.
// - 2분 반복 트리거 → 감시 프로세스가 죽으면 2분 안에 다시 뜬다. 살아 있으면 MultipleInstancesPolicy=IgnoreNew 로 무시된다.
// - 실행 시간 제한 없음(PT0S), 우선순위 5(작업 스케줄러 기본 7 은 「낮음」이라 화면 응답이 느려진다).
import type { ServiceDef } from "./layout";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** 공백이 든 인자만 따옴표로 감싼다(Windows 명령줄 규칙, 경로에 따옴표가 없다는 전제) */
export const quoteArg = (a: string) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

export interface TaskXmlOptions {
  /** 실행 계정 — 예: bigno\yjh99 */
  userId: string;
  nodeExe: string;
  /** 저장소 체크아웃(작업 디렉터리) */
  appDir: string;
  root: string;
}

export function supervisorArgs(def: Pick<ServiceDef, "name">, { appDir, root }: Pick<TaskXmlOptions, "appDir" | "root">): string[] {
  return ["--import", "tsx", `${appDir}\\ops\\windows\\supervise.ts`, def.name, "--root", root];
}

export function taskXml(def: Pick<ServiceDef, "name" | "taskName" | "host" | "port">, o: TaskXmlOptions): string {
  const args = supervisorArgs(def, o).map(quoteArg).join(" ");
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.3" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>${esc(`yunseo-studio ${def.name} supervisor - Tailnet ${def.host}:${def.port} (docs/10-operations.md)`)}</Description>
    <URI>${esc(def.taskName)}</URI>
  </RegistrationInfo>
  <Triggers>
    <BootTrigger>
      <Enabled>true</Enabled>
      <Delay>PT30S</Delay>
    </BootTrigger>
    <TimeTrigger>
      <StartBoundary>2026-01-01T00:00:00</StartBoundary>
      <Enabled>true</Enabled>
      <Repetition>
        <Interval>PT2M</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
    </TimeTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${esc(o.userId)}</UserId>
      <LogonType>S4U</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>5</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>999</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${esc(o.nodeExe)}</Command>
      <Arguments>${esc(args)}</Arguments>
      <WorkingDirectory>${esc(o.appDir)}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
`;
}

/** schtasks /xml 은 UTF-16 LE(BOM) 파일을 확실히 읽는다 */
export function utf16leWithBom(text: string): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text.replace(/\r?\n/g, "\r\n"), "utf16le")]);
}
