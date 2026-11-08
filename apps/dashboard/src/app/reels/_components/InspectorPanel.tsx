"use client";
// 인스펙터 탭 — 고른 클립(시간·속도·위치·글자·소리) 또는 고른 트랙(이름·음소거·숨김·잠금·볼륨·순서)의 값을 고친다.
// 값은 전부 op 로만 보낸다. 슬라이더는 움직이는 동안 미리보기(draft)만 바꾸고 놓을 때 op 한 개를 보낸다.
import { useEffect, useState } from "react";
import { Button, Checkbox, EmptyState, Field, Input, Segmented, SegmentedItem, Select, Stack, Text, Textarea, NumberField, Range } from "@yunseo/ui";
import { ReelsGroup, ReelsGroups } from "@yunseo/ui/reels";
import type { PanelProps } from "../_lib/panel";
import { DEFAULT_TEXT_BOX, SPEED_PRESETS, TEXT_STYLES, TRACK_LABEL } from "../_lib/presets";
import { clampTrim, clipLen, moveTarget, round } from "../_lib/timeline";
import { DB_RANGE, DEFAULT_AUDIO, DEFAULT_TRANSFORM, SPEED_RANGE, type Clip, type Op, type TextBody, type Track, type Transform } from "../_lib/types";

const sec = (ms: number) => Math.round(ms) / 1000;

export function InspectorPanel(props: PanelProps) {
  const { clip, track } = props;
  if (clip) return <ClipInspector {...props} clip={clip} />;
  if (track) return <TrackInspector {...props} track={track} />;
  return <EmptyState title="클립이나 트랙을 고른다" />;
}

