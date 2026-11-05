// 감시 프로세스의 판단 부분 — 잠금(한 서비스에 감시 프로세스 하나), 재시작 간격, 바인드 주소 존재 확인.
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import type { NetworkInterfaceInfo } from "node:os";

/** 연속 실패 n 번째의 재시작 대기 — 1·2·4·…초, 최대 60초 */
export function backoffMs(failures: number): number {
  return Math.min(60_000, 1000 * 2 ** Math.max(0, failures - 1));
}

/** 이만큼 버티고 죽었으면 「연속 실패」로 세지 않는다 */
export const STABLE_MS = 5 * 60_000;

export function hostPresent(host: string, interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>): boolean {
  if (host === "127.0.0.1" || host === "localhost") return true;
  return Object.values(interfaces).some((list) => (list ?? []).some((i) => i.address === host));
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function lockOwner(lockFile: string): number | null {
  if (!existsSync(lockFile)) return null;
  const pid = Number(readFileSync(lockFile, "utf8").trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

/**
 * 잠금 파일을 배타 생성(wx)한다. 다른 살아 있는 프로세스가 쥐고 있으면 false.
 * 주인이 죽은 잠금(정전·강제 종료)은 지우고 한 번 더 시도한다.
 */
export function acquireLock(lockFile: string, pid: number, alive: (pid: number) => boolean = pidAlive): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lockFile, "wx");
      writeSync(fd, String(pid));
      closeSync(fd);
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const owner = lockOwner(lockFile);
      if (owner !== null && owner !== pid && alive(owner)) return false;
      unlinkSync(lockFile);
    }
  }
  return false;
}

export function releaseLock(lockFile: string, pid: number): void {
  if (lockOwner(lockFile) === pid) unlinkSync(lockFile);
}
