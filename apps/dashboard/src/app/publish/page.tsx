// 발행 대기열 — 승인본을 내보내고 기록. MVP 는 수동 게시 — 자동 게시 없음.
import Link from "next/link";
import { Card, Cell, Grid, Metric, MetricRow, Page, PageHeader, Table, TableHead, TableRow, Text } from "@yunseo/ui";
import { KindMark, QueueChip } from "@/components/ui";
import { queueState, queueSummary } from "@/lib/logic";
import { PIECES, QUEUE } from "@/lib/mock";
import { fmtSlot } from "@/lib/format";

export default function PublishPage() {
  const s = queueSummary(QUEUE);
  return (
    <Page>
      <PageHeader title="발행" />
      <Grid>
        <Cell span={12}>
          <Card tone="feature" image="/img/publish.jpg">
            <MetricRow>
              <Metric size="hero" value={s.ready} label="준비됨" tone="accent" />
              <Metric size="hero" value={s.needs_g3} label="G3 대기" />
              <Metric size="hero" value={s.mismatch} label="해시 불일치" tone={s.mismatch ? "alert" : "default"} />
            </MetricRow>
          </Card>
        </Cell>
        <Cell span={12}>
          <Card>
            <Table columns={["sm", "sm", "fill", "sm", "lg", "auto"]}>
              <TableHead>
                <span>채널</span>
                <span>종류</span>
                <span>편</span>
                <span>슬롯</span>
                <span>해시</span>
                <span>상태</span>
              </TableHead>
              {QUEUE.map((q) => {
                const p = PIECES.find((x) => x.id === q.pieceId)!;
                const st = queueState(q);
                return (
                  <TableRow key={q.pieceId + q.channel} as={Link} href={st === "needs_g3" || st === "mismatch" ? `/content/${p.id}?tab=review` : `/content/${p.id}?tab=preview`}>
                    <Text tone="mute" mono>{q.channel}</Text>
                    <KindMark kind={p.kind} />
                    <Text size="title" truncate>{p.title}</Text>
                    <Text tone="mute" mono>{fmtSlot(p.slot).slice(0, 5)}</Text>
                    <Text size="label" mono tone={st === "mismatch" ? "alert" : "dim"}>
                      {q.approvedHash ?? "—"} → {q.currentHash}
                    </Text>
                    <QueueChip s={st} />
                  </TableRow>
                );
              })}
            </Table>
          </Card>
        </Cell>
      </Grid>
    </Page>
  );
}
