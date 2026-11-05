// CSV 가져오기 — 순수 함수. 읽기(parseMetricsCsv) → 열 추정(suggestMapping) → 행을 스냅샷으로(rowsToSnapshots).
//
// 열 이름 근거: 공식 문서가 적은 이름은 basis "official"(Instagram 미디어 인사이트 지표명, YouTube Analytics 지표명).
// Business Suite·YouTube Studio 가 내보내는 CSV 의 열 제목은 공개 문서에서 확인하지 못했다(2026-11-05) — 사람이 읽는 제목은
// basis "guess" 로 추정만 하고, 가져오기 화면은 항상 열 매핑을 사람이 확인하게 한다.
import { METRIC_DEFS, metricKeysFor, type MetricKey, type MetricPlatform, type MetricValues, type NewMetricSnapshot } from "./model";

// ---- 읽기

export interface CsvTable {
  headers: string[];
  rows: string[][];
}

const DELIMITERS = [",", ";", "\t"] as const;

/** RFC 4180 + 구분자 자동 감지(, ; 탭) + BOM 제거. 빈 줄은 건너뛴다 */
export function parseMetricsCsv(input: string): CsvTable {
  const text = input.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = DELIMITERS.map((d) => ({ d, n: firstLine.split(d).length })).sort((a, b) => b.n - a.n)[0]!.d;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  const [headers = [], ...body] = rows;
  return { headers: headers.map((h) => h.trim()), rows: body };
}

// ---- 열 → 대상

export const IDENTITY_TARGETS = ["pieceId", "postUrl", "title", "publishedAt"] as const;
export type IdentityTarget = (typeof IDENTITY_TARGETS)[number];
export type ColumnTarget = MetricKey | IdentityTarget | "ignore";

export const isColumnTarget = (v: string): v is ColumnTarget => v === "ignore" || (IDENTITY_TARGETS as readonly string[]).includes(v) || v in METRIC_DEFS;

export const IDENTITY_LABEL: Record<IdentityTarget, string> = { pieceId: "편 ID", postUrl: "게시 주소", title: "제목", publishedAt: "게시일(참고)" };

export type MappingBasis = "official" | "guess" | "none";
export interface ColumnSuggestion {
  target: ColumnTarget;
  basis: MappingBasis;
}

const norm = (header: string) => header.normalize("NFKC").toLowerCase().replace(/[\s_\-()[\]%·.]+/g, "");

/** 공식 문서의 지표 이름(정규화). Instagram: 미디어 인사이트 참조 / YouTube: Analytics 지표 문서 */
const OFFICIAL: Record<string, ColumnTarget> = {
  views: "views",
  reach: "reach",
  likes: "likes",
  comments: "comments",
  saved: "saved",
  shares: "shares",
  profilevisits: "profile_visits",
  follows: "follows",
  totalinteractions: "total_interactions",
  igreelsavgwatchtime: "reels_avg_watch_sec",
  impressions: "impressions",
  engagedviews: "engaged_views",
  estimatedminuteswatched: "watch_minutes",
  averageviewduration: "avg_view_sec",
  averageviewpercentage: "avg_view_percent",
  subscribersgained: "subscribers_gained",
  subscriberslost: "subscribers_lost",
};

/** 사람이 읽는 열 제목 추정 — 근거 없음(guess) */
const GUESS: Record<string, ColumnTarget> = {
  조회: "views",
  조회수: "views",
  재생: "views",
  재생수: "views",
  노출: "impressions",
  노출수: "impressions",
  도달: "reach",
  도달수: "reach",
  도달한계정: "reach",
  좋아요: "likes",
  좋아요수: "likes",
  댓글: "comments",
  댓글수: "comments",
  저장: "saved",
  저장수: "saved",
  공유: "shares",
  공유수: "shares",
  프로필방문: "profile_visits",
  프로필방문수: "profile_visits",
  프로필조회: "profile_visits",
  팔로우: "follows",
  팔로우수: "follows",
  팔로워증가: "follows",
  watchtimehours: "watch_minutes",
  시청시간시간: "watch_minutes",
  시청시간분: "watch_minutes",
  watchtimeminutes: "watch_minutes",
  평균시청시간: "avg_view_sec",
  averageviewduration: "avg_view_sec",
  평균시청률: "avg_view_percent",
  averagepercentageviewed: "avg_view_percent",
  impressionsclickthroughrate: "impressions_ctr_percent",
  노출클릭률: "impressions_ctr_percent",
  subscribers: "subscribers_gained",
  구독자: "subscribers_gained",
  구독자증가: "subscribers_gained",
  videotitle: "title",
  동영상제목: "title",
  콘텐츠제목: "title",
  title: "title",
  제목: "title",
  caption: "title",
  description: "title",
  permalink: "postUrl",
  url: "postUrl",
  link: "postUrl",
  postlink: "postUrl",
  게시물링크: "postUrl",
  주소: "postUrl",
  videopublishtime: "publishedAt",
  publishtime: "publishedAt",
  timestamp: "publishedAt",
  게시일: "publishedAt",
  게시시간: "publishedAt",
  pieceid: "pieceId",
  편id: "pieceId",
};

