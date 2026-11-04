// 발행 대기열 — 승인본을 내보내고 기록. MVP 는 수동 게시 — 자동 게시 없음.
// 렌더 전략: 정적 + 60초 재검증(요청별 입력 없음). 클라이언트 JS 없음.
import Link from "next/link";
import { Card, Cell, Grid, Metric, MetricRow, Page, PageHeader, Table, TableHead, TableRow, Text } from "@yunseo/ui";
import { KindMark, QueueChip } from "@/components/ui";
import { fmtSlot } from "@/lib/format";
import { heroMedia } from "@/lib/media";
import { studio } from "@/server/studio";

export const revalidate = 60;

export default async function PublishPage() {
  const { summary: s, rows } = await studio().getPublishQueue();
  return (
    <Page>
      <PageHeader title="발행" />
      <Grid>
        <Cell span={12}>
          <Card tone="feature" media={heroMedia("/img/publish.jpg", { width: 1600, height: 900 })}>
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
              {rows.map(({ item, piece, state }) => (
                <TableRow key={item.pieceId + item.channel} as={Link} href={state === "needs_g3" || state === "mismatch" ? `/content/${piece.id}?tab=review` : `/content/${piece.id}?tab=preview`}>
                  <Text tone="mute" mono>{item.channel}</Text>
                  <KindMark kind={piece.kind} />
                  <Text size="title" truncate>{piece.title}</Text>
                  <Text tone="mute" mono>{fmtSlot(piece.slot).slice(0, 5)}</Text>
                  <Text size="label" mono tone={state === "mismatch" ? "alert" : "dim"}>
                    {item.approvedHash ?? "—"} → {item.currentHash}
                  </Text>
                  <QueueChip s={state} />
                </TableRow>
              ))}
            </Table>
          </Card>
        </Cell>
      </Grid>
    </Page>
  );
}
