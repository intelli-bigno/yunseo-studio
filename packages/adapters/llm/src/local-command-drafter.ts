// ScriptDrafter 의 로컬 명령 실행 어댑터 — 사용자가 설정한 명령(예: 로컬에 설치한 CLI)에 요청을 stdin 으로 주고 stdout 의 JSON 을 받는다.
//  · 기본은 꺼짐: 명령이 설정되지 않으면 enabled=false 이고 아무것도 실행하지 않는다.
//  · 유료 API 를 직접 부르지 않는다. 무엇을 실행하는지는 설정한 사람이 정한다(셸을 거치지 않고 execFile 로 실행 — 인자는 문자열 그대로).
//  · 출력 계약: stdout 에 JSON 한 덩어리 `{ "stages": [{ "key": "...", "body": "..." }] }`.
import { execFile } from "node:child_process";
import type { ScriptDraft, ScriptDraftRequest, ScriptDrafter } from "@yunseo/application";
import { AppError } from "@yunseo/domain";

export type DrafterErrorCode = "DRAFTER_DISABLED" | "DRAFTER_FAILED" | "DRAFTER_TIMEOUT" | "DRAFTER_BAD_OUTPUT";

/** 초안 명령(로컬 CLI — codex 등) 실패 — 꺼짐·실행 실패·시간 초과·출력 계약 위반을 코드로 가른다 */
export class DrafterError extends AppError<DrafterErrorCode> {
  override name = "DrafterError";
  constructor(code: DrafterErrorCode, message: string, cause?: unknown) {
    super(code, message, cause === undefined ? {} : { cause });
  }
}

export interface LocalCommandDrafterOptions {
  /** 실행 파일과 인자. 비었거나 생략하면 꺼짐 */
  command?: readonly string[] | null;
  timeoutMs?: number;
  /** stdout 상한(글자 수) */
  maxOutputChars?: number;
  /** 한 단 본문 상한(글자 수) */
  maxBodyChars?: number;
}

/** 환경변수 등에 담긴 설정 문자열(JSON 문자열 배열)을 명령으로 읽는다. 잘못되면 null(꺼짐) */
export function parseDrafterCommand(raw: string | undefined | null): string[] | null {
  if (!raw || raw.trim() === "") return null;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string" && v !== "") ? (value as string[]) : null;
  } catch {
    return null;
  }
}

function parseOutput(stdout: string, maxBodyChars: number): ScriptDraft {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    throw new DrafterError("DRAFTER_BAD_OUTPUT", "초안 명령의 출력이 JSON 이 아니다");
  }
  const stages = (json as { stages?: unknown }).stages;
  if (!Array.isArray(stages)) throw new DrafterError("DRAFTER_BAD_OUTPUT", "초안 명령의 출력에 stages 배열이 없다");
  const out = stages.map((s: unknown) => {
    const row = s as { key?: unknown; body?: unknown };
    if (typeof row.key !== "string" || typeof row.body !== "string") throw new DrafterError("DRAFTER_BAD_OUTPUT", "초안 단은 문자열 key·body 를 가져야 한다");
    if (row.body.length > maxBodyChars) throw new DrafterError("DRAFTER_BAD_OUTPUT", `초안 단 ${row.key} 가 ${maxBodyChars}자를 넘는다`);
    return { key: row.key, body: row.body };
  });
  return { stages: out, draftedBy: "assistant" };
}

export function createLocalCommandDrafter(options: LocalCommandDrafterOptions = {}): ScriptDrafter {
  const command = options.command && options.command.length > 0 ? [...options.command] : null;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxOutputChars = options.maxOutputChars ?? 200_000;
  const maxBodyChars = options.maxBodyChars ?? 4_000;

  return {
    enabled: command !== null,
    draft(request: ScriptDraftRequest): Promise<ScriptDraft> {
      if (!command) return Promise.reject(new DrafterError("DRAFTER_DISABLED", "원고 초안 명령이 설정되지 않았다 (기본 꺼짐)"));
      const [file, ...args] = command as [string, ...string[]];
      return new Promise<ScriptDraft>((resolve, reject) => {
        const child = execFile(file, args, { timeout: timeoutMs, maxBuffer: maxOutputChars * 4, encoding: "utf8", shell: false, windowsHide: true }, (error, stdout) => {
          if (error) {
            const killed = (error as { killed?: boolean }).killed;
            reject(killed ? new DrafterError("DRAFTER_TIMEOUT", `초안 명령이 ${timeoutMs}ms 안에 끝나지 않았다`, error) : new DrafterError("DRAFTER_FAILED", `초안 명령 실패: ${error.message.split("\n")[0]}`, error));
            return;
          }
          if (stdout.length > maxOutputChars) {
            reject(new DrafterError("DRAFTER_BAD_OUTPUT", "초안 명령의 출력이 너무 크다"));
            return;
          }
          try {
            resolve(parseOutput(stdout, maxBodyChars));
          } catch (e) {
            reject(e);
          }
        });
        child.stdin?.on("error", () => undefined); // 명령이 입력을 안 읽고 끝나도 EPIPE 로 죽지 않게
        child.stdin?.end(JSON.stringify(request));
      });
    },
  };
}
