// 발행 dry-run 미리보기 — 렌더 산출물로 만든 게시 계획(엔드포인트·순서·파라미터·예상 할당량)과 규격 위반을 보여 준다.
// 실제 호출·토큰 입력·계정 연결은 없다: 이 화면은 계획을 읽기만 한다. 렌더 전략: 서버 렌더(요청마다).
import Link from "next/link";
import { notFound } from "next/navigation";
import { evidenceFor, type PublishPlan, type PublishPlatform } from "@yunseo/domain";
import { Badge, Card, CardHeader, Cell, EmptyState, Grid, Metric, MetricRow, Notice, Page, PageHeader, Section, Segmented, SegmentedItem, Stack, Table, TableHead, TableRow, Text, TextLink } from "@yunseo/ui";
import { IssueText, SeverityBadge } from "@/components/l5";
import { KindMark } from "@/components/ui";
import { fmtSlot } from "@/lib/format";
import { CHANNEL_LABEL, PLAN_KIND_LABEL, PLATFORM_LABEL, VERDICT_LABEL, fmtNum, fmtParams, isChannel } from "@/lib/l5";
import { emptyMedia } from "@/lib/media";
import { l5 } from "@/server/studio";

export const dynamic = "force-dynamic";

function PlanCard({ plan }: { plan: PublishPlan }) {
  const verdict = plan.blocked ? <Badge tone="alert">차단 {plan.issues.filter((i) => i.severity === "block").length}건</Badge> : plan.issues.length > 0 ? <Badge tone="brass">경고 {plan.issues.length}건</Badge> : <Badge tone="accent">규격 통과</Badge>;
  return (
    <Card>
      <CardHeader title={PLAN_KIND_LABEL[plan.kind]} action={verdict} />
      <Text tone="mute" block>{plan.summary}</Text>

      <Section title="규격 위반">
        {plan.issues.length === 0 ? (
          <Text tone="mute">없음</Text>
        ) : (
          <Table columns={["xs", "md", "fill"]}>
            <TableHead>
              <span>구분</span>
              <span>대상</span>
              <span>내용</span>
            </TableHead>
            {plan.issues.map((issue, i) => (
              <TableRow key={`${issue.code}-${i}`}>
                <SeverityBadge severity={issue.severity} />
                <Text size="label" truncate>{issue.subject}</Text>
                <IssueText issue={issue} />
              </TableRow>
            ))}
          </Table>
        )}
      </Section>

      <Section title="요청 순서">
        <Table columns={["xs", "md", "fill", "xs"]}>
          <TableHead>
            <span>순서</span>
            <span>단계</span>
            <span>요청 · 파라미터</span>
            <span>인증</span>
          </TableHead>
          {plan.steps.map((step) => (
            <TableRow key={step.id}>
              <Text mono tone="mute">{step.order}</Text>
              <span>
                <Text size="body" block>{step.title}</Text>
                <Text size="label" tone="mute" block>{step.kind === "local" ? "우리 쪽 준비" : "API 호출"}{step.dependsOn.length > 0 ? ` · 앞: ${step.dependsOn.join(", ")}` : ""}</Text>
              </span>
              <span>
                {step.url && (
                  <Text size="label" mono block>
                    {step.method} {step.url}
                  </Text>
                )}
                {fmtParams(step.params).map((p) => (
                  <Text key={p.key} size="label" tone="dim" mono block title={p.full}>
                    {p.key} = {p.value}
                  </Text>
                ))}
                {step.note && (
                  <Text size="label" tone="mute" block>
                    {step.note}
                  </Text>
                )}
              </span>
              <Text size="label" tone="mute">{step.needsAuth ? "토큰 필요" : "—"}</Text>
            </TableRow>
          ))}
        </Table>
      </Section>

      <Section title="예상 할당량">
        <MetricRow>
          {plan.quota.map((q) => (
            <Metric key={q.label} value={fmtNum(q.used)} unit={`/ ${q.limit === null ? "?" : fmtNum(q.limit)} ${q.unit}`} label={`${q.label} · ${q.window}`} />
          ))}
        </MetricRow>
        {plan.quota.map((q) => (
          <Text key={q.label} size="label" tone="mute" block>
            {q.label}: {q.basis}
          </Text>
        ))}
      </Section>
    </Card>
  );
}

