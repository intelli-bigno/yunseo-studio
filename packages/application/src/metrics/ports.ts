// 성과 저장 포트 — 수동 입력·CSV 로 들어온 스냅샷, 가져오기 기록, 열 매핑 기억.
import type { ColumnTarget, MetricPlatform, MetricSnapshot, NewMetricSnapshot } from "@yunseo/domain";

export interface CsvImportLog {
  id: string;
  platform: MetricPlatform;
  capturedAt: string;
  rows: number;
  imported: number;
  unmatched: number;
  skipped: number;
  /** 기록 시각 ISO */
  at: string;
}

export interface MetricsRepository {
  /** 같은 (편, 플랫폼, 측정일, 출처)는 덮어쓴다 — 같은 CSV 를 다시 넣어도 쌓이지 않는다 */
  upsertSnapshots(snapshots: readonly NewMetricSnapshot[]): Promise<MetricSnapshot[]>;
  listSnapshots(): Promise<readonly MetricSnapshot[]>;
  deleteSnapshot(id: string): Promise<boolean>;
  /** 열 제목 모양(서명)이 같은 파일에 다시 쓰려고 매핑을 기억한다 */
  saveMapping(platform: MetricPlatform, signature: string, mapping: readonly ColumnTarget[]): Promise<void>;
  loadMapping(platform: MetricPlatform, signature: string): Promise<ColumnTarget[] | null>;
  logImport(entry: Omit<CsvImportLog, "id" | "at">): Promise<void>;
  listImports(limit: number): Promise<CsvImportLog[]>;
}