// ── 클립 ───────────────────────────────────────────────
function ClipInspector({ ed, sources, clip, time, setDraft }: PanelProps & { clip: Clip }) {
  const { project, send } = ed;
  const owner = project.tracks.find((t) => t.id === clip.trackId);
  const src = clip.sourceId ? sources.find((s) => s.id === clip.sourceId) : undefined;
  const len = clipLen(clip);
  const locked = !!owner?.locked;
  const commit = (op: Op) => void send(op).finally(() => setDraft(null));

  const tr: Transform = { ...DEFAULT_TRANSFORM, ...clip.transform };
  const live = (patch: Partial<Transform>) => setDraft({ ...clip, transform: { ...tr, ...patch } });
  const setTr = (patch: Partial<Transform>) => commit({ op: "set_transform", clipId: clip.id, transform: patch });
  const hasPicture = owner?.kind === "video" || owner?.kind === "overlay";
  const hasSound = owner?.kind === "audio" || (owner?.kind === "video" && clip.sourceKind === "video");
  const audio = { ...DEFAULT_AUDIO, ...clip.audio };
  const label = src?.label ?? clip.text?.value ?? (clip.component ? (clip.component.type === "card" ? "카드" : clip.component.type) : clip.id);

  const moveTo = (ms: number) => {
    const to = moveTarget(project, clip, ms);
    if (to && (to.start !== clip.start || to.trackId !== clip.trackId)) void send({ op: "move", clipId: clip.id, start: to.start });
  };
  const resize = (ms: number) => void send({ op: "trim", clipId: clip.id, edge: "end", to: clampTrim(project, clip, "end", clip.start + ms) });
  const speed = (v: number) => void send({ op: "set_speed", clipId: clip.id, speed: v });

  return (
    <Stack gap={5}>
      <Text truncate tone="dim">{TRACK_LABEL[owner?.kind ?? "video"]} · {label}</Text>
      <ReelsGroups>
        <ReelsGroup title="시간">
          <NumberField label="시작 (초)" value={sec(clip.start)} min={0} max={180} step={0.1} disabled={locked} onChange={(v) => moveTo(round(v * 1000))} />
          <NumberField label="길이 (초)" value={sec(len)} min={0.1} max={180} step={0.1} disabled={locked} onChange={(v) => resize(round(v * 1000))} />
          {clip.sourceKind !== undefined && clip.sourceKind !== "image" && (
            <>
              <NumberField label="속도 (배)" value={clip.speed} min={SPEED_RANGE[0]} max={SPEED_RANGE[1]} step={0.05} disabled={locked} onChange={speed} />
              <Segmented label="속도 빠른 선택">
                {SPEED_PRESETS.map((v) => (
                  <SegmentedItem key={v} current={clip.speed === v} disabled={locked} onClick={() => speed(v)}>
                    {v}배
                  </SegmentedItem>
                ))}
              </Segmented>
            </>
          )}
        </ReelsGroup>

        {clip.text && <TextGroup {...{ ed, clip, text: clip.text, trackKind: owner?.kind, locked, setDraft, commit }} />}

        {(hasPicture || clip.text) && (
          <ReelsGroup title={clip.text ? "투명도" : "위치·크기"}>
            {!clip.text && (
              <>
                <Range label="가로" value={tr.cx} min={0} max={1} step={0.01} display={tr.cx.toFixed(2)} disabled={locked} onChange={(v) => live({ cx: v })} onCommit={(v) => setTr({ cx: v })} />
                <Range label="세로" value={tr.cy} min={0} max={1} step={0.01} display={tr.cy.toFixed(2)} disabled={locked} onChange={(v) => live({ cy: v })} onCommit={(v) => setTr({ cy: v })} />
                <Range label="크기" value={tr.scale} min={0.1} max={3} step={0.01} display={`${tr.scale.toFixed(2)}배`} disabled={locked} onChange={(v) => live({ scale: v })} onCommit={(v) => setTr({ scale: v })} />
                <Range label="회전" value={tr.rotation} min={-180} max={180} step={1} display={`${tr.rotation}°`} disabled={locked} onChange={(v) => live({ rotation: v })} onCommit={(v) => setTr({ rotation: v })} />
              </>
            )}
            <Range label="투명도" value={tr.opacity} min={0} max={1} step={0.01} display={`${Math.round(tr.opacity * 100)}%`} disabled={locked} onChange={(v) => live({ opacity: v })} onCommit={(v) => setTr({ opacity: v })} />
            {!clip.text && (
              <Button onClick={() => commit({ op: "set_transform", clipId: clip.id, transform: DEFAULT_TRANSFORM })} disabled={locked}>
                자리 되돌리기
              </Button>
            )}
          </ReelsGroup>
        )}

        {hasSound && (
          <ReelsGroup title="소리">
            <Range
              label="볼륨"
              value={audio.volumeDb}
              min={DB_RANGE[0]}
              max={DB_RANGE[1]}
              step={0.5}
              display={`${audio.volumeDb} dB`}
              disabled={locked}
              onChange={(v) => setDraft({ ...clip, audio: { ...audio, volumeDb: v } })}
              onCommit={(v) => commit({ op: "set_volume", clipId: clip.id, volumeDb: v })}
            />
            <Range
              label="페이드 인"
              value={audio.fadeInMs}
              min={0}
              max={Math.max(0, Math.min(5000, len - audio.fadeOutMs))}
              step={100}
              display={`${sec(audio.fadeInMs)}초`}
              disabled={locked}
              onChange={(v) => setDraft({ ...clip, audio: { ...audio, fadeInMs: v } })}
              onCommit={(v) => commit({ op: "set_fade", clipId: clip.id, inMs: v })}
            />
            <Range
              label="페이드 아웃"
              value={audio.fadeOutMs}
              min={0}
              max={Math.max(0, Math.min(5000, len - audio.fadeInMs))}
              step={100}
              display={`${sec(audio.fadeOutMs)}초`}
              disabled={locked}
              onChange={(v) => setDraft({ ...clip, audio: { ...audio, fadeOutMs: v } })}
              onCommit={(v) => commit({ op: "set_fade", clipId: clip.id, outMs: v })}
            />
            <Field label="페이드 곡선">
              <Select value={audio.fadeCurve} disabled={locked} onChange={(e) => commit({ op: "set_fade", clipId: clip.id, curve: e.target.value as "linear" | "ease" })}>
                <option value="linear">직선</option>
                <option value="ease">부드럽게</option>
              </Select>
            </Field>
          </ReelsGroup>
        )}

        {clip.component && (
          <ReelsGroup title="구성요소">
            <Text tone="dim">{clip.component.type === "card" ? `카드 · ${src?.label ?? clip.component.sourceId}` : "assetId" in clip.component ? `${clip.component.type} · ${clip.component.assetId}` : `${clip.component.type} · ${clip.component.text}`}</Text>
          </ReelsGroup>
        )}
      </ReelsGroups>
      <Text tone="mute" mono>재생 위치 {sec(time)}초 · 클립 안 {sec(Math.max(0, time - clip.start))}초</Text>
    </Stack>
  );
}