export default async function DryRunPage({ params, searchParams }: { params: Promise<{ pieceId: string }>; searchParams: Promise<{ channel?: string }> }) {
  const { pieceId } = await params;
  const { channel: rawChannel } = await searchParams;
  const channel = isChannel(rawChannel) ? rawChannel : "feed";
  const { publish, rules } = l5();
  const preview = await publish.getPublishPreview(pieceId, channel);
  if (!preview) notFound();
  const platforms = [...new Set(preview.plans.map((p): PublishPlatform => p.platform))];
  const href = (c: string) => `/publish/${preview.piece.id}?channel=${c}`;

  return (
    <Page>
      <PageHeader
        meta={
          <Stack direction="row" gap={2} align="center">
            <TextLink as={Link} href="/publish">발행</TextLink>
            <KindMark kind={preview.piece.kind} />
            <Text size="label" tone="mute" mono>{fmtSlot(preview.piece.slot)}</Text>
          </Stack>
        }
        title={preview.piece.title}
        actions={
          <Segmented label="채널">
            {(["feed", "reels"] as const).map((c) => (
              <SegmentedItem key={c} as={Link} href={href(c)} current={c === channel}>
                {CHANNEL_LABEL[c]}
              </SegmentedItem>
            ))}
          </Segmented>
        }
      />
      <Grid>
        <Cell span={12}>
          <Notice tone="accent">dry-run — 게시 계획만, 실제 호출 없음</Notice>
        </Cell>
        {!rules.loaded && (
          <Cell span={12}>
            <Notice>금지 표현 규칙(프리셋)을 읽지 못해 캡션·제목의 금지 표현은 검사하지 못했다{rules.error ? ` — ${rules.error}` : ""}.</Notice>
          </Cell>
        )}
        {preview.notes.length > 0 && (
          <Cell span={12}>
            <Card tone="inset">
              {preview.notes.map((n) => (
                <Text key={n} size="label" tone="mute" block>
                  {n}
                </Text>
              ))}
            </Card>
          </Cell>
        )}
        {preview.plans.length === 0 && (
          <Cell span={12}>
            <Card>
              <EmptyState media={emptyMedia()} title="이 채널은 만들 수 있는 게시 계획이 없다" />
            </Card>
          </Cell>
        )}
        {preview.plans.map((plan) => (
          <Cell key={plan.kind} span={12}>
            <PlanCard plan={plan} />
          </Cell>
        ))}
        {platforms.length > 0 && (
          <Cell span={12}>
            <Card tone="inset">
              <CardHeader title="규격 근거 (공식 문서, 2026-11-05 확인)" />
              {platforms.flatMap((platform) =>
                evidenceFor(platform).map((e) => (
                  <Stack key={e.id} gap={1}>
                    <Stack direction="row" gap={2} align="center" wrap>
                      <Badge tone={e.verdict === "confirmed" ? "accent" : e.verdict === "conflict" ? "alert" : "brass"}>{VERDICT_LABEL[e.verdict]}</Badge>
                      <Text size="label" tone="mute">{PLATFORM_LABEL[platform]} · 가정: {e.assumption}</Text>
                    </Stack>
                    <Text size="body" block>{e.finding}</Text>
                    <Text size="label" tone="dim" block>“{e.quote}”</Text>
                    <TextLink href={e.url} target="_blank" rel="noreferrer noopener">
                      {e.url} (문서 갱신 {e.docUpdated})
                    </TextLink>
                  </Stack>
                )),
              )}
            </Card>
          </Cell>
        )}
      </Grid>
    </Page>
  );
}
