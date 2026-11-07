// 표시 도우미 — 순수 함수. 시각은 운영 시간대 KST(+09:00 고정)로 보인다.
const KST_MS = 9 * 3_600_000;

/** ISO → "11.05 03:30" (KST). 값이 없으면 "—" */
export function fmtKst(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const k = new Date(t + KST_MS).toISOString();
  return `${k.slice(5, 7)}.${k.slice(8, 10)} ${k.slice(11, 16)}`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
