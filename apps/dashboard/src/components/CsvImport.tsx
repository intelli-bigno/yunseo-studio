"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IDENTITY_LABEL, IDENTITY_TARGETS, METRIC_DEFS, metricKeysFor, type ColumnTarget, type MetricPlatform, type WatchUnit } from "@yunseo/domain";
import { Badge, Button, Card, CardHeader, Field, FieldRow, Input, Notice, Segmented, SegmentedItem, Select, Stack, Table, TableHead, TableRow, Text, Textarea } from "@yunseo/ui";
import type { MetricsActionResult, CsvImportResult, CsvPreview } from "@/lib/l5-types";

// CSV 가져오기 — 3단계: ① 파일/붙여넣기 → ② 열 매핑 확인(사람이 반드시 본다) → ③ 결과.
// 열 제목은 공식 문서의 지표 이름이면 「공식」, 사람이 읽는 제목은 「추정」으로 표시한다(Business Suite·YouTube Studio 의 내보내기 열 이름은 공개 문서에서 확인하지 못했다).
type CsvArgs = { platform: MetricPlatform; text: string; mapping?: ColumnTarget[]; watchUnit?: WatchUnit; capturedAt?: string };

interface Props {
  today: string;
  preview: (input: CsvArgs) => Promise<MetricsActionResult<{ preview: CsvPreview }>>;
  run: (input: CsvArgs & { mapping: ColumnTarget[] }) => Promise<MetricsActionResult<CsvImportResult>>;
}

const PLATFORMS: { id: MetricPlatform; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "youtube", label: "YouTube" },
];
const WATCH_LABEL: Record<WatchUnit, string> = { minutes: "분", hours: "시간", seconds: "초" };
const BASIS_LABEL = { official: "공식 지표 이름", guess: "추정", none: "—" } as const;

