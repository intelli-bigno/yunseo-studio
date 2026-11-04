// 발행 대기열 — 승인본을 내보내고 기록. MVP 는 수동 게시(묶음 받기·캡션 복사·URL 기록) — 자동 게시 없음.
import Link from "next/link";
import { KindMark, QueueChip } from "@/components/ui";
import { queueState, queueSummary } from "@/lib/logic";
import { PIECES, QUEUE } from "@/lib/mock";
import { fmtSlot } from "@/lib/format";

export default function PublishPage() {
  const s = queueSummary(QUEUE);
  return (
    <main className="page">
      <section className="masthead">
        <div className="display day" style={{ fontSize: "var(--fs-display)" }}>{String(QUEUE.length).padStart(2, "0")}</div>
        <div className="meta">
          <span className="eyebrow">Publish</span>
          <h1 className="h1">발행 대기열</h1>
          <span className="dim">게시는 사람이 한다 — 승인 해시가 지금 산출물과 같을 때만 내보낸다.</span>
        </div>
        <div className="stats">
          <div className="stat"><div className="stat-n accent">{s.ready}</div><div className="stat-l">준비됨</div></div>
          <div className="stat"><div className="stat-n">{s.needs_g3}</div><div className="stat-l">G3 대기</div></div>
          <div className="stat"><div className="stat-n alert">{s.mismatch}</div><div className="stat-l">불일치</div></div>
        </div>
      </section>
      <div className="table-head cols-queue" style={{ marginTop: "var(--sp-7)" }}>
        <span>채널</span><span>종</span><span>편</span><span>슬롯</span><span>해시 (승인 → 현재)</span><span>상태</span>
      </div>
      <div className="rows">
        {QUEUE.map((q) => {
          const p = PIECES.find((x) => x.id === q.pieceId)!;
          const st = queueState(q);
          return (
            <Link key={q.pieceId + q.channel} href={st === "needs_g3" || st === "mismatch" ? `/content/${p.id}?tab=review` : `/content/${p.id}?tab=preview`} className="row cols-queue">
              <span className="mono mute">{q.channel}</span>
              <KindMark kind={p.kind} />
              <span className="row-title">{p.title}</span>
              <span className="mono mute">{fmtSlot(p.slot).slice(0, 5)}</span>
              <span className="mono" style={{ fontSize: "var(--fs-xs)" }}>
                <span className="mute">{q.approvedHash ?? "————————"}</span> → <span className={st === "mismatch" ? "alert" : ""}>{q.currentHash}</span>
              </span>
              <QueueChip s={st} />
            </Link>
          );
        })}
      </div>
      <p className="mute" style={{ marginTop: 16, fontSize: "var(--fs-xs)" }}>
        자동 게시·외부 계정 연결은 이 단계에 없다(06 §6 자동화 단계).
      </p>
    </main>
  );
}
