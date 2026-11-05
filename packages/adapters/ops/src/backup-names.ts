// 백업 파일 이름과 보존 규칙 — 순수 함수(파일 시스템 없음).
// 이름은 운영자가 읽는 시각(KST)을 담는다: studio-YYYYMMDD-HHMMSS.db. 한국은 일광 절약 시간이 없어 고정 +09:00 이다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const BACKUP_PATTERN = /^studio-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.db$/;
export const DEFAULT_BACKUP_KEEP = 14;

export function backupName(at: Date): string {
  const k = new Date(at.getTime() + KST_OFFSET_MS).toISOString(); // 2026-11-05T03:30:00.000Z (KST 벽시계)
  return `studio-${k.slice(0, 4)}${k.slice(5, 7)}${k.slice(8, 10)}-${k.slice(11, 13)}${k.slice(14, 16)}${k.slice(17, 19)}.db`;
}

/** 이름의 KST 시각 → ISO(UTC). 형식이 아니면 null */
export function backupTime(name: string): string | null {
  const m = BACKUP_PATTERN.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)) - KST_OFFSET_MS;
  return Number.isNaN(utc) ? null : new Date(utc).toISOString();
}

/** 최신순으로 keep 개를 남기고 지울 이름들. 형식이 다른 파일(수동 사본·작업 중 .partial)은 건드리지 않는다 */
export function expiredBackups(names: readonly string[], keep: number = DEFAULT_BACKUP_KEEP): string[] {
  if (!Number.isInteger(keep) || keep < 1) throw new Error(`보존 개수는 1 이상의 정수여야 한다: ${keep}`);
  return names
    .filter((n) => BACKUP_PATTERN.test(n))
    .sort()
    .reverse()
    .slice(keep);
}
