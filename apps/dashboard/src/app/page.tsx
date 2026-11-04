// 오늘 — 시작 화면. 지금 내가 할 일만(06 §2). 모든 항목은 클릭 1번에 해당 작업 탭으로 간다.
import Link from "next/link";
import { GateTrack, KindMark, QueueChip, StatusChip } from "@/components/ui";
import { addDays, awaitingMe, blocked, currentGate, queueState, queueSummary } from "@/lib/logic";
import { GATE_LABEL, MARK_GLYPH, type Piece } from "@/lib/model";
import { PIECES, QUEUE, TODAY, WEEK_VARIABLES } from "@/lib/mock";
import { fmtDay, fmtSlot } from "@/lib/format";

const tabFor = (p: Piece) => {
  const g = currentGate(p);
  if (p.status === "evidence_wait") return "write";
  return g === "G2" ? "sources" : g === "G3" ? "review" : "write";
};

function PieceRow({ p, note }: { p: Piece; note?: string | null }) {
  return (
    <Link href={`/content/${p.id}?tab=${tabFor(p)}`} className="row cols-piece">
      <span className="mono mute">{fmtSlot(p.slot).slice(0, 8)}</span>
      <KindMark kind={p.kind} />
      <span style={{ minWidth: 0 }}>
        <div className="row-title">{p.title}</div>
        {note && <div className="row-sub alert">{note}</div>}
      </span>
      <GateTrack piece={p} />
      <StatusChip status={p.status} />
    </Link>
  );
}

export default function TodayPage() {
  const mine = awaitingMe(PIECES);
  const stuck = blocked(PIECES);
  const todaySlots = PIECES.filter((p) => p.slot.startsWith(TODAY));
  const next3 = [1, 2, 3].map((n) => addDays(TODAY, n));
  const q = queueSummary(QUEUE);
  const day = TODAY.slice(8, 10);

  return (
    <main className="page">
      <section className="masthead">
        <div className="display day">{day}</div>
        <div className="meta">
          <span className="eyebrow">Today · {fmtDay(TODAY)}</span>
          <h1 className="h1">오늘 통과시킬 게이트 {mine.length}, 막힌 편 {stuck.length}.</h1>
          <span className="dim">채우려고 내지 않는다 — 빈 날은 쉬는 날로 둬도 된다.</span>
        </div>
        <div className="stats">
          <div className="stat">
            <div className="stat-n">{mine.length}</div>
            <div className="stat-l">내 게이트</div>
          </div>
          <div className="stat">
            <div className="stat-n alert">{stuck.length}</div>
            <div className="stat-l">막힌 편</div>
          </div>
          <div className="stat">
            <div className="stat-n accent">{q.ready}</div>
            <div className="stat-l">내보낼 준비</div>
          </div>
        </div>
      </section>

      <div className="split">
        <div>
          <section className="section">
            <div className="section-head">
              <h2 className="h2">막힌 편</h2>
              <span className="eyebrow">어느 게이트에서 무엇이 비었나</span>
            </div>
            <div className="rows">
              {stuck.map((p) => (
                <PieceRow key={p.id} p={p} note={p.blocker} />
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2 className="h2">내가 통과시킬 게이트</h2>
              <span className="eyebrow">사람만 누른다</span>
            </div>
            <div className="rows">
              {mine.map((p) => {
                const g = currentGate(p);
                return <PieceRow key={p.id} p={p} note={g ? `${g} · ${GATE_LABEL[g]} 대기` : null} />;
              })}
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2 className="h2">오늘 슬롯 · 다음 3일</h2>
              <Link href="/schedule">편성 캘린더 →</Link>
            </div>
            <div className="rows">
              {todaySlots.map((p) => (
                <PieceRow key={p.id} p={p} />
              ))}
              {next3.map((d) => {
                const ps = PIECES.filter((p) => p.slot.startsWith(d));
                return ps.length ? (
                  ps.map((p) => <PieceRow key={p.id} p={p} />)
                ) : (
                  <Link key={d} href="/schedule" className="row cols-piece">
                    <span className="mono mute">{fmtDay(d)}</span>
                    <span />
                    <span className="mute">빈 날 — 쉬는 날로 두기 · 연구 배정</span>
                    <span />
                    <span />
                  </Link>
                );
              })}
            </div>
          </section>
        </div>

        <aside>
          <section className="section">
            <div className="section-head">
              <h2 className="h2">이번 주의 변수</h2>
              <Link href="/schedule">주 보기 →</Link>
            </div>
            <div className="rows">
              {WEEK_VARIABLES.map((v) => (
                <div key={v.label} className="row cols-var">
                  <div>
                    <div className="display" style={{ fontSize: 26 }}>{v.date.slice(8, 10)}</div>
                    <div className="mute" style={{ fontSize: "var(--fs-xs)" }}>{fmtDay(v.date).slice(6)} {v.time}</div>
                  </div>
                  <div>
                    <div>
                      <span className="mark" title={v.mark}>{MARK_GLYPH[v.mark]}</span>
                      {v.label}
                      {v.importance === "major" && <span className="chip chip-accent" style={{ marginLeft: 6 }}>major</span>}
                    </div>
                    <div className="row-sub">
                      {v.source}
                      {v.closedBy && (
                        <>
                          {" "}· 닫음 <Link className="accent" href={`/content/${v.closedBy}`}>{v.closedBy}</Link>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2 className="h2">발행 대기열</h2>
              <Link href="/publish">전체 →</Link>
            </div>
            <div className="rows">
              {QUEUE.map((item) => {
                const p = PIECES.find((x) => x.id === item.pieceId)!;
                const s = queueState(item);
                return (
                  <Link key={item.pieceId + item.channel} href={s === "needs_g3" ? `/content/${p.id}?tab=review` : "/publish"} className="row" style={{ gridTemplateColumns: "30px minmax(0,1fr) auto" }}>
                    <span className="mono mute" style={{ fontSize: "var(--fs-micro)" }}>{item.channel}</span>
                    <span className="row-title">{p.title}</span>
                    <QueueChip s={s} />
                  </Link>
                );
              })}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

