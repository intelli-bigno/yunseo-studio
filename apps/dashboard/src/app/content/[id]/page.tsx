// 편 상세 — 탭이 한 편의 길 순서다: 작성 → 출처(G2) → 미리보기 → 검수(G3). [ ] 키로 탭 이동.
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, KeyHint, Notice, Page, PageHeader, Stack, Tab, Tabs, Text, TextLink } from "@yunseo/ui";
import { CardPreview } from "@/components/CardPreview";
import { ComposeEditor } from "@/components/ComposeEditor";
import { ReviewPanel } from "@/components/ReviewPanel";
import { SourcesEditor } from "@/components/SourcesEditor";
import { GateTrack, KindMark, StatusChip } from "@/components/ui";
import { claimIssues } from "@/lib/logic";
import { PIECES } from "@/lib/mock";
import { DETAIL_TAB_LABEL, DETAIL_TABS, isDetailTab, stepTab } from "@/lib/shortcuts";
import { fmtSlot } from "@/lib/format";

export default async function PiecePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const p = PIECES.find((x) => x.id === id);
  if (!p) notFound();
  const tab = isDetailTab(rawTab) ? rawTab : "write";
  const href = (t: string) => `/content/${p.id}?tab=${t}`;
  const open = p.claims.filter((c) => claimIssues(c).length > 0).length;
  const pre = p.preIssueId ? PIECES.find((x) => x.id === p.preIssueId) : undefined;

  return (
    <Page>
      <PageHeader
        meta={
          <Stack direction="row" gap={2} align="center">
            <TextLink as={Link} href="/content">콘텐츠</TextLink>
            <KindMark kind={p.kind} />
            <Text size="label" tone="mute" mono>{fmtSlot(p.slot)}</Text>
            {pre && <TextLink as={Link} href={`/content/${pre.id}`}>이전 편 {pre.id}</TextLink>}
          </Stack>
        }
        title={p.title}
        actions={
          <>
            <GateTrack piece={p} large />
            <StatusChip status={p.status} />
          </>
        }
      />
      {p.viewpoint ? <Text size="title" tone="dim">{p.viewpoint}</Text> : <Notice>핵심 관점 미정 — G1</Notice>}
      {p.blocker && <Notice>× {p.blocker}</Notice>}

      <Tabs prev={href(stepTab(tab, -1))} next={href(stepTab(tab, 1))}>
        {DETAIL_TABS.map((t) => (
          <Tab key={t} as={Link} href={href(t)} current={t === tab}>
            {DETAIL_TAB_LABEL[t]}
            {t === "sources" && open > 0 && <Badge tone="alert">{open}</Badge>}
          </Tab>
        ))}
        <Stack direction="row" grow justify="end">
          <KeyHint keys={["[", "]"]} />
        </Stack>
      </Tabs>

      {tab === "write" && <ComposeEditor key={p.id} piece={p} />}
      {tab === "sources" && <SourcesEditor key={p.id} piece={p} />}
      {tab === "preview" && <CardPreview key={p.id} piece={p} />}
      {tab === "review" && <ReviewPanel key={p.id} piece={p} />}
    </Page>
  );
}
