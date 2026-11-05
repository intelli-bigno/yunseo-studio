// 테스트용 가짜 성과 저장소 — 어댑터 없이 유스케이스를 검증한다.
import type { ColumnTarget, MetricPlatform, MetricSnapshot, NewMetricSnapshot } from "@yunseo/domain";
import type { CsvImportLog, MetricsRepository } from "./ports";

export class FakeMetricsRepository implements MetricsRepository {
  snapshots: MetricSnapshot[] = [];
  mappings = new Map<string, ColumnTarget[]>();
  imports: CsvImportLog[] = [];
  #next = 1;

  async upsertSnapshots(items: readonly NewMetricSnapshot[]) {
    const out: MetricSnapshot[] = [];
    for (const item of items) {
      const at = this.snapshots.findIndex((s) => s.pieceId === item.pieceId && s.platform === item.platform && s.capturedAt === item.capturedAt && s.source === item.source);
      const saved: MetricSnapshot = { ...structuredClone(item), id: at >= 0 ? this.snapshots[at]!.id : String(this.#next++) };
      if (at >= 0) this.snapshots[at] = saved;
      else this.snapshots.push(saved);
      out.push(saved);
    }
    return out;
  }
  async listSnapshots() {
    return structuredClone(this.snapshots);
  }
  async deleteSnapshot(id: string) {
    const before = this.snapshots.length;
    this.snapshots = this.snapshots.filter((s) => s.id !== id);
    return this.snapshots.length < before;
  }
  async saveMapping(platform: MetricPlatform, signature: string, mapping: readonly ColumnTarget[]) {
    this.mappings.set(`${platform}|${signature}`, [...mapping]);
  }
  async loadMapping(platform: MetricPlatform, signature: string) {
    return this.mappings.get(`${platform}|${signature}`) ?? null;
  }
  async logImport(entry: Omit<CsvImportLog, "id" | "at">) {
    this.imports.unshift({ ...entry, id: String(this.imports.length + 1), at: "2026-11-08T00:00:00.000Z" });
  }
  async listImports(limit: number) {
    return this.imports.slice(0, limit);
  }
}
