// 성과 — 편별·종별·주별 표, 수동 입력, CSV 가져오기. 해석(좋다/나쁘다)은 하지 않는다: 입력한 값을 더하고 나눠 보여 줄 뿐이다(docs/02 §7).
// 외부 계정 접속·자동 수집 없음. 렌더 전략: 서버 렌더(요청마다) — 입력하면 바로 바뀌어야 한다. CSV 섬만 클라이언트.
import Link from "next/link";
import { CORE_METRIC_KEYS, METRIC_DEFS, addDays, metricKeysFor, type MetricKey, type MetricPlatform, type MetricValues, type WeekSummary } from "@yunseo/domain";
import { Badge, Button, Card, CardHeader, Cell, EmptyState, Field, FieldRow, Grid, Input, List, ListItem, Metric, MetricRow, Notice, Page, PageHeader, Segmented, SegmentedItem, Select, Stack, Table, TableHead, TableRow, Text, Textarea, TextLink } from "@yunseo/ui";
import { PlatformIcon } from "@yunseo/ui";
import { CsvImport } from "@/components/CsvImport";
import { KindMark } from "@/components/ui";
import { fmtDay, fmtWeekRange } from "@/lib/format";
import { PLATFORM_LABEL, fmtDate, fmtMetric, fmtNum, fmtPct, isPlatform } from "@/lib/l5";
import { emptyMedia } from "@/lib/media";
import { l5 } from "@/server/studio";
import { deleteSnapshotAction, importCsvAction, previewCsvAction, recordManualAction } from "./actions";

export const dynamic = "force-dynamic";

type Query = { platform?: string; week?: string; saved?: string; error?: string; deleted?: string };

/** 주 요약 카드에 크게 보여 줄 지표 */
const WEEK_KEYS: Record<MetricPlatform, MetricKey[]> = {
  instagram: ["views", "saved", "shares", "profile_visits", "follows"],
  youtube: ["views", "watch_minutes", "likes", "shares", "subscribers_gained"],
};

function WeekCard({ summary }: { summary: WeekSummary }) {
  const { platform, totals, missing } = summary;
  return (
    <Card>
      <CardHeader title={<PlatformIcon platform={platform} label />} action={<Badge tone={totals.pieces > 0 ? "accent" : "neutral"}>{totals.pieces}편 입력</Badge>} />
      {totals.pieces === 0 ? (
        <Text tone="mute" block>이 주에 입력된 성과가 없다</Text>
      ) : (
        <MetricRow>
          {WEEK_KEYS[platform].map((k) => (
            <Metric key={k} value={fmtNum(totals.sums[k])} label={METRIC_DEFS[k].label} />
          ))}
          {platform === "instagram" && <Metric value={fmtPct(totals.rates.followPerVisit)} label="방문→팔로우" />}
        </MetricRow>
      )}
      {missing.length > 0 && (
        <Text size="label" tone="mute" block>
          성과 미입력 {missing.length}편 — {missing.map((p) => p.title).join(" · ")}
        </Text>
      )}
    </Card>
  );
}

const TABLE_KEYS: Record<MetricPlatform, MetricKey[]> = {
  instagram: ["views", "reach", "saved", "shares", "profile_visits", "follows"],
  youtube: ["views", "watch_minutes", "avg_view_sec", "likes", "shares", "subscribers_gained"],
};

function valuesText(values: MetricValues): string {
  return (Object.entries(values) as [MetricKey, number][]).map(([k, v]) => `${METRIC_DEFS[k].label} ${fmtMetric(k, v)}`).join(" · ");
}

