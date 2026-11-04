// 콘텐츠 — 3종(이전·이후·연구) + 스토리 목록. 행 클릭 → 편 상세(지금 게이트의 탭).
import Link from "next/link";
import { GateTrack, KindMark, StatusChip } from "@/components/ui";
import { currentGate } from "@/lib/logic";
import { KIND_LABEL, type Kind } from "@/lib/model";
import { PIECES } from "@/lib/mock";
import { fmtSlot } from "@/lib/format";

const KINDS: (Kind | "all")[] = ["all", "pre", "post", "research", "story"];

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind = "all" } = await searchParams;
  const list = PIECES.filter((p) => kind === "all" || p.kind === kind).sort((a, b) => b.slot.localeCompare(a.slot));
  return (
    <main className="page">
      <div className="masthead" style={{ gridTemplateColumns: "1fr auto" }}>
        <div className="meta">
          <span className="eyebrow">Content</span>
          <h1 className="h1">콘텐츠 3종</h1>
          <span className="dim">01 이전 — 일어나기 전에 / 02 이후 — 무엇이 달라졌나 / 03 연구 — 어떻게 판단하나</span>
        </div>
        <div className="seg">
          {KINDS.map((k) => (
            <Link key={k} href={k === "all" ? "/content" : `/content?kind=${k}`} aria-current={kind === k ? "page" : undefined}>
              {k === "all" ? "전체" : KIND_LABEL[k]}
            </Link>
          ))}
        </div>
      </div>
      <div className="table-head cols-piece" style={{ marginTop: "var(--sp-7)" }}>
        <span>슬롯</span>
        <span>종</span>
        <span>제목 · 핵심 관점</span>
        <span>게이트</span>
        <span>상태</span>
      </div>
      <div className="rows">
        {list.map((p) => {
          const g = currentGate(p);
          const tab = g === "G2" ? "sources" : g === "G3" ? "review" : "write";
          return (
            <Link key={p.id} href={`/content/${p.id}?tab=${tab}`} className="row cols-piece">
              <span className="mono mute">{fmtSlot(p.slot).slice(0, 8)}</span>
              <KindMark kind={p.kind} />
              <span style={{ minWidth: 0 }}>
                <div className="row-title">{p.title}</div>
                <div className="row-sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span className="mono">{p.id}</span> · {p.viewpoint || "핵심 관점 미정 — G1 대기"}
                </div>
              </span>
              <GateTrack piece={p} />
              <StatusChip status={p.status} />
            </Link>
          );
        })}
      </div>
    </main>
  );
}