/** 헤더마다 대상 열을 추정한다. 같은 대상이 두 열에 걸리면 첫 열만 쓰고 나머지는 ignore */
export function suggestMapping(headers: readonly string[], platform: MetricPlatform): ColumnSuggestion[] {
  const allowed = new Set<ColumnTarget>([...metricKeysFor(platform), ...IDENTITY_TARGETS]);
  const taken = new Set<ColumnTarget>();
  return headers.map((header) => {
    const key = norm(header);
    const official = OFFICIAL[key];
    const guess = GUESS[key];
    const target = official ?? guess;
    if (!target || !allowed.has(target) || taken.has(target)) return { target: "ignore", basis: "none" };
    taken.add(target);
    return { target, basis: official ? "official" : "guess" };
  });
}

/** 열 제목 모음의 서명 — 같은 모양의 파일이면 저장해 둔 매핑을 다시 쓴다 */
export const headerSignature = (headers: readonly string[]): string => headers.map(norm).join("|");

// ---- 값 읽기

/** 「1,234」「12.5%」「1.2K」 같은 표기를 숫자로. 비어 있거나 「-」·「—」면 null, 읽을 수 없으면 NaN */
export function parseMetricNumber(raw: string): number | null {
  const s = raw.normalize("NFKC").trim().replace(/,/g, "").replace(/%$/, "");
  if (s === "" || /^[-–—]$/.test(s)) return null;
  const m = /^(-?\d+(?:\.\d+)?)\s*([kKmM万])?$/.exec(s);
  if (!m) return Number.NaN;
  const base = Number(m[1]);
  const mult = m[2] === undefined ? 1 : m[2] === "万" ? 10_000 : m[2].toLowerCase() === "k" ? 1_000 : 1_000_000;
  return base * mult;
}

