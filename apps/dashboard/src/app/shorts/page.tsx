// 쇼츠 — 원고별로 만든 릴스(1080×1920 MP4) 목록 · 9:16 재생 · 내려받기. 요청마다 산출물 폴더를 읽는다.
import Link from "next/link";
import { Button, Card, CardHeader, EmptyState, List, ListItem, Page, PageHeader, PlatformIcon, Split, Stack, StoryPlayer, Text, Tile, TileGrid } from "@yunseo/ui";
import { fmtBytes, fmtKst } from "@/lib/ops-format";
import { listReels } from "@/server/library";

export const dynamic = "force-dynamic";

const asset = (pieceId: string, renderId: string, kind: "video" | "cover") => `/api/reels/${pieceId}/${renderId}/${kind}`;

export default async function ShortsPage({ searchParams }: { searchParams: Promise<{ id?: string; v?: string }> }) {
  const { id, v } = await searchParams;
  const groups = await listReels();
  const group = groups.find((g) => g.pieceId === id) ?? groups[0];
  const version = group?.versions.find((x) => x.renderId === v) ?? group?.versions[0];
  return (
    <Page>
      <PageHeader title="쇼츠" meta={<Text tone="mute" mono>{groups.length}편</Text>} />
      {!group || !version ? (
        <Card>
          <EmptyState title="아직 만든 쇼츠가 없다" action={<Button as={Link} href="/content">콘텐츠로</Button>} />
        </Card>
      ) : (
        <Split
          rail={
            <Card>
              <CardHeader title={group.title} />
              <StoryPlayer key={version.renderId} src={asset(group.pieceId, version.renderId, "video")} poster={version.hasCover ? asset(group.pieceId, version.renderId, "cover") : undefined} label={group.title} />
              <Stack direction="row" gap={4} align="center">
                <PlatformIcon platform="instagram" label />
                <PlatformIcon platform="youtube" label />
              </Stack>
              <Stack direction="row" gap={3}>
                <Button as="a" href={`${asset(group.pieceId, version.renderId, "video")}?dl=1`} download variant="primary">
                  내려받기
                </Button>
                <Button as={Link} href={`/content/${group.pieceId}`}>
                  원고
                </Button>
              </Stack>
              {group.versions.length > 1 && (
                <List>
                  {group.versions.map((x) => (
                    <ListItem key={x.renderId} as={Link} href={`/shorts?id=${group.pieceId}&v=${x.renderId}`} current={x.renderId === version.renderId} title={fmtKst(x.at)} meta={`${x.renderId} · ${fmtBytes(x.bytes)}`} />
                  ))}
                </List>
              )}
            </Card>
          }
        >
          <TileGrid>
            {groups.map((g) => {
              const top = g.versions[0]!;
              return (
                <Tile
                  key={g.pieceId}
                  as={Link}
                  href={`/shorts?id=${g.pieceId}`}
                  current={g.pieceId === group.pieceId}
                  aspect="story"
                  src={top.hasCover ? asset(g.pieceId, top.renderId, "cover") : "/img/empty.jpg"}
                  alt=""
                  title={g.title}
                  meta={`${g.pieceId} · ${fmtKst(top.at)}`}
                />
              );
            })}
          </TileGrid>
        </Split>
      )}
    </Page>
  );
}
