"use client";
// 자산 탭 — 소스(만든 쇼츠·카드 그림·음성) 넣기 · 글자 · 스티커/워터마크/카드 · 자막(SRT 가져오기 · 대본 자동 배치).
// 트랙이 없으면 새 트랙을 같이 만든다(트랙 id 를 미리 정해 한 batch 로 보낸다 — 되돌리기 한 번).
import { useState } from "react";
import { Button, Checkbox, EmptyState, Field, Input, List, ListItem, Segmented, SegmentedItem, Select, Stack, Text, Textarea } from "@yunseo/ui";
import { ReelsGroup, ReelsGroups } from "@yunseo/ui/reels";
import type { PanelProps } from "../_lib/panel";
import { uid } from "../_lib/ops";
import { CORNER_LABEL, TEXT_STYLES, TRACK_LABEL } from "../_lib/presets";
import { clipEnd, firstFreeStart } from "../_lib/timeline";
import { DEFAULT_IMAGE_MS, DEFAULT_TEXT_MS, MAX_MS, type Component, type Corner, type Op, type ReelsProjectV2, type SourceRef, type Track, type TrackKind } from "../_lib/types";

/** 클립을 놓을 트랙 — 고른 트랙이 맞으면 그것, 아니면 잠기지 않은 첫 트랙, 없으면 새로 만들 트랙 id */
function pickTrack(p: ReelsProjectV2, kind: TrackKind, selected: Track | null): { id: string; create: Op | null } {
  if (selected && selected.kind === kind && !selected.locked) return { id: selected.id, create: null };
  const found = p.tracks.find((t) => t.kind === kind && !t.locked);
  if (found) return { id: found.id, create: null };
  const id = uid("t");
  return { id, create: { op: "add_track", kind, id } };
}

/** op 하나로 — 트랙을 같이 만들어야 하면 batch */
const withTrack = (create: Op | null, op: Op, label: string): Op => (create ? { op: "batch", label, ops: [create, op] } : op);