export default async function PerformancePage({ searchParams }: { searchParams: Promise<Query> }) {
  const q = await searchParams;
  const platform: MetricPlatform = isPlatform(q.platform) ? q.platform : "instagram";
  const { metrics, persisted } = l5();
  const v = await metrics.getPerformance(q.week);
  const keys = metricKeysFor(platform);
  const fieldRows = Array.from({ length: Math.ceil(keys.length / 4) }, (_, i) => keys.slice(i * 4, i * 4 + 4));
  const platformRows = (p: MetricPlatform) => v.rows.filter((r) => r.platform === p);

  return (
    <Page>
      <PageHeader
        title="성과"
        meta={`${fmtWeekRange(v.weekStart, v.weekEnd)}`}
        actions={
          <Stack direction="row" gap={2} align="center">
            <TextLink as={Link} href={`/performance?week=${addDays(v.weekStart, -7)}`}>이전 주</TextLink>
            <TextLink as={Link} href={`/performance?week=${addDays(v.weekStart, 7)}`}>다음 주</TextLink>
          </Stack>
        }
      />
      <Grid>
        {!persisted && (
          <Cell span={12}>
            <Notice>STUDIO_DB 없음 — 메모리에만 저장</Notice>
          </Cell>
        )}
        {q.saved && (
          <Cell span={12}>
            <Notice tone="accent">저장했다.</Notice>
          </Cell>
        )}
        {q.deleted && (
          <Cell span={12}>
            <Notice tone="accent">지웠다.</Notice>
          </Cell>
        )}
        {q.error && (
          <Cell span={12}>
            <Notice>{q.error}</Notice>
          </Cell>
        )}

        {v.week.map((w) => (
          <Cell key={w.platform} span={6}>
            <WeekCard summary={w} />
          </Cell>
        ))}

        <Cell span={12}>
          <Card>
            <CardHeader title="편별 (가장 늦게 잰 값)" />
            {v.rows.length === 0 ? (
              <EmptyState media={emptyMedia()} title="아직 입력된 성과가 없다" />
            ) : (
              (["instagram", "youtube"] as const).map((p) =>
                platformRows(p).length === 0 ? null : (
                  <Stack key={p} gap={2}>
                    <PlatformIcon platform={p} label />
                    <Table columns={["fill", "sm", ...TABLE_KEYS[p].map(() => "xs" as const), "sm"]}>
                      <TableHead>
                        <span>편</span>
                        <span>측정일</span>
                        {TABLE_KEYS[p].map((k) => (
                          <span key={k}>{METRIC_DEFS[k].label}</span>
                        ))}
                        <span>{p === "instagram" ? "방문→팔로우" : "구독/조회"}</span>
                      </TableHead>
                      {platformRows(p).map((r) => (
                        <TableRow key={`${r.piece.id}-${p}`} as={Link} href={`/content/${r.piece.id}?tab=preview`}>
                          <Text size="title" truncate>{r.piece.title}</Text>
                          <Text tone="mute" mono>{fmtDate(r.snapshot.capturedAt)}</Text>
                          {TABLE_KEYS[p].map((k) => (
                            <Text key={k} mono>{fmtMetric(k, r.snapshot.values[k])}</Text>
                          ))}
                          <Text mono tone="dim">{fmtPct(p === "instagram" ? r.rates.followPerVisit : r.rates.subscribePerView)}</Text>
                        </TableRow>
                      ))}
                    </Table>
                  </Stack>
                ),
              )
            )}
          </Card>
        </Cell>

        {v.kinds.length > 0 && (
          <Cell span={12}>
            <Card>
              <CardHeader title="종류별 합계" />
              <Table columns={["sm", "sm", "xs", "xs", "xs", "xs", "xs", "xs"]}>
                <TableHead>
                  <span>종류</span>
                  <span>플랫폼</span>
                  <span>편 수</span>
                  <span>조회</span>
                  <span>저장</span>
                  <span>공유</span>
                  <span>프로필 방문</span>
                  <span>팔로우</span>
                </TableHead>
                {v.kinds.map((k) => (
                  <TableRow key={`${k.kind}-${k.platform}`}>
                    <KindMark kind={k.kind} />
                    <PlatformIcon platform={k.platform} label />
                    <Text mono>{k.totals.pieces}</Text>
                    <Text mono>{fmtNum(k.totals.sums.views)}</Text>
                    <Text mono>{fmtNum(k.totals.sums.saved)}</Text>
                    <Text mono>{fmtNum(k.totals.sums.shares)}</Text>
                    <Text mono>{fmtNum(k.totals.sums.profile_visits)}</Text>
                    <Text mono>{fmtNum(k.totals.sums.follows)}</Text>
                  </TableRow>
                ))}
              </Table>
            </Card>
          </Cell>
        )}

        <Cell span={7}>
          <Card>
            <CardHeader
              title="수동 입력"
              action={
                <Segmented label="플랫폼">
                  {(["instagram", "youtube"] as const).map((p) => (
                    <SegmentedItem key={p} as={Link} href={`/performance?platform=${p}`} current={p === platform}>
                      {PLATFORM_LABEL[p]}
                    </SegmentedItem>
                  ))}
                </Segmented>
              }
            />
            <form action={recordManualAction}>
              <Stack gap={4}>
                <input type="hidden" name="platform" value={platform} />
                <FieldRow>
                  <Field label="편">
                    <Select name="pieceId" required defaultValue="">
                      <option value="" disabled>
                        편 고르기
                      </option>
                      {v.pieces.map((p) => (
                        <option key={p.id} value={p.id}>
                          {fmtDay(p.slot)} · {p.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="측정 기준일">
                    <Input type="date" name="capturedAt" required defaultValue={v.today} max={v.today} />
                  </Field>
                </FieldRow>
                {fieldRows.map((row) => (
                  <FieldRow key={row.join("-")}>
                    {row.map((k) => (
                      <Field key={k} label={METRIC_DEFS[k].label}>
                        <Input name={`m_${k}`} inputMode="decimal" mono autoComplete="off" placeholder={METRIC_DEFS[k].unit === "seconds" ? "0:18" : CORE_METRIC_KEYS[platform].includes(k) ? "0" : "선택"} />
                      </Field>
                    ))}
                  </FieldRow>
                ))}
                <Field label="메모">
                  <Textarea name="note" maxLength={500} />
                </Field>
                <Text size="label" tone="mute" block>
                  그 시점까지의 누적 값을 넣는다. 빈 칸은 건너뛴다. 같은 날 같은 편을 다시 넣으면 덮어쓴다. {platform === "instagram" ? "「노출」 대신 조회(2024-07-02 이후)" : "시청 시간은 분 단위."}
                </Text>
                <Stack direction="row" gap={2}>
                  <Button type="submit" variant="primary">저장</Button>
                </Stack>
              </Stack>
            </form>
          </Card>
        </Cell>

        <Cell span={5}>
          <Card>
            <CardHeader title="최근 입력" />
            {v.recent.length === 0 ? (
              <Text tone="mute" block>아직 없다</Text>
            ) : (
              <List>
                {v.recent.map((s) => {
                  const piece = v.pieces.find((p) => p.id === s.pieceId);
                  return (
                    <ListItem
                      key={s.id}
                      title={piece?.title ?? s.pieceId}
                      meta={`${PLATFORM_LABEL[s.platform]} · ${fmtDate(s.capturedAt)} · ${s.source === "csv" ? "CSV" : "수동"} · ${valuesText(s.values)}`}
                      trailing={
                        <form action={deleteSnapshotAction}>
                          <input type="hidden" name="id" value={s.id} />
                          <Button type="submit" variant="ghost">지우기</Button>
                        </form>
                      }
                    />
                  );
                })}
              </List>
            )}
            {v.imports.length > 0 && (
              <>
                <Text size="title" block>가져오기 기록</Text>
                {v.imports.map((i) => (
                  <Text key={i.id} size="label" tone="mute" block>
                    {PLATFORM_LABEL[i.platform]} · 기준일 {fmtDate(i.capturedAt)} · {i.rows}행 중 {i.imported}행 · 못 찾음 {i.unmatched} · 읽기 실패 {i.skipped}
                  </Text>
                ))}
              </>
            )}
          </Card>
        </Cell>

        <Cell span={12}>
          <CsvImport today={v.today} preview={previewCsvAction} run={importCsvAction} />
        </Cell>
      </Grid>
    </Page>
  );
}
