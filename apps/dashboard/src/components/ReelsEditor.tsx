"use client";
// [W3 릴스] 릴스 타임라인 편집기 — 트랙(영상·텍스트·음성·자막·컴포넌트) · 클립 추가·자르기·다듬기·이동·삭제 · 9:16 미리보기 재생.
// 편집 규칙은 lib/reels-timeline(순수 함수), 그리기는 @yunseo/ui/reels. 저장은 「저장」(⌘S)을 눌러야 SQLite 에 남는다(읽은 판으로 낙관적 동시성).
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, CardHeader, EmptyState, Field, Input, List, ListItem, Notice, Segmented, SegmentedItem, Split, Stack, Text } from "@yunseo/ui";
import { ReelsStage, ReelsTimeline, type ReelsLayer, type ReelsOverlay, type ReelsPointer, type ReelsTimelineTrack } from "@yunseo/ui/reels";
import {
  REELS_DEFAULT_MS,
  REELS_TRACK_KINDS,
  activeAt,
  addClip,
  addTrack,
  applySourceDuration,
  end,
  fmtTime,
  fracToMs,
  moveClip,
  projectDuration,
  removeClip,
  removeTrack,
  snap,
  sourceSeconds,
  splitClip,
  timelineSpan,
  toggleMute,
  trimClip,
  updateClip,
  type ReelsComponent,
  type ReelsProject,
  type ReelsSource,
  type ReelsTrackKind,
} from "@/lib/reels-timeline";

export interface ReelsEditorProps {
  projects: { id: string; title: string; updatedAt: string }[];
  current: { id: string; project: ReelsProject; revision: number } | null;
  sources: ReelsSource[];
}

const KIND_LABEL: Record<ReelsTrackKind, string> = { video: "영상", text: "텍스트", audio: "음성", subtitle: "자막", component: "컴포넌트" };
const COMPONENT_LABEL: Record<ReelsComponent, string> = { title: "제목", badge: "배지", cta: "행동 유도" };
const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

type Drag = { clip: string; handle: "start" | "end" | "body"; grab: number; base: ReelsProject; moved: boolean } | { scrub: true };

