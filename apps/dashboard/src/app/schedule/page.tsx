// 편성 캘린더 — 주(기본)·월. 칸당 피드 1 + 스토리·연구. 오른쪽 레일: 이번 주의 변수 + 사건 후보함(G1).
import Link from "next/link";
import { CandidateList } from "@/components/CandidateList";
import { KindMark } from "@/components/ui";
import { addDays, currentGate, weekDates, weekday } from "@/lib/logic";
import { KIND_LABEL, MARK_GLYPH, STATUS_LABEL } from "@/lib/model";
import { EVENT_CANDIDATES, PIECES, TODAY, WEEK_START, WEEK_VARIABLES } from "@/lib/mock";
import { isoWeek } from "@/lib/format";

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const month = view === "month";
  const days = month ? Array.from({ length: 35 }, (_, i) => addDays("2026-10-26", i)) : weekDates(WEEK_START);

  return (
    <main className="page">
      <div className="masthead" style={{ gridTemplateColumns: "1fr auto" }}>
        <div className="meta">
          <span className="eyebrow">Schedule · W{isoWeek(WEEK_START)}</span>
          <h1 className="h1">{month ? "2026년 11월" : "11월 2일 — 8일"}</h1>
          <span className="dim">채운 칸보다 빈 칸의 이유가 중요하다. 같은 날 이전 편 둘·자료 대기 3일째는 알리기만 한다.</span>
        </div>
        <div className="seg" role="tablist" aria-label="보기">
          <Link href="/schedule" aria-current={!month ? "page" : undefined}>주</Link>
          <Link href="/schedule?view=month" aria-current={month ? "page" : undefined}>월</Link>
        </div>
      </div>

      <div className="split" style={{ marginTop: "var(--sp-8)" }}>
        <div className={`cal${month ? " cal-month" : ""}`}>
          {days.map((d) => {
            const ps = PIECES.filter((p) => p.slot.startsWith(d)).sort((a, b) => a.slot.localeCompare(b.slot));
            const cls = d === TODAY ? " cal-today" : d < TODAY ? " cal-past" : "";
            return (
              <div key={d} className={`cal-day${cls}`}>
                <div className="cal-day-head">
                  <span className="cal-num">{Number(d.slice(8, 10))}</span>
                  <span className="cal-dow">{weekday(d)}</span>
                </div>
                {ps.map((p) => {
                  const g = currentGate(p);
                  return (
                    <Link key={p.id} href={`/content/${p.id}`} className={`slot${p.kind === "pre" || p.kind === "post" ? " slot-solid" : ""}`} title={`${KIND_LABEL[p.kind]} · ${p.title}`}>
                      <span className="slot-head">
                        <span>{p.slot.slice(11, 16)}</span>
                        <span>{g ? `${g}` : STATUS_LABEL[p.status]}</span>
                      </span>
                      {!month && (
                        <>
                          <span className="slot-title">{p.title}</span>
                          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <KindMark kind={p.kind} />
                            <span className="mute">{STATUS_LABEL[p.status]}</span>
                          </span>
                        </>
                      )}
                    </Link>
                  );
                })}
                {!month && ps.length === 0 && d >= TODAY && (
                  <span className="slot slot-empty">
                    <span>빈 날</span>
                    <span className="mute">쉬는 날로 두기 · 연구 배정</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <aside>
          <div className="section-head" style={{ paddingTop: 0 }}>
            <h2 className="h2">이번 주의 변수</h2>
            <Link href="/content/S-W45">스토리 →</Link>
          </div>
          <div className="rows">
            {WEEK_VARIABLES.map((v) => (
              <div key={v.label} className="row cols-var">
                <div>
                  <div className="display" style={{ fontSize: 28 }}>{v.date.slice(8, 10)}</div>
                  <div className="mute" style={{ fontSize: "var(--fs-xs)" }}>{weekday(v.date)} {v.time} {v.tz}</div>
                </div>
                <div>
                  <div><span className="mark">{MARK_GLYPH[v.mark]}</span>{v.label}</div>
                  <div className="row-sub">{v.importance} · {v.source}{v.closedBy ? ` · 닫음 ${v.closedBy}` : ""}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="section-head" style={{ marginTop: "var(--sp-8)" }}>
            <h2 className="h2">사건 후보함</h2>
            <span className="eyebrow">G1 · 사람이 판정</span>
          </div>
          <CandidateList initial={EVENT_CANDIDATES} />
        </aside>
      </div>
    </main>
  );
}
