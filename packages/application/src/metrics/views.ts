// 성과 화면이 받는 읽기 모델 — 직렬화 가능한 평범한 값만.
import type { ColumnSuggestion, ColumnTarget, CsvRowProblem, KindSummary, MetricPlatform, MetricSnapshot, PieceMetricsRow, PieceRef, WatchUnit, WeekSummary } from "@yunseo/domain";
import type { CsvImportLog } from "./ports";

export interface PerformanceView {
  today: string;
  /** 요약이 가리키는 주의 월요일 */
  weekStart: string;
  weekEnd: string;
  /** 플랫폼별 주 요약 */
  week: WeekSummary[];
  /** 편별 최신 값 */
  rows: PieceMetricsRow[];
  /** 종별 × 플랫폼 합계 */
  kinds: KindSummary[];
  /** 수동 입력·CSV 가 가리킬 수 있는 편 */
  pieces: PieceRef[];
  imports: CsvImportLog[];
  /** 최근 입력 10건(측정일·입력 순) — 잘못 넣은 값을 지우는 데 쓴다 */
  recent: MetricSnapshot[];
  snapshotCount: number;
}

export type MetricsActionResult<T> = ({ ok: true } & T) | { ok: false; errors: string[] };

export interface ManualMetricInput {
  pieceId: string;
  platform: MetricPlatform;
  /** YYYY-MM-DD */
  capturedAt: string;
  /** 지표 키 → 입력 문자열. 빈 칸은 건너뛴다 */
  values: Record<string, string>;
  note: string;
}

export interface CsvInput {
  platform: MetricPlatform;
  text: string;
  /** 헤더와 같은 길이. 없으면 기억해 둔 매핑 → 추정 순서 */
  mapping?: readonly ColumnTarget[];
  watchUnit?: WatchUnit;
  /** 측정 기준일(기본 오늘) */
  capturedAt?: string;
}

export interface CsvPreview {
  platform: MetricPlatform;
  headers: string[];
  rowCount: number;
  /** 앞 3행 */
  sampleRows: string[][];
  suggestions: ColumnSuggestion[];
  /** 지금 적용 중인 매핑 */
  mapping: ColumnTarget[];
  /** 이 파일 모양으로 전에 저장한 매핑을 불러왔는가 */
  restored: boolean;
  watchUnit: WatchUnit;
  capturedAt: string;
  /** 지금 매핑으로 가져오면 들어갈 행 수 */
  matched: number;
  unmatched: CsvRowProblem[];
  skipped: CsvRowProblem[];
  /** 가져오기를 막는 이유 */
  blockers: string[];
}

export interface CsvImportResult {
  imported: number;
  unmatched: CsvRowProblem[];
  skipped: CsvRowProblem[];
}
