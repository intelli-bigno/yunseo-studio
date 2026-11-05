// 레퍼런스 — docs/design 에 모은 IG·Pinterest·Dribbble 수집분. 내부 참고 전용(그림은 받지 않고 원 주소로 보인다).
// 필터: ?source·?set·?tag, 비교: ?pick=id,id(최대 3) — 칸을 누르면 비교에 넣고 뺀다.
import Link from "next/link";
import { Card, CardHeader, EmptyState, Grid, Cell, Page, PageHeader, SegmentedItem, Segmented, Stack, Text, TextLink, Tile, TileGrid } from "@yunseo/ui";
import { listReferences, type RefItem } from "@/server/library";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<RefItem["source"], string> = { pinterest: "Pinterest", dribbble: "Dribbble", instagram: "Instagram" };
const MAX_PICK = 3;

type Q = { source?: string | undefined; set?: string | undefined; tag?: string | undefined; pick?: string | undefined };
const href = (q: Q) => {
  const p = new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => !!e[1]));
  const s = p.toString();
  return s ? `/references?${s}` : "/references";
};

export default async function ReferencesPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const all = listReferences();
  const sets = [...new Set(all.map((r) => r.set))];
  const sources = [...new Set(all.map((r) => r.source))];
  const pool = all.filter((r) => (!q.source || r.source === q.source) && (!q.set || r.set === q.set));
  const tags = [...new Set(pool.flatMap((r) => r.tags))].slice(0, 12);
  const shown = pool.filter((r) => !q.tag || r.tags.includes(q.tag));
  const pick = (q.pick ?? "").split(",").filter((id) => all.some((r) => r.id === id)).slice(0, MAX_PICK);
  const picked = pick.map((id) => all.find((r) => r.id === id)!);
  const toggle = (id: string) => (pick.includes(id) ? pick.filter((x) => x !== id) : [...pick, id].slice(-MAX_PICK)).join(",");

  return (
    <Page>
      <PageHeader
        title="레퍼런스"
        meta={<Text tone="mute">내부 참고 전용 · {shown.length}/{all.length}</Text>}
        actions={
          <Segmented label="출처">
            <SegmentedItem as={Link} href={href({ ...q, source: undefined, tag: undefined })} current={!q.source}>
              전체
            </SegmentedItem>
            {sources.map((s) => (
              <SegmentedItem key={s} as={Link} href={href({ ...q, source: s, tag: undefined })} current={q.source === s}>
                {SOURCE_LABEL[s]}
              </SegmentedItem>
            ))}
          </Segmented>
        }
      />
      <Stack direction="row" gap={5} wrap align="center">
        <Segmented label="묶음">
          <SegmentedItem as={Link} href={href({ ...q, set: undefined, tag: undefined })} current={!q.set}>
            모든 묶음
          </SegmentedItem>
          {sets.map((s) => (
            <SegmentedItem key={s} as={Link} href={href({ ...q, set: s, tag: undefined })} current={q.set === s}>
              {s}
            </SegmentedItem>
          ))}
        </Segmented>
        {tags.length > 0 && (
          <Stack direction="row" gap={4} wrap align="center">
            {tags.map((t) => (
              <TextLink key={t} as={Link} href={href({ ...q, tag: q.tag === t ? undefined : t })} aria-current={q.tag === t ? "true" : undefined}>
                {q.tag === t ? `● ${t}` : t}
              </TextLink>
            ))}
          </Stack>
        )}
      </Stack>

      {picked.length > 0 && (
        <Card>
          <CardHeader title={`비교 ${picked.length}`} action={<Link href={href({ ...q, pick: undefined })}>비우기</Link>} />
          <Grid>
            {picked.map((r) => (
              <Cell key={r.id} span={picked.length === 1 ? 6 : picked.length === 2 ? 6 : 4}>
                <Stack gap={3}>
                  <Tile as="a" href={r.href} target="_blank" rel="noreferrer noopener" src={r.thumb} alt={r.title} title={r.title} meta={`${SOURCE_LABEL[r.source]} · ${r.set}`} aspect="square" />
                  <Text tone="dim">{r.takeaway}</Text>
                </Stack>
              </Cell>
            ))}
          </Grid>
        </Card>
      )}

      {shown.length === 0 ? (
        <Card>
          <EmptyState title="조건에 맞는 레퍼런스가 없다" action={<Link href="/references">필터 지우기</Link>} />
        </Card>
      ) : (
        <TileGrid>
          {shown.map((r) => (
            <Tile key={r.id} as={Link} href={href({ ...q, pick: toggle(r.id) })} scroll={false} current={pick.includes(r.id)} src={r.thumb} alt={r.title} title={r.title || r.takeaway} meta={`${SOURCE_LABEL[r.source]} · ${r.set}`} />
          ))}
        </TileGrid>
      )}
    </Page>
  );
}