// ── 글자 ───────────────────────────────────────────────
function TextGroup({ ed, clip, text, trackKind, locked, setDraft, commit }: { ed: PanelProps["ed"]; clip: Clip; text: TextBody; trackKind: Track["kind"] | undefined; locked: boolean; setDraft: PanelProps["setDraft"]; commit: (op: Op) => void }) {
  const [value, setValue] = useState(text.value);
  useEffect(() => setValue(text.value), [text.value, clip.id]);
  const box = text.box;
  const base = DEFAULT_TEXT_BOX[trackKind === "subtitle" ? "subtitle" : "text"];
  const liveBox = (patch: Partial<NonNullable<TextBody["box"]>>) => setDraft({ ...clip, text: { ...text, box: { ...(box ?? base), ...patch } } });
  const setBox = (patch: Partial<NonNullable<TextBody["box"]>>) => commit({ op: "update_text", clipId: clip.id, text: { box: { ...(box ?? base), ...patch } } });
  return (
    <ReelsGroup title="글자">
      <Field label="내용">
        <Textarea
          value={value}
          maxLength={500}
          disabled={locked}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => value !== text.value && void ed.send({ op: "update_text", clipId: clip.id, text: { value } })}
        />
      </Field>
      <Field label="스타일">
        <Select value={text.style} disabled={locked} onChange={(e) => void ed.send({ op: "update_text", clipId: clip.id, text: { style: e.target.value } })}>
          {TEXT_STYLES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
          {!TEXT_STYLES.some((s) => s.id === text.style) && <option value={text.style}>{text.style}</option>}
        </Select>
      </Field>
      {box ? (
        <>
          <Range label="가로 위치" value={box.cx} min={0} max={1} step={0.01} display={box.cx.toFixed(2)} disabled={locked} onChange={(v) => liveBox({ cx: v })} onCommit={(v) => setBox({ cx: v })} />
          <Range label="세로 위치" value={box.cy} min={0} max={1} step={0.01} display={box.cy.toFixed(2)} disabled={locked} onChange={(v) => liveBox({ cy: v })} onCommit={(v) => setBox({ cy: v })} />
          <Range label="폭" value={box.w} min={0.2} max={1} step={0.01} display={`${Math.round(box.w * 100)}%`} disabled={locked} onChange={(v) => liveBox({ w: v })} onCommit={(v) => setBox({ w: v })} />
        </>
      ) : (
        <Button onClick={() => setBox({})} disabled={locked}>자리 직접 정하기</Button>
      )}
    </ReelsGroup>
  );
}

// ── 트랙 ───────────────────────────────────────────────
function TrackInspector({ ed, track, setDraft }: PanelProps & { track: Track }) {
  const { project, send } = ed;
  const index = project.tracks.findIndex((t) => t.id === track.id);
  const [name, setName] = useState(track.name);
  useEffect(() => setName(track.name), [track.name]);
  const hasSound = track.kind === "audio" || track.kind === "video";
  const hasPicture = track.kind !== "audio";
  const vol = track.volumeDb ?? 0;
  const [liveVol, setLiveVol] = useState<number | null>(null);
  const set = (patch: Omit<Extract<Op, { op: "set_track" }>, "op" | "trackId">) => void send({ op: "set_track", trackId: track.id, ...patch });
  const count = project.clips.filter((c) => c.trackId === track.id).length;
  const remove = () => {
    if (count > 0 && !window.confirm(`클립 ${count}개가 같이 지워진다`)) return;
    setDraft(null);
    void send({ op: "remove_track", trackId: track.id });
  };
  return (
    <ReelsGroups>
      <ReelsGroup title={`${TRACK_LABEL[track.kind]} 트랙`}>
        <Field label="이름">
          <Input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== track.name && set({ name: name.trim() })} />
        </Field>
        <Stack direction="row" gap={4} wrap>
          {hasSound && <Checkbox label="음소거" checked={!!track.muted} onChange={(e) => set({ muted: e.target.checked })} />}
          {hasPicture && <Checkbox label="숨김" checked={!!track.hidden} onChange={(e) => set({ hidden: e.target.checked })} />}
          <Checkbox label="잠금" checked={!!track.locked} onChange={(e) => set({ locked: e.target.checked })} />
        </Stack>
      </ReelsGroup>
      {hasSound && (
        <ReelsGroup title="소리">
          <Range label="트랙 볼륨" value={liveVol ?? vol} min={DB_RANGE[0]} max={DB_RANGE[1]} step={0.5} display={`${liveVol ?? vol} dB`} onChange={setLiveVol} onCommit={(v) => void send({ op: "set_volume", trackId: track.id, volumeDb: v }).finally(() => setLiveVol(null))} />
        </ReelsGroup>
      )}
      <ReelsGroup title="순서">
        <Stack direction="row" gap={2} wrap>
          <Button onClick={() => set({ index: index + 1 })} disabled={index >= project.tracks.length - 1}>위로</Button>
          <Button onClick={() => set({ index: index - 1 })} disabled={index <= 0}>아래로</Button>
          <Button variant="ghost" onClick={remove}>트랙 지우기</Button>
        </Stack>
        <Text tone="mute">클립 {count}개 · 위쪽 트랙이 화면 위에 그려진다</Text>
      </ReelsGroup>
    </ReelsGroups>
  );
}
