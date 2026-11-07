"use client";
// 릴스 편집기 — 위쪽 큰 9:16 미리보기, 아래 유동 패널(타임라인·인스펙터·자산·효과, 끌어서 크기 조절·접기).
// 모든 편집은 POST /api/reels/:id/ops 로만 보낸다(사람 화면과 AI 가 같은 명령). 저장 버튼은 없다 — op 하나가 곧 저장·되돌리기 한 단위다.
// 단축키: Space 재생 · S 자르기 · Delete 삭제(Shift = 잔물결) · I/O 구간 표시 · ⌘Z 실행취소 · ⌘⇧Z 다시.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, EmptyState, Notice, Select, Stack, Tab, Tabs, Text } from "@yunseo/ui";
import { ReelsStage, ReelsWorkspace } from "@yunseo/ui/reels";
import { splitOps } from "../_lib/ops";
import { buildPreview } from "../_lib/preview";
import { toV2 } from "../_lib/project";
import { fmtTime, projectEnd, splitTargets } from "../_lib/timeline";
import type { Clip, ReelsProjectV2, SourceRef } from "../_lib/types";
import { useEditor } from "../_lib/use-editor";
import { AssetsPanel } from "./AssetsPanel";
import { EffectsPanel } from "./EffectsPanel";
import { InspectorPanel } from "./InspectorPanel";
import { TimelinePanel } from "./TimelinePanel";

export interface ReelsEditorProps {
  projects: { id: string; title: string; updatedAt: string }[];
  /** project 는 v1·v2 어느 쪽이든 받는다(서버가 v2 로 올려 주기 전에도 열리게) */
  current: { id: string; project: unknown; revision: number } | null;
  sources: SourceRef[];
}

type TabId = "timeline" | "inspector" | "assets" | "effects";
const TABS: { id: TabId; label: string }[] = [
  { id: "timeline", label: "타임라인" },
  { id: "inspector", label: "인스펙터" },
  { id: "assets", label: "자산" },
  { id: "effects", label: "효과" },
];
const ZOOMS = [1, 2, 4, 8, 16];
const DOCK_KEY = "reels.dock";

export function ReelsEditor({ projects, current, sources }: ReelsEditorProps) {
  const initial = useMemo(() => (current ? toV2(current.project) : null), [current]);
  if (!current || !initial) return <ProjectPicker projects={projects} problem={current ? "프로젝트 모양을 읽지 못했다" : null} />;
  return <Editor key={current.id} projects={projects} id={current.id} initial={{ project: initial, revision: current.revision }} sources={sources} />;
}

function ProjectPicker({ projects, problem }: { projects: ReelsEditorProps["projects"]; problem: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(problem);
  const create = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/reels/projects", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = (await r.json()) as { id?: string; error?: string };
      if (!r.ok || !body.id) throw new Error(body.error);
      router.push(`/reels?p=${body.id}`);
    } catch {
      setError("만들기 실패");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack direction="row" gap={3} align="center" wrap>
      {error && <Notice>{error}</Notice>}
      {projects.length > 0 && (
        <Select aria-label="프로젝트" value="" onChange={(e) => e.target.value && router.push(`/reels?p=${e.target.value}`)}>
          <option value="">프로젝트 고르기</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </Select>
      )}
      <Button variant="primary" onClick={() => void create()} disabled={busy}>새 릴스</Button>
    </Stack>
  );
}

