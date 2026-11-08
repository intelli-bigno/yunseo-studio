"use client";
// 효과 탭 — 전환 · 색감(밝기·대비·채도·색온도·LUT) · 줌/키프레임. 미리보기는 CSS filter 근사(LUT 는 그리지 않는다), 최종 색은 서버 합성기가 낸다.
import { useEffect, useState } from "react";
import { Button, EmptyState, Field, Input, List, ListItem, Segmented, SegmentedItem, Select, Stack, Text, NumberField, Range } from "@yunseo/ui";
import { ReelsGroup, ReelsGroups } from "@yunseo/ui/reels";
import type { PanelProps } from "../_lib/panel";
import { DIRECTION_LABEL, KEY_LABEL, TRANSITION_LABEL } from "../_lib/presets";
import { clamp, clipLen, round } from "../_lib/timeline";
import { zoomOp } from "../_lib/ops";
import { DEFAULT_COLOR, DEFAULT_TRANSFORM, KEY_PROPS, MIN_CLIP_MS, TRANSITION_KINDS, type Clip, type Color, type Direction, type KeyEase, type KeyProp, type Op, type Transition, type TransitionKind } from "../_lib/types";

const DEFAULT_DURATION = 500;
const fmt = (n: number) => (Math.round(n * 100) / 100).toString();

export function EffectsPanel({ ed, clip, time, setDraft }: PanelProps) {
  if (!clip) return <EmptyState title="효과를 줄 클립을 고른다" />;
  const owner = ed.project.tracks.find((t) => t.id === clip.trackId);
  const locked = !!owner?.locked;
  const picture = owner?.kind === "video" || owner?.kind === "overlay";
  const commit = (op: Op) => void ed.send(op).finally(() => setDraft(null));
  return (
    <ReelsGroups>
      {picture && <TransitionGroup clip={clip} locked={locked} commit={commit} />}
      {picture && <ColorGroup clip={clip} locked={locked} setDraft={setDraft} commit={commit} />}
      <KeyframeGroup clip={clip} time={time} locked={locked} commit={commit} />
    </ReelsGroups>
  );
}

// ── 전환 ───────────────────────────────────────────────
function TransitionGroup({ clip, locked, commit }: { clip: Clip; locked: boolean; commit: (op: Op) => void }) {
  const tr = clip.transition;
  const kind: TransitionKind = tr?.kind ?? "cut";
  const len = clipLen(clip);
  const set = (next: Transition | null) => commit({ op: "set_transition", clipId: clip.id, transition: next });
  const pick = (k: TransitionKind) => {
    if (k === "cut") return set(null);
    const next: Transition = { kind: k, durationMs: tr?.durationMs ?? Math.min(DEFAULT_DURATION, Math.floor(len / 2)) };
    if (k === "slide") next.direction = tr?.direction ?? "left";
    set(next);
  };
  return (
    <ReelsGroup title="전환 (앞 클립 → 이 클립)">
      <Segmented label="전환 종류">
        {TRANSITION_KINDS.map((k) => (
          <SegmentedItem key={k} current={kind === k} disabled={locked} onClick={() => pick(k)}>
            {TRANSITION_LABEL[k]}
          </SegmentedItem>
        ))}
      </Segmented>
      {tr && tr.kind !== "cut" && (
        <>
          <NumberField label="길이 (초)" value={tr.durationMs / 1000} min={0.1} max={Math.max(0.1, len / 2000)} step={0.1} disabled={locked} onChange={(v) => set({ ...tr, durationMs: round(v * 1000) })} />
          {tr.kind === "slide" && (
            <Field label="방향">
              <Select value={tr.direction ?? "left"} disabled={locked} onChange={(e) => set({ ...tr, direction: e.target.value as Direction })}>
                {(Object.keys(DIRECTION_LABEL) as Direction[]).map((d) => (
                  <option key={d} value={d}>{DIRECTION_LABEL[d]}</option>
                ))}
              </Select>
            </Field>
          )}
        </>
      )}
    </ReelsGroup>
  );
}

