// 편 상세 — 탭이 한 편의 길 순서다: 작성 → 출처(G2) → 미리보기 → 검수(G3). [ ] 키로 탭 이동.
// 렌더 전략: 서버 렌더(요청마다, ?tab 쿼리). 머리·탭은 서버 컴포넌트(JS 없음), 열린 탭의 편집기만 클라이언트 섬이다.
// 탭 섬을 지연 로드로 쪼개지 않는다 — 열린 탭의 코드는 어차피 바로 필요해 추가 왕복만 늘고, 4개 합쳐도 gzip 3.4KB 라 이득이 없다(docs/09 §6).
import Link from "next/link";
import { notFound } from "next/navigation";
import { space } from "@yunseo/design-tokens";
import { Badge, KeyHint, Notice, Page, PageHeader, Stack, Tab, Tabs, Text, TextLink } from "@yunseo/ui";
import { CardPreview } from "@/components/CardPreview";
import { ComposeEditor } from "@/components/ComposeEditor";
import { ReviewPanel } from "@/components/ReviewPanel";
import { SourcesEditor } from "@/components/SourcesEditor";
import { GateTrack, KindMark, StatusChip } from "@/components/ui";
import { fmtSlot } from "@/lib/format";
import { emptyMedia, media } from "@/lib/media";
import { DETAIL_TAB_LABEL, DETAIL_TABS, isDetailTab, stepTab } from "@/lib/shortcuts";
import { studio } from "@/server/studio";

const FRAME_WIDTH = space[8] * 7; // ui 카드 틀 폭(styles.css .ui-card-frame)
const THUMB_WIDTH = space[7]; // ui 썸네일 폭(.ui-thumb)

/** "4 / 5" → 4/5. 그릴 높이를 폭에서 구한다 */
const ratio = (aspect: string): number => {
  const [w, h] = aspect.split("/").map((n) => Number(n.trim()));
  return w && h ? h / w : 1;
};

export default async function PiecePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const detail = await studio().getPieceDetail(id);
  if (!detail) notFound();
  const { piece: p, preIssue: pre, openClaims } = detail;
  const tab = isDetailTab(rawTab) ? rawTab : "write";
  const href = (t: string) => `/content/${p.id}?tab=${t}`;
  const art = emptyMedia();

  // 미리보기: 카드 주소·크기를 서버가 정해 HTML 에 바로 싣는다 — 브라우저가 JS 를 받고 /api/cards 를 물은 뒤에야 이미지를 찾는 연쇄가 없다
  const set = tab === "preview" && p.cards?.length ? await studio().getCardSet() : null;
  const frameHeight = set ? Math.round(FRAME_WIDTH * ratio(set.aspect)) : 0;
  const cards = set
    ? set.names.map((name, n) => ({
        name,
        main: media(`/api/cards/${name}`, { width: FRAME_WIDTH, height: frameHeight, priority: n === 0 }),
        thumb: media(`/api/cards/${name}`, { width: THUMB_WIDTH, height: Math.round(THUMB_WIDTH * ratio("4 / 5")) }),
      }))
    : [];

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
            {t === "sources" && openClaims > 0 && <Badge tone="alert">{openClaims}</Badge>}
          </Tab>
        ))}
        <Stack direction="row" grow justify="end">
          <KeyHint keys={["[", "]"]} />
        </Stack>
      </Tabs>

      {tab === "write" && <ComposeEditor key={p.id} piece={p} art={art} />}
      {tab === "sources" && <SourcesEditor key={p.id} piece={p} art={art} />}
      {tab === "preview" && <CardPreview key={p.id} cards={cards} setId={set?.id ?? "a"} aspect={set?.aspect ?? "3 / 4"} hasCards={!!p.cards?.length} art={art} />}
      {tab === "review" && <ReviewPanel key={p.id} piece={p} />}
    </Page>
  );
}