/** 「45」「0:45」「1:02:03」→ 초 */
export function parseMetricDuration(raw: string): number | null {
  const s = raw.trim();
  if (s === "" || /^[-–—]$/.test(s)) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const parts = s.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return Number.NaN;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

export type WatchUnit = "minutes" | "hours" | "seconds";
const WATCH_TO_MINUTES: Record<WatchUnit, number> = { minutes: 1, hours: 60, seconds: 1 / 60 };

/** 열 제목에서 시청 시간 단위 추정 — 「Watch time (hours)」→ 시간 */
export function guessWatchUnit(header: string): WatchUnit {
  const h = header.toLowerCase();
  if (h.includes("hour") || h.includes("시간)")) return "hours";
  if (h.includes("second") || h.includes("초")) return "seconds";
  return "minutes";
}

/** 날짜 칸 → YYYY-MM-DD. 모르면 null (2026-11-04 · 2026.11.4. · 2026/11/04 · ISO 시각) */
export function parseMetricDate(raw: string): string | null {
  const m = /^(\d{4})[-./\s]+(\d{1,2})[-./\s]+(\d{1,2})/.exec(raw.trim());
  if (!m) return null;
  const [y, mo, d] = [m[1]!, Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > new Date(Date.UTC(Number(y), mo, 0)).getUTCDate()) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// ---- 편 찾기

export interface PieceIndexEntry {
  id: string;
  title: string;
  /** 대기열에 기록된 게시 주소 */
  postedUrls: readonly string[];
}

const normTitle = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
const normUrl = (s: string) => {
  const t = s.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  return t;
};

export interface RowIdentity {
  pieceId: string | null;
  postUrl: string | null;
  title: string | null;
}

/** 편 ID → 게시 주소 → 제목 순서로 한 편을 찾는다. 못 찾거나 둘 이상이면 null */
export function matchPiece(identity: RowIdentity, index: readonly PieceIndexEntry[]): string | null {
  const one = (list: PieceIndexEntry[]) => (list.length === 1 ? list[0]!.id : null);
  if (identity.pieceId) {
    const hit = index.find((p) => p.id === identity.pieceId!.trim());
    if (hit) return hit.id;
  }
  if (identity.postUrl) {
    const url = normUrl(identity.postUrl);
    const hit = one(index.filter((p) => p.postedUrls.some((u) => normUrl(u) === url)));
    if (hit) return hit;
  }
  if (identity.title) {
    const t = normTitle(identity.title);
    if (t !== "") return one(index.filter((p) => normTitle(p.title) === t));
  }
  return null;
}

// ---- 행 → 스냅샷

export interface RowsToSnapshotsInput {
  table: CsvTable;
  /** headers 와 같은 길이 */
  mapping: readonly ColumnTarget[];
  platform: MetricPlatform;
  capturedAt: string;
  watchUnit: WatchUnit;
  index: readonly PieceIndexEntry[];
}

export interface CsvRowProblem {
  /** 파일 기준 줄 번호(머리글이 1) */
  rowNumber: number;
  label: string;
  reason: string;
}

export interface RowsToSnapshotsResult {
  snapshots: NewMetricSnapshot[];
  /** 편을 못 찾은 행 — 사람이 수동 입력으로 보탠다 */
  unmatched: CsvRowProblem[];
  /** 읽을 수 없는 값·지표 없는 행 */
  skipped: CsvRowProblem[];
}

export function rowsToSnapshots({ table, mapping, platform, capturedAt, watchUnit, index }: RowsToSnapshotsInput): RowsToSnapshotsResult {
  const result: RowsToSnapshotsResult = { snapshots: [], unmatched: [], skipped: [] };
  const col = (target: ColumnTarget) => mapping.indexOf(target);
  table.rows.forEach((cells, r) => {
    const rowNumber = r + 2;
    const text = (target: IdentityTarget) => {
      const c = col(target);
      const v = c >= 0 ? (cells[c] ?? "").trim() : "";
      return v === "" ? null : v;
    };
    const identity: RowIdentity = { pieceId: text("pieceId"), postUrl: text("postUrl"), title: text("title") };
    const label = identity.title ?? identity.postUrl ?? identity.pieceId ?? `${rowNumber}행`;
    const values: MetricValues = {};
    const bad: string[] = [];
    mapping.forEach((target, c) => {
      if (target === "ignore" || (IDENTITY_TARGETS as readonly string[]).includes(target)) return;
      const key = target as MetricKey;
      const raw = cells[c] ?? "";
      const unit = METRIC_DEFS[key].unit;
      let value: number | null;
      if (unit === "seconds") value = parseMetricDuration(raw);
      else value = parseMetricNumber(raw);
      if (value === null) return;
      if (Number.isNaN(value)) {
        bad.push(`${METRIC_DEFS[key].label} 「${raw.trim()}」`);
        return;
      }
      if (key === "watch_minutes") value *= WATCH_TO_MINUTES[watchUnit];
      values[key] = METRIC_DEFS[key].unit === "count" ? Math.round(value) : value;
    });
    if (bad.length > 0) {
      result.skipped.push({ rowNumber, label, reason: `읽을 수 없는 값: ${bad.join(", ")}` });
      return;
    }
    if (Object.keys(values).length === 0) {
      result.skipped.push({ rowNumber, label, reason: "가져올 지표 값이 없다" });
      return;
    }
    const pieceId = matchPiece(identity, index);
    if (!pieceId) {
      result.unmatched.push({ rowNumber, label, reason: "대응하는 편을 찾지 못했다 (편 ID·게시 주소·제목이 맞는지 확인)" });
      return;
    }
    result.snapshots.push({ pieceId, platform, capturedAt, source: "csv", values, note: `CSV ${rowNumber}행` });
  });
  return result;
}