// ── 색감 ───────────────────────────────────────────────
function ColorGroup({ clip, locked, setDraft, commit }: { clip: Clip; locked: boolean; setDraft: (c: Clip | null) => void; commit: (op: Op) => void }) {
  const color: Color = { ...DEFAULT_COLOR, ...clip.color };
  const live = (patch: Partial<Color>) => setDraft({ ...clip, color: { ...color, ...patch } });
  const set = (patch: Partial<Color>) => commit({ op: "set_color", clipId: clip.id, color: patch });
  const [lut, setLut] = useState(color.lut?.id ?? "");
  useEffect(() => setLut(color.lut?.id ?? ""), [color.lut?.id]);
  const strength = color.lut?.strength ?? 1;
  const row = (key: "brightness" | "contrast" | "saturation" | "temperature", label: string) => (
    <Range key={key} label={label} value={color[key]} min={-1} max={1} step={0.01} display={fmt(color[key])} disabled={locked} onChange={(v) => live({ [key]: v })} onCommit={(v) => set({ [key]: v })} />
  );
  return (
    <ReelsGroup title="색감">
      {row("brightness", "밝기")}
      {row("contrast", "대비")}
      {row("saturation", "채도")}
      {row("temperature", "색온도 (+ 따뜻)")}
      <Field label="LUT 이름">
        <Input
          value={lut}
          placeholder="없음"
          maxLength={64}
          disabled={locked}
          onChange={(e) => setLut(e.target.value)}
          onBlur={() => lut.trim() !== (color.lut?.id ?? "") && set({ lut: lut.trim() ? { id: lut.trim(), strength } : null })}
        />
      </Field>
      {color.lut && (
        <Range label="LUT 세기" value={strength} min={0} max={1} step={0.05} display={`${Math.round(strength * 100)}%`} disabled={locked} onChange={(v) => live({ lut: { id: color.lut!.id, strength: v } })} onCommit={(v) => set({ lut: { id: color.lut!.id, strength: v } })} />
      )}
      <Button onClick={() => set(DEFAULT_COLOR)} disabled={locked}>색감 되돌리기</Button>
      <Text tone="mute">미리보기는 근사 — LUT 는 내보낼 때 적용</Text>
    </ReelsGroup>
  );
}

// ── 줌·키프레임 ────────────────────────────────────────
const EASES: { id: KeyEase; label: string }[] = [
  { id: "ease-in-out", label: "부드럽게" },
  { id: "linear", label: "직선" },
  { id: "hold", label: "유지" },
];

function KeyframeGroup({ clip, time, locked, commit }: { clip: Clip; time: number; locked: boolean; commit: (op: Op) => void }) {
  const len = clipLen(clip);
  const [from, setFrom] = useState(1.25);
  const [to, setTo] = useState(1);
  const [prop, setProp] = useState<KeyProp>("scale");
  const [value, setValue] = useState(1);
  const [ease, setEase] = useState<KeyEase>("ease-in-out");
  const at = clamp(round(time - clip.start), 0, len);
  const keys = [...(clip.keyframes ?? [])].sort((a, b) => a.at - b.at || a.prop.localeCompare(b.prop));
  const initial = (p: KeyProp) => (p === "volumeDb" ? clip.audio?.volumeDb ?? 0 : (clip.transform ?? DEFAULT_TRANSFORM)[p]);
  return (
    <>
      <ReelsGroup title="줌">
        <NumberField label="시작 배율" value={from} min={0.1} max={3} step={0.05} disabled={locked} onChange={setFrom} />
        <NumberField label="끝 배율" value={to} min={0.1} max={3} step={0.05} disabled={locked} onChange={setTo} />
        <Segmented label="줌 곡선">
          {EASES.filter((e) => e.id !== "hold").map((e) => (
            <SegmentedItem key={e.id} current={ease === e.id} onClick={() => setEase(e.id)}>
              {e.label}
            </SegmentedItem>
          ))}
        </Segmented>
        <Button variant="primary" disabled={locked || len < MIN_CLIP_MS} onClick={() => commit(zoomOp(clip, from, to, ease === "linear" ? "linear" : "ease-in-out"))}>
          줌 적용
        </Button>
      </ReelsGroup>
      <ReelsGroup title="키프레임">
        <Stack direction="row" gap={2} wrap>
          <Field label="속성">
            <Select
              value={prop}
              disabled={locked}
              onChange={(e) => {
                const p = e.target.value as KeyProp;
                setProp(p);
                setValue(initial(p));
              }}
            >
              {KEY_PROPS.map((k) => (
                <option key={k} value={k}>{KEY_LABEL[k]}</option>
              ))}
            </Select>
          </Field>
          <NumberField label="값" value={value} min={-60} max={360} step={0.05} disabled={locked} onChange={setValue} />
        </Stack>
        <Button disabled={locked} onClick={() => commit({ op: "add_keyframe", clipId: clip.id, prop, at, value, ease })}>
          재생 위치에 추가 ({(at / 1000).toFixed(1)}초)
        </Button>
        {keys.length === 0 ? (
          <Text tone="mute">키프레임이 없다</Text>
        ) : (
          <List>
            {keys.map((k) => (
              <ListItem
                key={k.id}
                title={`${KEY_LABEL[k.prop]} ${fmt(k.value)}`}
                meta={`${(k.at / 1000).toFixed(1)}초 · ${EASES.find((e) => e.id === k.ease)?.label ?? k.ease}`}
                trailing={
                  <Button variant="ghost" disabled={locked} onClick={() => commit({ op: "remove_keyframe", clipId: clip.id, keyframeId: k.id })}>
                    지우기
                  </Button>
                }
              />
            ))}
          </List>
        )}
      </ReelsGroup>
    </>
  );
}
