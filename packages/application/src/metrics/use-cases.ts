// 성과 유스케이스 — 수동 입력·CSV 가져오기·편별/종별/주별 요약. 해석(좋다/나쁘다)은 하지 않는다 — 값을 더하고 나눌 뿐이다(docs/02 §7).
import {
  IDENTITY_TARGETS,
  METRIC_DEFS,
  guessWatchUnit,
  headerSignature,
  isColumnTarget,
  kindSummaries,
  metricKeysFor,
  parseMetricsCsv,
  parseMetricDate,
  parseMetricDuration,
  parseMetricNumber,
  pieceRows,
  rowsToSnapshots,
  suggestMapping,
  validateMetricValues,
  weekStartOf,
  weekSummaries,
  addDays,
  type ColumnTarget,
  type MetricKey,
  type MetricPlatform,
  type MetricValues,
  type PieceIndexEntry,
  type PieceRef,
  type QueueItem,
  type WatchUnit,
} from "@yunseo/domain";
import type { Clock, StudioRepository } from "../ports";
import type { MetricsRepository } from "./ports";
import type { MetricsActionResult, CsvImportResult, CsvInput, CsvPreview, ManualMetricInput, PerformanceView } from "./views";

export interface MetricsDeps {
  repo: StudioRepository;
  metrics: MetricsRepository;
  clock: Clock;
}

const MAX_CSV_CHARS = 1_000_000;
const MAX_CSV_ROWS = 2000;
const MAX_NOTE_CHARS = 500;

const channelsOf = (pieceId: string, queue: readonly QueueItem[]) => queue.filter((q) => q.pieceId === pieceId).map((q) => q.channel);

