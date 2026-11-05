// 성과 계산 규칙(순수 함수) — 값 검증·최신 값 고르기·비율·편별/종별/주별 요약.
// 수치를 해석하는 문구는 만들지 않는다: 여기는 입력된 값을 더하고 나누기만 한다(해석은 사람, docs/02 §7).
import { addDays, weekStartOf } from "../story/calendar";
import type { PieceKind } from "../story/model";
import { METRIC_DEFS, METRIC_KEYS, metricKeysFor, type MetricKey, type MetricPlatform, type MetricSnapshot, type MetricValues } from "./model";

/** 값 검증 — 오류 문구 목록(비어 있으면 통과) */
export function validateMetricValues(platform: MetricPlatform, values: MetricValues): string[] {
  const errors: string[] = [];
  const entries = Object.entries(values) as [MetricKey, number][];
  if (entries.length === 0) errors.push("입력된 지표가 없다");
  const allowed = new Set(metricKeysFor(platform));
  for (const [key, value] of entries) {
    if (!(key in METRIC_DEFS)) {
      errors.push(`알 수 없는 지표 ${key}`);
      continue;
    }
    const def = METRIC_DEFS[key];
    if (!allowed.has(key)) errors.push(`${def.label} 는 ${platform} 지표가 아니다`);
    if (typeof value !== "number" || !Number.isFinite(value)) errors.push(`${def.label}: 숫자가 아니다`);
    else if (value < 0) errors.push(`${def.label}: 음수일 수 없다`);
    else if (def.unit === "count" && !Number.isInteger(value)) errors.push(`${def.label}: 정수여야 한다`);
    else if (def.unit === "percent" && value > 100) errors.push(`${def.label}: 100 을 넘을 수 없다`);
  }
  return errors;
}

const later = (a: MetricSnapshot, b: MetricSnapshot) => (a.capturedAt === b.capturedAt ? Number(a.id) > Number(b.id) : a.capturedAt > b.capturedAt);

/** (편, 플랫폼)마다 가장 늦게 잰 값 하나. 같은 날이면 나중에 들어온 것 */
export function latestSnapshots(snapshots: readonly MetricSnapshot[]): MetricSnapshot[] {
  const best = new Map<string, MetricSnapshot>();
  for (const s of snapshots) {
    const key = `${s.pieceId}|${s.platform}`;
    const cur = best.get(key);
    if (!cur || later(s, cur)) best.set(key, s);
  }
  return [...best.values()];
}

export interface DerivedRates {
  /** 저장 ÷ 도달 */
  saveRate: number | null;
  /** 공유 ÷ 도달 */
  shareRate: number | null;
  /** 프로필 방문 → 팔로우 (docs/02 §7 의 대리 지표) */
  followPerVisit: number | null;
  /** (좋아요+댓글+저장+공유) ÷ 도달 — 총 상호작용이 있으면 그 값 ÷ 도달 */
  interactionRate: number | null;
  /** 구독 증가 ÷ 조회 */
  subscribePerView: number | null;
}

const ratio = (num: number | undefined, den: number | undefined): number | null => (num === undefined || den === undefined || den <= 0 ? null : num / den);

export function derivedRates(values: MetricValues): DerivedRates {
  const sum = (keys: MetricKey[]) => (keys.every((k) => values[k] === undefined) ? undefined : keys.reduce((acc, k) => acc + (values[k] ?? 0), 0));
  return {
    saveRate: ratio(values.saved, values.reach),
    shareRate: ratio(values.shares, values.reach),
    followPerVisit: ratio(values.follows, values.profile_visits),
    interactionRate: ratio(values.total_interactions ?? sum(["likes", "comments", "saved", "shares"]), values.reach),
    subscribePerView: ratio(values.subscribers_gained, values.views),
  };
}

export interface PieceRef {
  id: string;
  title: string;
  kind: PieceKind;
  /** 게시 예정 ISO (KST) */
  slot: string;
}