function Editor({ projects, id, initial, sources }: { projects: ReelsEditorProps["projects"]; id: string; initial: { project: ReelsProjectV2; revision: number }; sources: SourceRef[] }) {
  const router = useRouter();
  const ed = useEditor(id, initial);
  const { project } = ed;
  const [tab, setTab] = useState<TabId>("timeline");
  const [clipId, setClipId] = useState<string | null>(null);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [marks, setMarks] = useState<{ in: number | null; out: number | null }>({ in: null, out: null });
  const [draft, setDraft] = useState<Clip | null>(null);
  const [height, setHeight] = useState(0.38);
  const [collapsed, setCollapsed] = useState(false);

  // 패널 크기 기억 — 브라우저 저장소가 막혀 있어도 화면은 그대로 열린다
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DOCK_KEY);
      const v = raw ? (JSON.parse(raw) as { height?: number; collapsed?: boolean }) : null;
      if (v && typeof v.height === "number") setHeight(v.height);
      if (v && typeof v.collapsed === "boolean") setCollapsed(v.collapsed);
    } catch {
      /* 저장소 없음 */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(DOCK_KEY, JSON.stringify({ height, collapsed }));
    } catch {
      /* 저장소 없음 */
    }
  }, [height, collapsed]);

  const duration = projectEnd(project);
  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const base = clipId ? project.clips.find((c) => c.id === clipId) ?? null : null;
  const clip = base && draft && draft.id === base.id ? draft : base;
  const track = (trackId ? project.tracks.find((t) => t.id === trackId) : null) ?? null;

  // 재생 시계 — 화면 갱신마다 경과 시간만큼 플레이헤드를 민다. 끝에 닿으면 멈춘다
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      setTime((t) => {
        const next = t + dt;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration]);

  const items = useMemo(() => buildPreview(project, time, { playing, sources: sourceById, ...(draft ? { draft: new Map([[draft.id, draft]]) } : {}) }), [project, time, playing, sourceById, draft]);

  // ── 동작 ──
  const togglePlay = () => {
    if (duration === 0) return;
    if (!playing && time >= duration) setTime(0);
    setPlaying((p) => !p);
  };
  const split = () => {
    const op = splitOps(splitTargets(project, base, time), time);
    if (op) void ed.send(op);
    else ed.notify({ tone: "alert", text: "자를 클립이 없다" });
  };
  const remove = (ripple: boolean) => {
    if (!base) return;
    void ed.send({ op: "remove_clip", clipId: base.id, ripple }).then((r) => r && setClipId(null));
  };
  const cut = () => {
    if (marks.in === null || marks.out === null) return;
    const from = Math.min(marks.in, marks.out);
    const to = Math.max(marks.in, marks.out);
    if (to - from < 1) return;
    void ed.send({ op: "ripple_delete", ranges: [{ from, to }] }).then((r) => r && setMarks({ in: null, out: null }));
  };
  const undo = () => void ed.send({ op: "undo" });
  const redo = () => void ed.send({ op: "redo" });
  const mark = (side: "in" | "out") => setMarks((m) => ({ ...m, [side]: Math.round(time) }));

  const create = async () => {
    try {
      const r = await fetch("/api/reels/projects", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = (await r.json()) as { id?: string };
      if (!r.ok || !body.id) throw new Error();
      router.push(`/reels?p=${body.id}`);
    } catch {
      ed.notify({ tone: "alert", text: "만들기 실패" });
    }
  };
  const destroy = async () => {
    if (!window.confirm("이 프로젝트를 지울까?")) return;
    try {
      const r = await fetch(`/api/reels/projects/${id}`, { method: "DELETE" });
      if (r.ok) router.push("/reels");
      else ed.notify({ tone: "alert", text: "지우기 실패" });
    } catch {
      ed.notify({ tone: "alert", text: "지우기 실패 — 연결을 확인" });
    }
  };

  // 단축키 — 입력 칸에서는 ⌘Z 만 브라우저에 맡기고 나머지는 먹지 않는다
  const keys = useRef({ togglePlay, split, remove, undo, redo, mark, cut });
  keys.current = { togglePlay, split, remove, undo, redo, mark, cut };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === "z") {
        e.preventDefault();
        if (e.shiftKey) keys.current.redo();
        else keys.current.undo();
      } else if (e.ctrlKey && k === "y") {
        e.preventDefault();
        keys.current.redo();
      } else if (e.metaKey || e.ctrlKey || e.altKey) return;
      else if (e.key === " ") {
        e.preventDefault();
        keys.current.togglePlay();
      } else if (k === "s") keys.current.split();
      else if (k === "i") keys.current.mark("in");
      else if (k === "o") keys.current.mark("out");
      else if (k === "x") keys.current.cut();
      else if (e.key === "Delete" || e.key === "Backspace") keys.current.remove(e.shiftKey);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const panel = { ed, sources, clip, track, time, setDraft } as const;
  const hasRange = marks.in !== null && marks.out !== null && marks.in !== marks.out;

  return (
    <ReelsWorkspace
      label="편집 패널"
      height={height}
      onHeight={setHeight}
      collapsed={collapsed}
      onCollapsed={setCollapsed}
      top={
        <>
          <Stack direction="row" gap={3} align="center" wrap>
            <Select aria-label="프로젝트" value={id} onChange={(e) => router.push(`/reels?p=${e.target.value}`)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </Select>
            <Button onClick={() => void create()}>새 릴스</Button>
          </Stack>
          {ed.message && <Notice tone={ed.message.tone}>{ed.message.text}</Notice>}
          <Stack direction="row" gap={3} align="center" wrap>
            <Text tone="mute" mono>{ed.pending > 0 ? "보내는 중…" : `${ed.revision}판`}</Text>
            <Button variant="ghost" onClick={() => void destroy()}>프로젝트 지우기</Button>
          </Stack>
        </>
      }
      stage={<ReelsStage items={items} playing={playing} label="9:16 미리보기" empty="클립을 추가" />}
      tools={
        <>
          <Stack direction="row" gap={2} align="center" wrap>
            <Button onClick={undo} disabled={!ed.undo.available} title="⌘Z">실행취소</Button>
            <Button onClick={redo} disabled={!ed.undo.redo} title="⌘⇧Z">다시</Button>
            <Button variant="primary" onClick={togglePlay} disabled={duration === 0} title="Space">{playing ? "정지" : "재생"}</Button>
            <Button onClick={() => { setPlaying(false); setTime(0); }}>처음으로</Button>
            <Text tone="mute" mono>{fmtTime(time)} / {fmtTime(duration)}</Text>
          </Stack>
          <Stack direction="row" gap={2} align="center" wrap>
            <Button onClick={split} title="S">자르기</Button>
            <Button onClick={() => remove(false)} disabled={!base} title="Delete">삭제</Button>
            <Button onClick={() => remove(true)} disabled={!base} title="⇧Delete">잔물결 삭제</Button>
            <Button onClick={() => mark("in")} title="I">구간 시작</Button>
            <Button onClick={() => mark("out")} title="O">구간 끝</Button>
            <Button onClick={cut} disabled={!hasRange} title="X">구간 잘라내기</Button>
          </Stack>
        </>
      }
      tabs={
        <Tabs>
          {TABS.map((t) => (
            <Tab key={t.id} as="button" type="button" current={tab === t.id} onClick={() => { setTab(t.id); setCollapsed(false); }}>
              {t.label}
            </Tab>
          ))}
        </Tabs>
      }
      dockActions={
        tab === "timeline" ? (
          <>
            <Button variant="ghost" onClick={() => setZoom((z) => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)] ?? 1)} disabled={zoom <= 1} aria-label="축소">−</Button>
            <Text tone="mute" mono>{zoom}x</Text>
            <Button variant="ghost" onClick={() => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)] ?? z)} disabled={zoom >= ZOOMS[ZOOMS.length - 1]!} aria-label="확대">+</Button>
          </>
        ) : null
      }
    >
      {tab === "timeline" && (
        <TimelinePanel
          ed={ed}
          sources={sources}
          clipId={clipId}
          trackId={trackId}
          onClip={setClipId}
          onTrack={setTrackId}
          time={time}
          onTime={(t) => { setPlaying(false); setTime(t); }}
          zoom={zoom}
          marks={marks}
          playing={playing}
        />
      )}
      {tab === "inspector" && <InspectorPanel {...panel} />}
      {tab === "assets" && <AssetsPanel {...panel} />}
      {tab === "effects" && <EffectsPanel {...panel} />}
      {tab === "timeline" && project.clips.length === 0 && <EmptyState title="자산 탭에서 클립을 넣는다" action={<Button onClick={() => setTab("assets")}>자산 열기</Button>} />}
    </ReelsWorkspace>
  );
}