export function createMetricsUseCases({ repo, metrics, clock }: MetricsDeps) {
  const pieceRefs = async (): Promise<PieceRef[]> => (await repo.listPieces()).map((p) => ({ id: p.id, title: p.title, kind: p.kind, slot: p.slot }));

  /** 측정 기준일 검사 — 형식이 맞고 오늘보다 미래가 아니어야 한다 */
  const checkDate = (raw: string): { date: string } | { error: string } => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? parseMetricDate(raw) : null;
    if (!date || date !== raw) return { error: "측정 기준일은 YYYY-MM-DD 형식이어야 한다" };
    if (date > clock.today()) return { error: "측정 기준일이 오늘보다 미래다" };
    return { date };
  };

  async function pieceIndex(): Promise<PieceIndexEntry[]> {
    const [pieces, queue] = await Promise.all([repo.listPieces(), repo.listQueue()]);
    return pieces.map((p) => ({ id: p.id, title: p.title, postedUrls: queue.filter((q) => q.pieceId === p.id && q.postedUrl).map((q) => q.postedUrl as string) }));
  }

  async function csvRun(input: CsvInput) {
    if (input.text.length > MAX_CSV_CHARS) return { error: "CSV 가 너무 크다(1MB 이하)" } as const;
    const table = parseMetricsCsv(input.text);
    if (table.headers.length === 0 || table.rows.length === 0) return { error: "CSV 에 머리글과 데이터 행이 있어야 한다" } as const;
    if (table.rows.length > MAX_CSV_ROWS) return { error: `행이 너무 많다(${MAX_CSV_ROWS}행 이하)` } as const;
    const suggestions = suggestMapping(table.headers, input.platform);
    const signature = headerSignature(table.headers);
    const saved = input.mapping ? null : await metrics.loadMapping(input.platform, signature);
    const restored = saved !== null && saved.length === table.headers.length;
    const mapping: ColumnTarget[] = input.mapping ? [...input.mapping] : restored ? (saved as ColumnTarget[]) : suggestions.map((s) => s.target);
    const watchHeader = table.headers[mapping.indexOf("watch_minutes")] ?? "";
    const watchUnit: WatchUnit = input.watchUnit ?? guessWatchUnit(watchHeader);
    const date = checkDate(input.capturedAt ?? clock.today());
    return { table, suggestions, signature, restored, mapping, watchUnit, date } as const;
  }

  const mappingProblems = (mapping: readonly ColumnTarget[], headers: readonly string[], platform: MetricPlatform): string[] => {
    const out: string[] = [];
    if (mapping.length !== headers.length) out.push("매핑 열 수가 CSV 열 수와 다르다");
    const allowed = new Set<string>(metricKeysFor(platform));
    const seen = new Set<string>();
    mapping.forEach((t, i) => {
      if (!isColumnTarget(t)) out.push(`${headers[i] ?? i + 1}: 알 수 없는 대상 ${String(t)}`);
      else if (t !== "ignore") {
        if (!(IDENTITY_TARGETS as readonly string[]).includes(t) && !allowed.has(t)) out.push(`${headers[i] ?? i + 1}: ${METRIC_DEFS[t as MetricKey].label} 는 ${platform} 지표가 아니다`);
        if (seen.has(t)) out.push(`${t} 가 두 열에 걸려 있다`);
        seen.add(t);
      }
    });
    if (![...seen].some((t) => (IDENTITY_TARGETS as readonly string[]).includes(t) && t !== "publishedAt")) out.push("편을 찾을 열(편 ID·게시 주소·제목) 이 하나는 있어야 한다");
    if (![...seen].some((t) => t in METRIC_DEFS)) out.push("지표 열이 하나는 있어야 한다");
    return out;
  };

  return {
    /** 성과 화면 — weekOf 가 속한 주(기본: 오늘이 속한 주)의 요약과 편별·종별 표 */
    async getPerformance(weekOf?: string): Promise<PerformanceView> {
      const today = clock.today();
      const [pieces, queue, snapshots, imports] = await Promise.all([pieceRefs(), repo.listQueue(), metrics.listSnapshots(), metrics.listImports(5)]);
      const rows = pieceRows(pieces, snapshots);
      // [L7] 정규화한 날짜로 주를 정한다 — 「2026.11.5」처럼 읽히기만 하는 값을 그대로 넘기면 주 계산이 깨져 500 이 났다. 못 읽으면 이번 주
      const start = weekStartOf((weekOf ? parseMetricDate(weekOf) : null) ?? today);
      const expects = (p: PieceRef, platform: MetricPlatform) => {
        const ch = channelsOf(p.id, queue);
        return platform === "instagram" ? ch.includes("feed") || ch.includes("reels") : ch.includes("reels");
      };
      return {
        today,
        weekStart: start,
        weekEnd: addDays(start, 6),
        week: weekSummaries(pieces, rows, start, expects),
        rows,
        kinds: kindSummaries(rows),
        pieces: [...pieces].sort((a, b) => b.slot.localeCompare(a.slot)),
        imports,
        recent: [...snapshots].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt) || Number(b.id) - Number(a.id)).slice(0, 10),
        snapshotCount: snapshots.length,
      };
    },

    /** 수동 입력 한 건 */
    async recordManual(input: ManualMetricInput): Promise<MetricsActionResult<{ id: string }>> {
      const errors: string[] = [];
      const piece = await repo.getPiece(input.pieceId);
      if (!piece) errors.push("편을 찾을 수 없다");
      const date = checkDate(input.capturedAt);
      if ("error" in date) errors.push(date.error);
      if (input.note.length > MAX_NOTE_CHARS) errors.push(`메모는 ${MAX_NOTE_CHARS}자 이하여야 한다`);
      const values: MetricValues = {};
      for (const key of metricKeysFor(input.platform)) {
        const raw = (input.values[key] ?? "").trim();
        if (raw === "") continue;
        const parsed = METRIC_DEFS[key].unit === "seconds" ? parseMetricDuration(raw) : parseMetricNumber(raw);
        if (parsed === null) continue;
        if (Number.isNaN(parsed)) errors.push(`${METRIC_DEFS[key].label}: 숫자를 읽을 수 없다 (「${raw}」)`);
        else values[key] = parsed;
      }
      errors.push(...validateMetricValues(input.platform, values));
      if (errors.length > 0 || "error" in date) return { ok: false, errors };
      const [saved] = await metrics.upsertSnapshots([{ pieceId: input.pieceId, platform: input.platform, capturedAt: date.date, source: "manual", values, note: input.note.trim() }]);
      return saved ? { ok: true, id: saved.id } : { ok: false, errors: ["저장하지 못했다"] };
    },

    async deleteSnapshot(id: string): Promise<boolean> {
      return metrics.deleteSnapshot(id);
    },

    /** CSV 미리보기 — 열 매핑 추정·적용 결과(들어갈 행/못 찾은 행/읽을 수 없는 행). 저장하지 않는다 */
    async previewCsv(input: CsvInput): Promise<MetricsActionResult<{ preview: CsvPreview }>> {
      const run = await csvRun(input);
      if ("error" in run) return { ok: false, errors: [run.error] };
      const { table, suggestions, restored, mapping, watchUnit, date } = run;
      const blockers = mappingProblems(mapping, table.headers, input.platform);
      if ("error" in date) blockers.push(date.error);
      const trial = blockers.length === 0 && !("error" in date) ? rowsToSnapshots({ table, mapping, platform: input.platform, capturedAt: date.date, watchUnit, index: await pieceIndex() }) : null;
      return {
        ok: true,
        preview: {
          platform: input.platform,
          headers: table.headers,
          rowCount: table.rows.length,
          sampleRows: table.rows.slice(0, 3),
          suggestions,
          mapping,
          restored,
          watchUnit,
          capturedAt: "error" in date ? (input.capturedAt ?? clock.today()) : date.date,
          matched: trial?.snapshots.length ?? 0,
          unmatched: trial?.unmatched ?? [],
          skipped: trial?.skipped ?? [],
          blockers,
        },
      };
    },

    /** CSV 가져오기 — 매핑을 확정해 저장한다. 같은 날 같은 출처의 값은 덮어쓴다 */
    async importCsv(input: CsvInput & { mapping: readonly ColumnTarget[] }): Promise<MetricsActionResult<CsvImportResult>> {
      const run = await csvRun(input);
      if ("error" in run) return { ok: false, errors: [run.error] };
      const { table, signature, mapping, watchUnit, date } = run;
      const blockers = mappingProblems(mapping, table.headers, input.platform);
      if ("error" in date) blockers.push(date.error);
      if (blockers.length > 0 || "error" in date) return { ok: false, errors: blockers };
      const result = rowsToSnapshots({ table, mapping, platform: input.platform, capturedAt: date.date, watchUnit, index: await pieceIndex() });
      // [L7] 직접 입력과 같은 값 규칙(음수·정수·100% 상한)을 CSV 행에도 적용한다 — 어긋난 행은 건너뛰고 이유를 남긴다
      const checked = result.snapshots.filter((snap) => {
        const problems = validateMetricValues(input.platform, snap.values);
        if (problems.length) result.skipped.push({ rowNumber: Number(/(\d+)행/.exec(snap.note)?.[1] ?? 0), label: snap.pieceId, reason: problems.join(", ") });
        return problems.length === 0;
      });
      result.snapshots = checked;
      if (result.snapshots.length > 0) await metrics.upsertSnapshots(result.snapshots);
      await metrics.saveMapping(input.platform, signature, mapping);
      await metrics.logImport({ platform: input.platform, capturedAt: date.date, rows: table.rows.length, imported: result.snapshots.length, unmatched: result.unmatched.length, skipped: result.skipped.length });
      return { ok: true, imported: result.snapshots.length, unmatched: result.unmatched, skipped: result.skipped };
    },
  };
}

export type MetricsUseCases = ReturnType<typeof createMetricsUseCases>;