export function CsvImport({ today, preview, run }: Props) {
  const router = useRouter();
  const [platform, setPlatform] = useState<MetricPlatform>("instagram");
  const [text, setText] = useState("");
  const [capturedAt, setCapturedAt] = useState(today);
  const [step, setStep] = useState<"input" | "map" | "done">("input");
  const [view, setView] = useState<CsvPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnTarget[]>([]);
  const [watchUnit, setWatchUnit] = useState<WatchUnit>("minutes");
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const args = (): CsvArgs => ({ platform, text, capturedAt, mapping, watchUnit });

  async function check(first: boolean) {
    setBusy(true);
    setErrors([]);
    const r = await preview(first ? { platform, text, capturedAt } : args());
    setBusy(false);
    if (!r.ok) return setErrors(r.errors);
    setView(r.preview);
    setMapping(r.preview.mapping);
    setWatchUnit(r.preview.watchUnit);
    setStep("map");
  }

  async function submit() {
    setBusy(true);
    setErrors([]);
    const r = await run({ ...args(), mapping });
    setBusy(false);
    if (!r.ok) return setErrors(r.errors);
    setResult(r);
    setStep("done");
    router.refresh(); // 위 표에 바로 반영
  }

  function reset() {
    setStep("input");
    setView(null);
    setResult(null);
    setErrors([]);
    setText("");
  }

  async function readFile(file: File | undefined) {
    if (file) setText(await file.text());
  }

  const options = (): { value: ColumnTarget; label: string }[] => [
    { value: "ignore", label: "가져오지 않음" },
    ...IDENTITY_TARGETS.map((t) => ({ value: t as ColumnTarget, label: `편 찾기 · ${IDENTITY_LABEL[t]}` })),
    ...metricKeysFor(platform).map((k) => ({ value: k as ColumnTarget, label: METRIC_DEFS[k].label })),
  ];
  const hasWatch = mapping.includes("watch_minutes");

  return (
    <Card>
      <CardHeader title="CSV 가져오기" />
      {errors.length > 0 && (
        <Notice>
          {errors.map((e) => (
            <Text key={e} block>
              {e}
            </Text>
          ))}
        </Notice>
      )}

      {step === "input" && (
        <Stack gap={4}>
          <Segmented label="플랫폼">
            {PLATFORMS.map((p) => (
              <SegmentedItem key={p.id} current={platform === p.id} onClick={() => setPlatform(p.id)}>
                {p.label}
              </SegmentedItem>
            ))}
          </Segmented>
          <FieldRow>
            <Field label="CSV 파일">
              <Input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => void readFile(e.target.files?.[0])} />
            </Field>
            <Field label="측정 기준일">
              <Input type="date" value={capturedAt} max={today} onChange={(e) => setCapturedAt(e.target.value)} />
            </Field>
          </FieldRow>
          <Field label="또는 내용 붙여넣기 (첫 줄은 열 제목)">
            <Textarea tall value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Text size="label" tone="mute" block>
            누적 값 · 같은 날 다시 가져오면 덮어쓴다
          </Text>
          <Stack direction="row" gap={2}>
            <Button variant="primary" disabled={busy || text.trim() === ""} onClick={() => void check(true)}>
              열 확인
            </Button>
          </Stack>
        </Stack>
      )}

      {step === "map" && view && (
        <Stack gap={4}>
          <Text tone="mute" block>
            {view.rowCount}행 · {view.restored ? "전에 확인한 매핑을 불러왔다" : "열 이름으로 추정한 매핑"} — 맞는지 확인하고 가져온다.
          </Text>
          <Table columns={["lg", "lg", "sm", "fill"]}>
            <TableHead>
              <span>열 제목</span>
              <span>가져올 값</span>
              <span>근거</span>
              <span>예시</span>
            </TableHead>
            {view.headers.map((h, i) => (
              <TableRow key={`${h}-${i}`}>
                <Text truncate>{h}</Text>
                <Select value={mapping[i] ?? "ignore"} aria-label={`${h} 열`} onChange={(e) => setMapping((m) => m.map((t, j) => (j === i ? (e.target.value as ColumnTarget) : t)))}>
                  {options().map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <Badge tone={view.suggestions[i]?.basis === "official" ? "accent" : "neutral"}>{BASIS_LABEL[view.suggestions[i]?.basis ?? "none"]}</Badge>
                <Text size="label" tone="mute" truncate mono>
                  {view.sampleRows.map((r) => r[i] ?? "").join(" · ")}
                </Text>
              </TableRow>
            ))}
          </Table>
          <FieldRow>
            {hasWatch && (
              <Field label="시청 시간 열의 단위">
                <Select value={watchUnit} onChange={(e) => setWatchUnit(e.target.value as WatchUnit)}>
                  {(Object.keys(WATCH_LABEL) as WatchUnit[]).map((u) => (
                    <option key={u} value={u}>
                      {WATCH_LABEL[u]}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="측정 기준일">
              <Input type="date" value={capturedAt} max={today} onChange={(e) => setCapturedAt(e.target.value)} />
            </Field>
          </FieldRow>
          {view.blockers.length > 0 && (
            <Notice>
              {view.blockers.map((b) => (
                <Text key={b} block>
                  {b}
                </Text>
              ))}
            </Notice>
          )}
          <Stack direction="row" gap={3} align="center" wrap>
            <Badge tone="accent">들어갈 행 {view.matched}</Badge>
            <Badge tone={view.unmatched.length > 0 ? "brass" : "neutral"}>편을 못 찾은 행 {view.unmatched.length}</Badge>
            <Badge tone={view.skipped.length > 0 ? "brass" : "neutral"}>읽을 수 없는 행 {view.skipped.length}</Badge>
          </Stack>
          {[...view.unmatched, ...view.skipped].slice(0, 6).map((p) => (
            <Text key={`${p.rowNumber}-${p.reason}`} size="label" tone="mute" block>
              {p.rowNumber}행 「{p.label}」 — {p.reason}
            </Text>
          ))}
          <Stack direction="row" gap={2}>
            <Button disabled={busy} onClick={() => void check(false)}>
              매핑 적용해 다시 확인
            </Button>
            <Button variant="primary" disabled={busy || view.blockers.length > 0} onClick={() => void submit()}>
              가져오기
            </Button>
            <Button variant="ghost" disabled={busy} onClick={reset}>
              처음으로
            </Button>
          </Stack>
        </Stack>
      )}

      {step === "done" && result && (
        <Stack gap={3}>
          <Text size="title" block>
            {result.imported}행을 가져왔다
          </Text>
          {[...result.unmatched, ...result.skipped].map((p) => (
            <Text key={`${p.rowNumber}-${p.reason}`} size="label" tone="mute" block>
              {p.rowNumber}행 「{p.label}」 — {p.reason}
            </Text>
          ))}
          <Text size="label" tone="mute" block>
            못 찾은 행은 위 수동 입력으로 보탠다.
          </Text>
          <Stack direction="row" gap={2}>
            <Button onClick={reset}>다른 파일 가져오기</Button>
          </Stack>
        </Stack>
      )}
    </Card>
  );
}
