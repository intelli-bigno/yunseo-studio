"use server";
// 성과 입력 서버 동작 — 폼/섬이 보낸 값을 검사해 유스케이스로 넘긴다. 외부 계정 접속 없음(수동 입력·CSV 만).
// 클라이언트가 보낸 값은 믿지 않는다: 형식을 여기서 한 번 더 확인한다.
import { redirect } from "next/navigation";
import type { MetricsActionResult, CsvImportResult, CsvInput, CsvPreview } from "@yunseo/application";
import { isColumnTarget, type ColumnTarget, type MetricPlatform, type WatchUnit } from "@yunseo/domain";
import { l5 } from "@/server/studio";

const PLATFORMS: readonly string[] = ["instagram", "youtube"];
const WATCH_UNITS: readonly string[] = ["minutes", "hours", "seconds"];

const text = (v: FormDataEntryValue | null | undefined): string => (typeof v === "string" ? v : "");

function parseCsvInput(raw: unknown): { ok: true; input: CsvInput } | { ok: false; errors: string[] } {
  if (typeof raw !== "object" || raw === null) return { ok: false, errors: ["요청 모양이 잘못됐다"] };
  const r = raw as Record<string, unknown>;
  if (typeof r.platform !== "string" || !PLATFORMS.includes(r.platform)) return { ok: false, errors: ["플랫폼이 잘못됐다"] };
  if (typeof r.text !== "string") return { ok: false, errors: ["CSV 내용이 없다"] };
  const input: CsvInput = { platform: r.platform as MetricPlatform, text: r.text };
  if (r.mapping !== undefined) {
    if (!Array.isArray(r.mapping) || !r.mapping.every((t) => typeof t === "string" && isColumnTarget(t))) return { ok: false, errors: ["열 매핑이 잘못됐다"] };
    input.mapping = r.mapping as ColumnTarget[];
  }
  if (r.watchUnit !== undefined) {
    if (typeof r.watchUnit !== "string" || !WATCH_UNITS.includes(r.watchUnit)) return { ok: false, errors: ["시청 시간 단위가 잘못됐다"] };
    input.watchUnit = r.watchUnit as WatchUnit;
  }
  if (r.capturedAt !== undefined) {
    if (typeof r.capturedAt !== "string") return { ok: false, errors: ["측정 기준일이 잘못됐다"] };
    input.capturedAt = r.capturedAt;
  }
  return { ok: true, input };
}

/** 수동 입력 폼 — 저장하면 같은 화면으로 돌아와 알린다 */
export async function recordManualAction(formData: FormData): Promise<void> {
  const platformRaw = text(formData.get("platform"));
  const platform: MetricPlatform = platformRaw === "youtube" ? "youtube" : "instagram";
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (key.startsWith("m_") && typeof value === "string") values[key.slice(2)] = value;
  const result = await l5().metrics.recordManual({ pieceId: text(formData.get("pieceId")), platform, capturedAt: text(formData.get("capturedAt")), values, note: text(formData.get("note")) });
  if (result.ok) redirect(`/performance?platform=${platform}&saved=${encodeURIComponent(result.id)}`);
  redirect(`/performance?platform=${platform}&error=${encodeURIComponent(result.errors.slice(0, 4).join(" · "))}`);
}

export async function deleteSnapshotAction(formData: FormData): Promise<void> {
  await l5().metrics.deleteSnapshot(text(formData.get("id")));
  redirect("/performance?deleted=1");
}

/** CSV 미리보기 — 저장하지 않는다 */
export async function previewCsvAction(raw: unknown): Promise<MetricsActionResult<{ preview: CsvPreview }>> {
  const parsed = parseCsvInput(raw);
  if (!parsed.ok) return parsed;
  return l5().metrics.previewCsv(parsed.input);
}

/** CSV 가져오기 — 열 매핑을 사람이 확인한 뒤에만 */
export async function importCsvAction(raw: unknown): Promise<MetricsActionResult<CsvImportResult>> {
  const parsed = parseCsvInput(raw);
  if (!parsed.ok) return parsed;
  if (!parsed.input.mapping) return { ok: false, errors: ["열 매핑을 확인한 뒤 가져온다"] };
  return l5().metrics.importCsv({ ...parsed.input, mapping: parsed.input.mapping });
}