export function AssetsPanel({ ed, sources, track, clip, time }: PanelProps) {
  const { project, send } = ed;
  const [style, setStyle] = useState("viral-white");
  const [draft, setDraft] = useState("");
  const [assetId, setAssetId] = useState("");
  const [asset, setAsset] = useState<"sticker" | "watermark">("watermark");
  const [corner, setCorner] = useState<Corner>("br");
  const [srt, setSrt] = useState("");
  const [replace, setReplace] = useState(true);
  const [offset, setOffset] = useState("0");
  const [script, setScript] = useState("");
  const [voice, setVoice] = useState("");

  const at = (trackId: string, len: number) => firstFreeStart(project, trackId, time, len);
  const voices = project.clips.filter((c) => project.tracks.find((t) => t.id === c.trackId)?.kind === "audio");

  const addSource = (s: SourceRef, as: "clip" | "card") => {
    if (as === "card") {
      const t = pickTrack(project, "overlay", track);
      void send(withTrack(t.create, { op: "add_component", trackId: t.id, start: at(t.id, DEFAULT_IMAGE_MS), durationMs: DEFAULT_IMAGE_MS, component: { type: "card", sourceId: s.id }, transform: { cx: 0.5, cy: 0.42, scale: 0.8 } }, "카드 넣기"));
      return;
    }
    const t = pickTrack(project, s.kind === "audio" ? "audio" : "video", track);
    void send(withTrack(t.create, { op: "add_clip", trackId: t.id, sourceId: s.id, id: uid("c"), mode: "place" }, "넣기"));
  };

  const addText = (kind: "text" | "subtitle") => {
    const t = pickTrack(project, kind, track);
    const value = draft.trim() || (kind === "text" ? "글자" : "자막");
    void send(withTrack(t.create, { op: "add_text", trackId: t.id, start: at(t.id, DEFAULT_TEXT_MS), durationMs: DEFAULT_TEXT_MS, text: { value, style: kind === "subtitle" ? "subtitle-default" : style }, id: uid("x") }, "글자 넣기"));
    setDraft("");
  };

  const addComponent = (component: Component, ms = DEFAULT_TEXT_MS) => {
    const t = pickTrack(project, "overlay", track);
    void send(withTrack(t.create, { op: "add_component", trackId: t.id, start: at(t.id, ms), durationMs: ms, component, id: uid("k") }, "구성요소 넣기"));
  };

  const addAsset = () => {
    if (!assetId.trim()) return;
    const whole = Math.max(500, Math.min(MAX_MS, project.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0) || DEFAULT_TEXT_MS));
    addComponent(asset === "watermark" ? { type: "watermark", assetId: assetId.trim(), corner } : { type: "sticker", assetId: assetId.trim() }, asset === "watermark" ? whole : DEFAULT_TEXT_MS);
  };

  const importSrt = () => {
    const t = pickTrack(project, "subtitle", track);
    const ms = Math.round(Number(offset) * 1000);
    void send(withTrack(t.create, { op: "import_srt", trackId: t.id, srt, style, replace, ...(Number.isFinite(ms) && ms !== 0 ? { offsetMs: ms } : {}) }, "자막 가져오기"));
  };

  const autoPlace = () => {
    const t = pickTrack(project, "subtitle", track);
    const audioClipId = voice || (clip && voices.some((v) => v.id === clip.id) ? clip.id : voices[0]?.id);
    if (!audioClipId) return ed.notify({ tone: "alert", text: "음성 클립이 먼저 필요하다" });
    void send(withTrack(t.create, { op: "auto_place_subtitles", trackId: t.id, script, audioClipId, style, maxLines: 2 }, "자막 자동 배치"));
  };

  const readFile = async (f: File | undefined) => {
    if (f) setSrt(await f.text());
  };

  const styleSelect = (
    <Field label="글자 스타일">
      <Select value={style} onChange={(e) => setStyle(e.target.value)}>
        {TEXT_STYLES.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </Select>
    </Field>
  );

  return (
    <ReelsGroups>
      <ReelsGroup title="소스">
        {sources.length === 0 ? (
          <EmptyState title="만든 쇼츠·카드가 없다" />
        ) : (
          <List>
            {sources.map((s) => (
              <ListItem
                key={s.id}
                title={s.label}
                meta={s.kind === "video" ? "영상" : s.kind === "audio" ? "음성" : "그림"}
                trailing={
                  <Stack direction="row" gap={2}>
                    <Button onClick={() => addSource(s, "clip")}>{s.kind === "audio" ? "음성에" : "영상에"}</Button>
                    {s.kind === "image" && <Button onClick={() => addSource(s, "card")}>카드로</Button>}
                  </Stack>
                }
              />
            ))}
          </List>
        )}
      </ReelsGroup>

      <ReelsGroup title="글자">
        <Field label="내용">
          <Textarea value={draft} maxLength={500} placeholder="재생 위치에 넣는다" onChange={(e) => setDraft(e.target.value)} />
        </Field>
        {styleSelect}
        <Stack direction="row" gap={2} wrap>
          <Button onClick={() => addText("text")}>텍스트</Button>
          <Button onClick={() => addText("subtitle")}>자막 한 줄</Button>
          <Button onClick={() => addComponent({ type: "title", text: draft.trim() || "제목" })}>제목</Button>
          <Button onClick={() => addComponent({ type: "badge", text: draft.trim() || "배지" })}>배지</Button>
          <Button onClick={() => addComponent({ type: "cta", text: draft.trim() || "행동 유도" })}>행동 유도</Button>
        </Stack>
      </ReelsGroup>

      <ReelsGroup title="스티커·워터마크">
        <Segmented label="종류">
          <SegmentedItem current={asset === "watermark"} onClick={() => setAsset("watermark")}>워터마크</SegmentedItem>
          <SegmentedItem current={asset === "sticker"} onClick={() => setAsset("sticker")}>스티커</SegmentedItem>
        </Segmented>
        <Field label="그림 이름 (assetId)">
          <Input value={assetId} maxLength={64} placeholder="logo-white" onChange={(e) => setAssetId(e.target.value)} />
        </Field>
        {asset === "watermark" && (
          <Field label="모서리">
            <Select value={corner} onChange={(e) => setCorner(e.target.value as Corner)}>
              {(Object.keys(CORNER_LABEL) as Corner[]).map((c) => (
                <option key={c} value={c}>{CORNER_LABEL[c]}</option>
              ))}
            </Select>
          </Field>
        )}
        <Button onClick={addAsset} disabled={!assetId.trim()}>넣기</Button>
        <Text tone="mute">{asset === "watermark" ? "처음부터 끝까지 깐다" : "재생 위치에 3초"}</Text>
      </ReelsGroup>

      <ReelsGroup title="자막 가져오기 (SRT)">
        <Field label="SRT 파일">
          <Input type="file" accept=".srt,text/plain" onChange={(e) => void readFile(e.target.files?.[0])} />
        </Field>
        <Field label="또는 붙여넣기">
          <Textarea tall value={srt} placeholder={"1\n00:00:00,000 --> 00:00:02,000"} onChange={(e) => setSrt(e.target.value)} />
        </Field>
        <Field label="밀기 (초)">
          <Input type="number" step={0.1} value={offset} onChange={(e) => setOffset(e.target.value)} />
        </Field>
        <Checkbox label="자막 트랙을 비우고 넣기" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        <Button variant="primary" onClick={importSrt} disabled={!srt.trim()}>가져오기</Button>
      </ReelsGroup>

      <ReelsGroup title="자막 자동 배치">
        <Field label="대본 (한 줄 = 한 문장)">
          <Textarea tall value={script} onChange={(e) => setScript(e.target.value)} />
        </Field>
        <Field label="음성 클립">
          <Select value={voice} onChange={(e) => setVoice(e.target.value)}>
            <option value="">{voices.length ? "자동 선택" : "음성 클립 없음"}</option>
            {voices.map((v) => {
              const s = v.sourceId ? sources.find((x) => x.id === v.sourceId) : undefined;
              return <option key={v.id} value={v.id}>{s?.label ?? v.id}</option>;
            })}
          </Select>
        </Field>
        <Button variant="primary" onClick={autoPlace} disabled={!script.trim() || voices.length === 0}>자동 배치</Button>
        <Text tone="mute">대본 원문을 음성의 무음 경계에 맞춘다</Text>
      </ReelsGroup>

      <ReelsGroup title="트랙 추가">
        <Segmented label="트랙 추가">
          {(Object.keys(TRACK_LABEL) as TrackKind[]).map((k) => (
            <SegmentedItem key={k} onClick={() => void send({ op: "add_track", kind: k, id: uid("t") })}>
              {TRACK_LABEL[k]}
            </SegmentedItem>
          ))}
        </Segmented>
      </ReelsGroup>
    </ReelsGroups>
  );
}