export interface PieceMetricsRow {
  piece: PieceRef;
  platform: MetricPlatform;
  snapshot: MetricSnapshot;
  rates: DerivedRates;
}

/** 편별 표 — 편이 사라진 스냅샷은 건너뛴다. 최근 슬롯 먼저 */
export function pieceRows(pieces: readonly PieceRef[], snapshots: readonly MetricSnapshot[]): PieceMetricsRow[] {
  const byId = new Map(pieces.map((p) => [p.id, p]));
  return latestSnapshots(snapshots)
    .flatMap((snapshot) => {
      const piece = byId.get(snapshot.pieceId);
      return piece ? [{ piece, platform: snapshot.platform, snapshot, rates: derivedRates(snapshot.values) }] : [];
    })
    .sort((a, b) => b.piece.slot.localeCompare(a.piece.slot) || a.platform.localeCompare(b.platform));
}

export interface MetricsTotals {
  /** 합계를 낸 편의 수 */
  pieces: number;
  sums: MetricValues;
  rates: DerivedRates;
}

/** 값을 더해도 뜻이 있는 지표만 합친다(도달·평균은 제외) */
export function totalsOf(rows: readonly PieceMetricsRow[]): MetricsTotals {
  const sums: MetricValues = {};
  for (const row of rows) {
    for (const key of METRIC_KEYS) {
      const v = row.snapshot.values[key];
      if (v !== undefined && METRIC_DEFS[key].additive) sums[key] = (sums[key] ?? 0) + v;
    }
  }
  // 비율은 같은 편들의 도달이 필요하다 — 도달은 편마다 따로 두고 더하지 않으므로 비율은 편별 값의 평균이 아니라 null 이다.
  return { pieces: rows.length, sums, rates: derivedRates(sums) };
}

export interface KindSummary {
  kind: PieceKind;
  platform: MetricPlatform;
  totals: MetricsTotals;
}

/** 종별(이전·이후·연구) × 플랫폼 합계 */
export function kindSummaries(rows: readonly PieceMetricsRow[]): KindSummary[] {
  const groups = new Map<string, PieceMetricsRow[]>();
  for (const row of rows) {
    const key = `${row.piece.kind}|${row.platform}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const [kind, platform] = key.split("|") as [PieceKind, MetricPlatform];
      return { kind, platform, totals: totalsOf(list) };
    })
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.platform.localeCompare(b.platform));
}

export interface WeekSummary {
  /** 월요일 */
  weekStart: string;
  weekEnd: string;
  platform: MetricPlatform;
  totals: MetricsTotals;
  /** 이 주에 게시 예정이던 편 중 성과가 아직 없는 편 */
  missing: PieceRef[];
}

/** 주별 요약 — 게시 예정 슬롯이 그 주에 드는 편의 최신 값을 플랫폼별로 합친다 */
export function weekSummaries(
  pieces: readonly PieceRef[],
  rows: readonly PieceMetricsRow[],
  weekStart: string,
  /** 이 편이 그 플랫폼에 올라갈 예정인가 — 아니면 「성과 미입력」으로 세지 않는다 */
  expects: (piece: PieceRef, platform: MetricPlatform) => boolean = () => true,
): WeekSummary[] {
  const start = weekStartOf(weekStart);
  const end = addDays(start, 6);
  const inWeek = (p: PieceRef) => p.slot.slice(0, 10) >= start && p.slot.slice(0, 10) <= end;
  const weekPieces = pieces.filter(inWeek);
  return (["instagram", "youtube"] as const).map((platform) => {
    const picked = rows.filter((r) => r.platform === platform && inWeek(r.piece));
    const have = new Set(picked.map((r) => r.piece.id));
    return { weekStart: start, weekEnd: end, platform, totals: totalsOf(picked), missing: weekPieces.filter((p) => expects(p, platform) && !have.has(p.id)) };
  });
}