export function ReelsEditor({ projects, current, sources }: ReelsEditorProps) {
  const router = useRouter();
  const [project, setProject] = useState<ReelsProject | null>(current?.project ?? null);
  const [revision, setRevision] = useState(current?.revision ?? 0);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<{ tone: "alert" | "accent"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<Drag | null>(null);

  const edit = (f: (p: ReelsProject) => ReelsProject) => {
    setProject((p) => {
      if (!p) return p;
      const next = f(p);
      if (next !== p) setDirty(true);
      return next;
    });
  };

  const duration = project ? projectDuration(project) : 0;
  const span = project ? timelineSpan(project) : 15_000;

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

  const selectedClip = project?.clips.find((c) => c.id === selected) ?? null;
  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);

  const togglePlay = () => {
    if (!project || duration === 0) return;
    if (!playing && time >= duration) setTime(0);
    setPlaying((p) => !p);
  };
  const split = () => {
    if (!project) return;
    const targets = selectedClip ? [selectedClip] : activeAt(project, time).map((x) => x.clip);
    edit((p) => targets.reduce((acc, c) => splitClip(acc, c.id, time, uid("c")), p));
  };
  const remove = () => {
    if (!selected) return;
    edit((p) => removeClip(p, selected));
    setSelected(null);
  };

  const save = async () => {
    if (!project || !current || busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/reels/projects/${current.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ project, revision }) });
      const body = (await r.json()) as { revision?: number; error?: string; problems?: string[] };
      if (!r.ok) {
        setMessage({ tone: "alert", text: r.status === 409 ? "다른 곳에서 먼저 저장했다 — 새로 불러와야 한다" : `${body.error ?? "저장 실패"} ${body.problems?.join(" · ") ?? ""}` });
        return;
      }
      setRevision(body.revision!);
      setDirty(false);
      setMessage({ tone: "accent", text: `저장했다 · ${body.revision}판` });
      router.refresh();
    } catch {
      setMessage({ tone: "alert", text: "저장 실패 — 연결을 확인" });
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/reels/projects", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = (await r.json()) as { id?: string; error?: string };
      if (!r.ok || !body.id) throw new Error(body.error);
      router.push(`/reels?p=${body.id}`);
    } catch {
      setMessage({ tone: "alert", text: "만들기 실패" });
    } finally {
      setBusy(false);
    }
  };

  const destroy = async () => {
    if (!current || !window.confirm("이 프로젝트를 지울까?")) return;
    const r = await fetch(`/api/reels/projects/${current.id}`, { method: "DELETE" });
    if (r.ok) router.push("/reels");
    else setMessage({ tone: "alert", text: "지우기 실패" });
  };

  // 단축키 — Space 재생, S 자르기, Delete 삭제, ⌘S 저장 (입력 칸에서는 안 먹는다)
  const keys = useRef({ togglePlay, split, remove, save });
  keys.current = { togglePlay, split, remove, save };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void keys.current.save();
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === " ") {
        e.preventDefault();
        keys.current.togglePlay();
      } else if (e.key.toLowerCase() === "s" && !e.metaKey && !e.ctrlKey) keys.current.split();
      else if (e.key === "Delete" || e.key === "Backspace") keys.current.remove();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 저장 안 한 변경이 있으면 떠날 때 묻는다
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  const projectList = (
    <Card>
      <CardHeader title="프로젝트" action={<Button variant="primary" onClick={() => void create()} disabled={busy}>새 릴스</Button>} />
      {projects.length === 0 ? (
        <EmptyState title="아직 없다" />
      ) : (
        <List>
          {projects.map((p) => (
            <ListItem key={p.id} as="a" href={`/reels?p=${p.id}`} current={p.id === current?.id} title={p.title} meta={p.updatedAt.slice(0, 16).replace("T", " ")} />
          ))}
        </List>
      )}
    </Card>
  );

  if (!project || !current) return <Stack gap={6}>{message && <Notice tone={message.tone}>{message.text}</Notice>}{projectList}</Stack>;

  // ── 미리보기 계층 ──
  const live = activeAt(project, time);
  const layers: ReelsLayer[] = [];
  const overlays: ReelsOverlay[] = [];
  // 아래 트랙이 위에 그려지도록 영상 트랙은 뒤에서부터 쌓는다(첫 영상 트랙이 맨 위)
  for (const { track, clip } of [...live].reverse()) {
    const src = clip.sourceId ? sourceById.get(clip.sourceId) : undefined;
    if ((track.kind === "video" || track.kind === "audio") && src) {
      const kind = track.kind === "audio" ? "audio" : src.kind === "image" ? "image" : "video";
      // 영상 트랙 영상의 소리는 음성 트랙이 따로 있을 때도 그대로 낸다 — 트랙 음소거로 끈다
      layers.push({ key: clip.id, kind, src: src.src, time: sourceSeconds(clip, time), muted: !!track.muted || !playing });
    }
  }
  for (const { track, clip } of live) {
    if (track.kind === "text" || track.kind === "subtitle") overlays.push({ key: clip.id, kind: track.kind, text: clip.text ?? "" });
    if (track.kind === "component") overlays.push({ key: clip.id, kind: "component", text: clip.text ?? "", variant: clip.component ?? "title" });
  }

  // ── 타임라인 ──
  const pct = (ms: number) => (ms / span) * 100;
  const tickStep = span <= 20_000 ? 2000 : span <= 60_000 ? 5000 : 15_000;
  const ticks = Array.from({ length: Math.floor(span / tickStep) }, (_, i) => ({ at: pct(i * tickStep), label: fmtTime(i * tickStep).replace(/\.0$/, "") }));
  const clipLabel = (c: (typeof project.clips)[number]) => (c.sourceId ? sourceById.get(c.sourceId)?.label ?? c.sourceId : c.component ? `${COMPONENT_LABEL[c.component]} · ${c.text ?? ""}` : c.text ?? "");
  const timelineTracks: ReelsTimelineTrack[] = project.tracks.map((t) => ({
    id: t.id,
    name: t.name,
    tone: t.kind,
    muted: !!t.muted,
    actions: (
      <>
        {(t.kind === "video" || t.kind === "audio") && (
          <Button variant="ghost" onClick={() => edit((p) => toggleMute(p, t.id))} aria-label={`${t.name} 음소거`}>
            {t.muted ? "켬" : "끔"}
          </Button>
        )}
        <Button variant="ghost" onClick={() => edit((p) => removeTrack(p, t.id))} aria-label={`${t.name} 지우기`}>
          ×
        </Button>
      </>
    ),
    clips: project.clips.filter((c) => c.trackId === t.id).map((c) => ({ id: c.id, left: pct(c.start), width: pct(c.duration), label: clipLabel(c), selected: c.id === selected })),
  }));

  const tolerance = span / 100;
  const onPointer = (e: ReelsPointer) => {
    const t = fracToMs(e.frac, span);
    if (e.phase === "down") {
      if (e.clip) {
        const c = project.clips.find((x) => x.id === e.clip)!;
        setSelected(c.id);
        drag.current = { clip: c.id, handle: e.handle ?? "body", grab: t - c.start, base: project, moved: false };
      } else {
        if (e.track >= 0) setSelected(null);
        drag.current = { scrub: true };
        setTime(Math.min(t, Math.max(duration, 0)));
      }
      return;
    }
    const d = drag.current;
    if (!d) return;
    if ("scrub" in d) setTime(Math.min(t, duration));
    else {
      d.moved = true;
      const free = e.shift; // Shift 를 누르면 붙이기 없이
      const at = (v: number) => (free ? v : snap(d.base, v, tolerance, d.clip, [time]));
      let next: ReelsProject;
      if (d.handle === "body") {
        const c = d.base.clips.find((x) => x.id === d.clip)!;
        const s = at(t - d.grab);
        const e2 = at(t - d.grab + c.duration);
        const start = Math.abs(e2 - (t - d.grab + c.duration)) < Math.abs(s - (t - d.grab)) ? e2 - c.duration : s;
        next = moveClip(d.base, d.clip, start, project.tracks[e.track]?.id);
      } else next = trimClip(d.base, d.clip, d.handle, at(t));
      setProject(next);
      setDirty(true);
    }
    if (e.phase === "up") drag.current = null;
  };

  // ── 추가 ──
  const ensureTrack = (p: ReelsProject, kind: ReelsTrackKind): [ReelsProject, string] => {
    const id = p.tracks.find((t) => t.kind === kind)?.id;
    if (id) return [p, id];
    const nid = uid("t");
    return [addTrack(p, kind, nid), nid];
  };
  const addSource = (s: ReelsSource, as: "video" | "audio") =>
    edit((p) => {
      const [q, trackId] = ensureTrack(p, as);
      const ms = s.durationMs ?? (s.kind === "image" ? REELS_DEFAULT_MS.image : REELS_DEFAULT_MS.video);
      return addClip(q, trackId, { id: uid("c"), duration: ms, sourceId: s.id, sourceKind: s.kind, ...(s.durationMs ? { sourceMs: s.durationMs } : {}) });
    });
  const addText = (kind: "text" | "subtitle" | "component", component?: ReelsComponent) => {
    const text = draft.trim() || (component ? COMPONENT_LABEL[component] : KIND_LABEL[kind]);
    edit((p) => {
      const [q, trackId] = ensureTrack(p, kind);
      return addClip(q, trackId, { id: uid("c"), duration: REELS_DEFAULT_MS.text, text, start: time, ...(component ? { component } : {}) });
    });
    setDraft("");
  };

  const onDuration = (src: string, ms: number) => {
    const s = sources.find((x) => x.src === src);
    if (s) setProject((p) => (p ? applySourceDuration(p, s.id, ms) : p));
  };

  return (
    <Stack gap={6}>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <Split
        rail={
          <Stack gap={6}>
            <Card>
              <CardHeader title={<Text truncate>{project.title}</Text>} action={<Text tone="mute" mono>{fmtTime(time)} / {fmtTime(duration)}</Text>} />
              <ReelsStage layers={layers} overlays={overlays} playing={playing} label="9:16 미리보기" empty="클립을 추가" onDuration={onDuration} />
              <Stack direction="row" gap={2} wrap>
                <Button variant="primary" onClick={togglePlay} disabled={duration === 0}>{playing ? "정지" : "재생"}</Button>
                <Button onClick={() => { setPlaying(false); setTime(0); }}>처음으로</Button>
              </Stack>
            </Card>
            {projectList}
          </Stack>
        }
      >
        <Card>
          <CardHeader
            title="타임라인"
            action={
              <Stack direction="row" gap={2} wrap>
                <Button onClick={split} disabled={live.length === 0 && !selectedClip}>자르기</Button>
                <Button onClick={remove} disabled={!selected}>삭제</Button>
                <Button variant="primary" onClick={() => void save()} disabled={!dirty || busy}>{dirty ? "저장" : "저장됨"}</Button>
              </Stack>
            }
          />
          <ReelsTimeline tracks={timelineTracks} playhead={pct(time)} ticks={ticks} label="릴스 타임라인" onPointer={onPointer} />
          <Stack direction="row" gap={2} wrap align="center">
            <Text tone="mute">트랙 추가</Text>
            <Segmented label="트랙 추가">
              {REELS_TRACK_KINDS.map((k) => (
                <SegmentedItem key={k} onClick={() => edit((p) => addTrack(p, k, uid("t")))}>{KIND_LABEL[k]}</SegmentedItem>
              ))}
            </Segmented>
          </Stack>
        </Card>

        <Card>
          <CardHeader title="글자 넣기" action={<Text tone="mute" mono>{fmtTime(time)}</Text>} />
          {selectedClip && selectedClip.text !== undefined ? (
            <Field label="고른 클립 글자">
              <Input value={selectedClip.text} maxLength={500} onChange={(e) => edit((p) => updateClip(p, selectedClip.id, { text: e.target.value }))} />
            </Field>
          ) : (
            <Field label="새 글자">
              <Input value={draft} maxLength={500} placeholder="플레이헤드 위치에 넣는다" onChange={(e) => setDraft(e.target.value)} />
            </Field>
          )}
          <Stack direction="row" gap={2} wrap>
            <Button onClick={() => addText("text")}>텍스트</Button>
            <Button onClick={() => addText("subtitle")}>자막</Button>
            {(Object.keys(COMPONENT_LABEL) as ReelsComponent[]).map((c) => (
              <Button key={c} onClick={() => addText("component", c)}>{COMPONENT_LABEL[c]}</Button>
            ))}
          </Stack>
        </Card>

        <Card>
          <CardHeader title="소스" action={<Text tone="mute" mono>{sources.length}개</Text>} />
          {sources.length === 0 ? (
            <EmptyState title="만든 쇼츠·카드가 없다" />
          ) : (
            <List>
              {sources.map((s) => (
                <ListItem
                  key={s.id}
                  title={s.label}
                  meta={s.kind === "video" ? "영상" : "그림"}
                  trailing={
                    <Stack direction="row" gap={2}>
                      <Button onClick={() => addSource(s, "video")}>영상에</Button>
                      {s.kind === "video" && <Button onClick={() => addSource(s, "audio")}>음성에</Button>}
                    </Stack>
                  }
                />
              ))}
            </List>
          )}
        </Card>

        <Stack direction="row" gap={2} wrap>
          <Text tone="mute">내보내기는 아직 없다 — 합성기가 카드 그림만 받는다</Text>
          <Button variant="ghost" onClick={() => void destroy()}>프로젝트 지우기</Button>
        </Stack>
      </Split>
    </Stack>
  );
}
