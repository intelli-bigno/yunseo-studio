// 편 상세 — 탭이 한 편의 길 순서다: 작성 → 출처(G2) → 연결 → 이력 → 미리보기·묶음 → 검수(G3). [ ] 키로 탭 이동.
// 렌더 전략: 서버 렌더(요청마다, ?tab 쿼리). 머리·탭·이력은 서버 컴포넌트(JS 없음), 열린 탭의 편집기만 클라이언트 섬이다.
// [L2] 데이터는 쓰기 유스케이스(authoring)의 읽기 모델 — 저장 버전·게이트 기록·막는 이유를 서버가 계산해 넘긴다. 저장·게이트는 서버 액션(actions.ts).
import Link from "next/link";
import { notFound } from "next/navigation";
import { space } from "@yunseo/design-tokens";
import { Badge, Card, CardHeader, EmptyState, KeyHint, List, ListItem, Notice, Page, PageHeader, Stack, Tab, Tabs, Text, TextLink } from "@yunseo/ui";
import { ComposeEditor } from "@/components/ComposeEditor";
import { GatePanel } from "@/components/GatePanel";
import { LinkPanel } from "@/components/LinkPanel";
import { PipelinePanel } from "@/components/PipelinePanel";
import { ReviewPanel } from "@/components/ReviewPanel";
import { SourcesEditor } from "@/components/SourcesEditor";
import { GateTrack, KindMark, StatusChip } from "@/components/ui";
import { fmtSlot } from "@/lib/format";
import { g3Issues } from "@/lib/gate-view";
import { emptyMedia } from "@/lib/media";
import { DETAIL_TAB_LABEL, DETAIL_TABS, isDetailTab, stepTab } from "@/lib/shortcuts";
import { authoring, operatorName, pipeline } from "@/server/studio";

const FRAME_WIDTH = space[8] * 7; // ui 카드 틀 폭(styles.css .ui-card-frame)
const THUMB_WIDTH = space[7]; // ui 썸네일 폭(.ui-thumb)
const CHANGE_LABEL: Record<string, string> = { create: "만듦", edit: "저장", confirm: "문장 확인", correction: "정정", update: "갱신", clarification: "명확화" };

export default async function PiecePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const view = await authoring().getAuthoring(id);
  if (!view) notFound();
  const { piece: p, preIssue: pre, revision } = view;
  const tab = isDetailTab(rawTab) ? rawTab : "write";
  const href = (t: string) => `/content/${p.id}?tab=${t}`;
  const art = emptyMedia();
  const actor = operatorName();
  const openClaims = Object.values(view.claimIssues).filter((x) => x.length > 0).length + p.claims.filter((c) => !c.verified && (view.claimIssues[c.id]?.length ?? 0) === 0).length;
  const history = tab === "history" ? await authoring().history(p.id) : [];
  const flow = tab === "preview" ? await pipeline().status(p.id) : null;
  // 미리보기: 렌더한 카드 주소·크기를 서버가 정해 HTML 에 바로 싣는다(이미지 최적화기를 거치지 않는 원본 PNG — 렌더 산출물은 자주 바뀐다)
  const cards = (flow?.render?.cards ?? []).map((c, n) => ({
    name: c.name,
    alt: flow?.render?.altTexts[n] ?? "",
    main: { src: `/api/pieces/${p.id}/cards/${n + 1}`, width: FRAME_WIDTH, height: Math.round((FRAME_WIDTH * 5) / 4), priority: n === 0 },
    thumb: { src: `/api/pieces/${p.id}/cards/${n + 1}`, width: THUMB_WIDTH, height: Math.round((THUMB_WIDTH * 5) / 4) },
  }));

  return (
    <Page>
      <PageHeader
        meta={
          <Stack direction="row" gap={2} align="center">
            <TextLink as={Link} href="/content">콘텐츠</TextLink>
            <KindMark kind={p.kind} />
            <Text size="label" tone="mute" mono>{fmtSlot(p.slot)}</Text>
            {pre && <TextLink as={Link} href={`/content/${pre.id}?tab=link`}>이전 편 {pre.id}</TextLink>}
            {view.linkedPosts.map((x) => (
              <TextLink key={x.id} as={Link} href={`/content/${x.id}?tab=link`}>이후 편 {x.id}</TextLink>
            ))}
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
      {p.kind !== "story" && <GatePanel key={p.id} pieceId={p.id} kind={p.kind} revision={revision} actor={actor} actions={view.actions} />}

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

      {tab === "write" && <ComposeEditor key={`${p.id}-${revision}`} piece={p} revision={revision} actor={actor} blockers={view.blockers} preIssueOptions={view.preIssueOptions} art={art} />}
      {tab === "sources" && <SourcesEditor key={`${p.id}-${revision}`} piece={p} revision={revision} actor={actor} art={art} />}
      {tab === "link" && <LinkPanel key={`${p.id}-${revision}`} piece={p} revision={revision} actor={actor} preIssue={pre} linkedPosts={view.linkedPosts} art={art} />}
      {tab === "history" && (
        <Card>
          <CardHeader title="수정 이력 — 누가·언제·무엇이·이유" action={<Badge>{`버전 ${revision}`}</Badge>} />
          {history.length === 0 ? (
            <EmptyState media={art} title="이력 없음(버전 표 도입 전에 만든 편)" />
          ) : (
            <List>
              {history.map((h) => (
                <ListItem
                  key={h.revision}
                  leading={<Text size="label" tone="mute" mono>{`v${h.revision}`}</Text>}
                  title={`${h.changeKind.startsWith("action:") ? h.changeKind.slice(7) : (CHANGE_LABEL[h.changeKind] ?? h.changeKind)} · ${h.actor} · ${h.at.replace("T", " ")}`}
                  meta={[h.reason && `이유: ${h.reason}`, h.readerNote && `독자 문구: ${h.readerNote}`, h.followUp && `후속: ${h.followUp}`, h.changes.map((c) => (c.path === "status" ? `상태 ${c.before} → ${c.after}` : c.path)).join(", ")].filter(Boolean).join(" · ")}
                  trailing={<Text size="label" tone="mute" mono>{h.contentHash.slice(0, 8)}</Text>}
                />
              ))}
            </List>
          )}
        </Card>
      )}
      {tab === "preview" && flow && (
        <PipelinePanel
          key={`${p.id}-${revision}`}
          pieceId={p.id}
          steps={flow.steps}
          stale={flow.stale}
          documentErrors={flow.documentErrors}
          cards={cards}
          caption={flow.render?.caption ?? null}
          hashtags={flow.render?.hashtags ?? []}
          warnings={[...(flow.render?.warnings ?? []), ...(flow.reel?.warnings ?? [])]}
          bundle={flow.bundle ? { name: flow.bundle.zip.name, bytes: flow.bundle.zip.bytes, sha256: flow.bundle.zip.sha256 } : null}
        />
      )}
      {tab === "review" && <ReviewPanel key={`${p.id}-${revision}`} piece={p} revision={revision} actor={actor} checklist={view.checklist} contentHash={view.contentHash} g3={view.gates.G3} preIssue={pre} issues={g3Issues(view.actions)} />}
    </Page>
  );
}
