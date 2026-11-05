// [L6] 운영 — 서비스 상태·예약 작업(마지막·다음 실행)·최근 작업 기록·백업 목록·로그 꼬리. 읽기 전용, 클라이언트 JS 없음.
// 렌더 전략: 요청마다(상태 화면은 지금 값이어야 한다). 비밀값은 다루지 않는다 — 로그는 정해진 파일 이름만 읽는다.
import { AppCell, AppGrid, Badge, Card, CardHeader, Cell, EmptyState, Grid, Metric, MetricRow, Page, PageHeader, Stack, Table, TableHead, TableRow, Text } from "@yunseo/ui";
import { backupStale, fmtBytes, fmtKst, fmtRelative, RUN_LABEL, runTone } from "@/lib/ops-format";
import { listInstalledApps } from "@/server/library";
import { ops } from "@/server/studio";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const v = await ops().getOpsStatus({ runs: 20, logLines: 30 });
  const s = v.summary;
  const apps = listInstalledApps();
  const now = v.checkedAt;
  return (
    <Page>
      <PageHeader title="운영" meta={<Text tone="mute" mono>확인 {fmtKst(now)} KST</Text>} />
      <Grid>
        <Cell span={12}>
          <Card tone="feature">
            <MetricRow>
              <Metric size="hero" value={`${s.servicesUp}/${s.servicesTotal}`} label="서비스 정상" tone={s.servicesUp < s.servicesTotal ? "alert" : "accent"} />
              <Metric size="hero" value={s.failedRuns24h} label="24시간 실패" tone={s.failedRuns24h ? "alert" : "default"} />
              <Metric size="hero" value={s.backupAgeHours ?? "—"} unit={s.backupAgeHours === null ? undefined : "시간"} label="마지막 백업 경과" tone={backupStale(s.backupAgeHours) ? "alert" : "default"} />
              <Metric size="hero" value={v.backups.files.length} label="보관 백업" />
            </MetricRow>
          </Card>
        </Cell>

        <Cell span={12}>
          <Card>
            <CardHeader title="서비스" />
            <Table columns={["sm", "fill", "md", "md", "auto"]}>
              <TableHead>
                <span>이름</span>
                <span>주소 · 응답</span>
                <span>배포 커밋</span>
                <span>시작</span>
                <span>상태</span>
              </TableHead>
              {v.services.map((svc) => (
                <TableRow key={svc.name}>
                  <Text size="title">{svc.name}</Text>
                  <Text tone="mute" mono truncate title={svc.url ?? ""}>
                    {svc.url ?? "—"} · {svc.detail}
                  </Text>
                  <Text tone="dim" mono>{svc.revision ?? "—"}</Text>
                  <Text tone="mute" mono>{fmtKst(svc.startedAt)}</Text>
                  <Badge tone={svc.ok ? "accent" : "alert"}>{svc.ok ? "정상" : "응답 없음"}</Badge>
                </TableRow>
              ))}
            </Table>
          </Card>
        </Cell>

        <Cell span={6}>
          <Card>
            <CardHeader title="예약 작업" />
            {v.jobs.length === 0 ? (
              <EmptyState title="워커 응답이 없어 작업 목록을 모른다" />
            ) : (
              <Table columns={["sm", "md", "fill", "md"]}>
                <TableHead>
                  <span>작업</span>
                  <span>일정</span>
                  <span>마지막 실행</span>
                  <span>다음 실행</span>
                </TableHead>
                {v.jobs.map((j) => (
                  <TableRow key={j.name}>
                    <Text size="title" mono>{j.name}</Text>
                    <Text tone="mute">{j.schedule}</Text>
                    <Stack direction="row" gap={2} align="center">
                      {j.lastRun ? <Badge tone={runTone(j.lastRun.status)}>{RUN_LABEL[j.lastRun.status]}</Badge> : <Text tone="mute">기록 없음</Text>}
                      {j.lastRun && <Text tone="mute" mono>{fmtRelative(j.lastRun.startedAt, now)}</Text>}
                    </Stack>
                    <Text tone="dim" mono>{j.running ? "실행 중" : `${fmtKst(j.nextRun)} (${fmtRelative(j.nextRun, now)})`}</Text>
                  </TableRow>
                ))}
              </Table>
            )}
          </Card>
        </Cell>

        <Cell span={6}>
          <Card>
            <CardHeader title="백업" action={<Text tone="mute" mono>{v.backups.location ?? "위치 미설정"} · {fmtBytes(v.backups.totalBytes)}</Text>} />
            {v.backups.files.length === 0 ? (
              <EmptyState title="백업이 아직 없다 — 매일 03:30 KST 에 만든다" />
            ) : (
              <Table columns={["fill", "sm", "md"]}>
                <TableHead>
                  <span>파일</span>
                  <span>크기</span>
                  <span>만든 때</span>
                </TableHead>
                {v.backups.files.map((f) => (
                  <TableRow key={f.name}>
                    <Text mono truncate>{f.name}</Text>
                    <Text tone="mute" mono>{fmtBytes(f.bytes)}</Text>
                    <Text tone="mute" mono>{fmtRelative(f.createdAt, now)}</Text>
                  </TableRow>
                ))}
              </Table>
            )}
          </Card>
        </Cell>

        <Cell span={12}>
          <Card>
            <CardHeader title="최근 작업 기록" />
            {v.runs.length === 0 ? (
              <EmptyState title="기록이 없다" />
            ) : (
              <Table columns={["md", "sm", "auto", "fill"]}>
                <TableHead>
                  <span>시작</span>
                  <span>작업</span>
                  <span>결과</span>
                  <span>내용</span>
                </TableHead>
                {v.runs.map((r) => (
                  <TableRow key={r.id}>
                    <Text tone="mute" mono>{fmtKst(r.startedAt)}</Text>
                    <Text mono>{r.job}</Text>
                    <Badge tone={runTone(r.status)}>{RUN_LABEL[r.status]}</Badge>
                    <Text tone={r.status === "failed" ? "alert" : "dim"} truncate title={r.message ?? ""}>
                      {r.message ?? "—"}
                    </Text>
                  </TableRow>
                ))}
              </Table>
            )}
          </Card>
        </Cell>

        {v.logs.map((log) => (
          <Cell span={6} key={log.name}>
            <Card tone="inset">
              <CardHeader title={`${log.name}.log`} action={<Text tone="mute" mono>{fmtBytes(log.bytes)}</Text>} />
              {log.lines.length === 0 ? (
                <EmptyState title="로그 없음" />
              ) : (
                <Stack gap={0}>
                  {log.lines.map((line, i) => (
                    <Text key={i} size="label" mono truncate title={line}>
                      {line || " "}
                    </Text>
                  ))}
                </Stack>
              )}
            </Card>
          </Cell>
        ))}

        {apps.map((m) => (
          <Cell span={12} key={m.machine}>
            <Card>
              <CardHeader title={`설치 앱 · ${m.machine}`} action={<Text tone="mute" mono>{m.apps.length}개 · {fmtKst(m.collectedAt)}</Text>} />
              <AppGrid>
                {m.apps.map((a) => (
                  <AppCell key={a.name} name={a.name} src={a.icon ?? undefined} />
                ))}
              </AppGrid>
            </Card>
          </Cell>
        ))}
      </Grid>
    </Page>
  );
}
