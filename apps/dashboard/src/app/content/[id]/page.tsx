// 편 상세 — 탭이 한 편의 길 순서다: 작성 → 출처·기준 시점(G2) → 미리보기 → 검수(G3). [ ] 키로 탭 이동.
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardPreview } from "@/components/CardPreview";
import { ComposeEditor } from "@/components/ComposeEditor";
import { ReviewPanel } from "@/components/ReviewPanel";
import { SourcesEditor } from "@/components/SourcesEditor";
import { GateTrack, KindMark, StatusChip } from "@/components/ui";
import { claimIssues } from "@/lib/logic";
import { KIND_LABEL } from "@/lib/model";
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
    <main className="page">
      <div className="eyebrow" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Link href="/content" className="mute">콘텐츠</Link> / <KindMark kind={p.kind} /> {KIND_LABEL[p.kind]} · <span className="mono">{p.id}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, marginTop: 6, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="h1">{p.title}</h1>
          <div className="dim" style={{ marginTop: 6 }}>
            <span className="mono">{fmtSlot(p.slot)} KST</span> · 핵심 관점 — {p.viewpoint || <span className="alert">미정 (G1 에서 한 문장으로)</span>}
          </div>
          {pre && (
            <div className="mute" style={{ marginTop: 4, fontSize: "var(--fs-sm)" }}>
              이전 편 <Link className="accent" href={`/content/${pre.id}`}>{pre.id} {pre.title}</Link>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <GateTrack piece={p} large />
          <StatusChip status={p.status} />
        </div>
      </div>
      {p.blocker && <div className="alert" style={{ marginTop: 10, fontSize: "var(--fs-sm)" }}>× {p.blocker}</div>}

      <nav className="tabs" data-tabs data-prev={href(stepTab(tab, -1))} data-next={href(stepTab(tab, 1))}>
        {DETAIL_TABS.map((t) => (
          <Link key={t} href={href(t)} aria-current={t === tab ? "page" : undefined}>
            {DETAIL_TAB_LABEL[t]}
            {t === "sources" && open > 0 && <span className="chip chip-solid">{open}</span>}
            {t === "sources" && <span className="mono mute">G2</span>}
            {t === "review" && <span className="mono mute">G3</span>}
          </Link>
        ))}
        <span style={{ marginLeft: "auto", alignSelf: "center" }} className="mute">
          <kbd className="kbd">[</kbd> <kbd className="kbd">]</kbd> 탭 이동
        </span>
      </nav>

      {tab === "write" && <ComposeEditor key={p.id} piece={p} />}
      {tab === "sources" && <SourcesEditor key={p.id} piece={p} />}
      {tab === "preview" && <CardPreview key={p.id} piece={p} />}
      {tab === "review" && <ReviewPanel key={p.id} piece={p} />}
    </main>
  );
}
