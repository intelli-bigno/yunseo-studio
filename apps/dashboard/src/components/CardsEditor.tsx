"use client";
// [cards] 카드뉴스 편집기 — 덱(여러 장) · 캔버스(이미지·텍스트·검정 덮개 레이어) · 오른쪽 패널(자산·레이어·속성).
// 상태는 덱 한 벌(도메인 CardDeck)과 읽은 revision. 「저장」을 눌러야 SQLite 에 남고(낙관적 동시성 — 409 면 다시 불러오기 안내),
// PNG 는 브라우저 캔버스에 원본 크기로 그려 내려받는다(장별·전체).
import { useCallback, useEffect, useRef, useState, type DragEvent, type PointerEvent } from "react";
import {
  CARD_FONTS,
  CARD_PRESETS,
  CARD_WEIGHTS,
  addCard,
  addLayer,
  dragBox,
  duplicateCard,
  imageLayer,
  moveCard,
  moveLayer,
  overlayLayer,
  removeCard,
  removeLayer,
  textLayer,
  toggleLayerHidden,
  updateCard,
  updateLayer,
  type CardDeck,
  type CardFont,
  type CardLayer,
  type CardPresetId,
  type DeckCard,
  type DragMode,
} from "@yunseo/domain";
import {
  AssetGrid,
  AssetTile,
  Button,
  CanvasHandles,
  CanvasImage,
  CanvasLayer,
  CanvasOverlay,
  CanvasStage,
  CanvasText,
  Card,
  CardHeader,
  ColorField,
  DeckStrip,
  DeckThumb,
  EditorLayout,
  EmptyState,
  Field,
  FieldRow,
  IconButton,
  Input,
  LayerRow,
  List,
  ListItem,
  Notice,
  Range,
  Segmented,
  SegmentedItem,
  Select,
  Stack,
  Text,
  Textarea,
} from "@yunseo/ui";
import { drawCard, exportName, type Ctx2D, type LoadedImage } from "@/lib/cards-export";

export interface EditorAsset {
  id: string;
  group: "generated" | "reference";
  src: string;
  label: string;
}
export interface DeckSummary {
  id: string;
  title: string;
  preset: CardPresetId;
  cardCount: number;
  revision: number;
  updatedAt: string;
}
interface Loaded {
  deck: CardDeck;
  revision: number;
}

const DND_TYPE = "text/x-cards-asset";
const FONT_LABEL: Record<CardFont, string> = { sans: "고딕(본문 서체)", serif: "명조", mono: "고정폭" };
const KIND_LABEL: Record<CardLayer["kind"], string> = { image: "IMG", text: "TXT", overlay: "DIM" };
const PRESET_IDS = Object.keys(CARD_PRESETS) as CardPresetId[];

/** 화면 글자 서체 — 본문·고정폭은 앱 서체 변수, 명조는 시스템 */
const cssFamily = (f: CardFont) => (f === "sans" ? "var(--font-sans), sans-serif" : f === "mono" ? "var(--font-mono), monospace" : "'Noto Serif KR', 'Nanum Myeongjo', serif");
/** 캔버스 글자 서체 — CSS 변수를 실제 이름으로 푼다 */
function canvasFamily(f: CardFont): string {
  if (f === "serif") return cssFamily(f);
  const v = getComputedStyle(document.body).getPropertyValue(f === "sans" ? "--font-sans" : "--font-mono").trim();
  return `${v || (f === "sans" ? "sans-serif" : "monospace")}, ${f === "sans" ? "sans-serif" : "monospace"}`;
}

let seq = 0;
const newId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function loadImage(src: string): Promise<LoadedImage | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ img, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function cardPng(card: DeckCard, preset: CardPresetId): Promise<Blob | null> {
  const { width, height } = CARD_PRESETS[preset];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  await document.fonts.ready;
  // drawImage 겹침 선언(overload) 때문에 구조 대입이 안 된다 — 쓰는 부분만 같은 Ctx2D 로 본다
  await drawCard(ctx as unknown as Ctx2D, card, preset, { load: loadImage, family: canvasFamily });
  return new Promise((r) => canvas.toBlob(r, "image/png"));
}

// 내려받기 뒤 주소 거두기·연속 내려받기 간격 — 화면을 떠나면 남은 타이머를 모두 거둔다
const timers = new Set<ReturnType<typeof setTimeout>>();
const later = (ms: number, fn: () => void = () => {}) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(() => (timers.delete(t), fn(), resolve()), ms);
    timers.add(t);
  });
const clearTimers = () => {
  for (const t of timers) clearTimeout(t);
  timers.clear();
};

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  void later(1000, () => URL.revokeObjectURL(url));
}

/** 같은 출처 덱 API 만 부른다(path 는 "" 또는 "/<id>") — 30초 넘으면 끊는다 */
async function api<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(`/api/cards-decks${path}`, { ...init, signal: AbortSignal.timeout(30_000), headers: { "content-type": "application/json", ...init?.headers } });
  return { status: res.status, body: res.status === 204 ? (null as T) : ((await res.json().catch(() => null)) as T) };
}

/** 카드 한 장 그리기 — 편집 캔버스와 덱 줄 미리보기가 같이 쓴다 */
function CardView({ card, preset, mini = false, selected, onLayerDown, onHandleDown, onDrop }: {
  card: DeckCard;
  preset: CardPresetId;
  mini?: boolean;
  selected?: string | null;
  onLayerDown?: (l: CardLayer, e: PointerEvent<HTMLDivElement>) => void;
  onHandleDown?: (l: CardLayer, mode: DragMode, e: PointerEvent<HTMLSpanElement>) => void;
  onDrop?: (e: DragEvent<HTMLDivElement>) => void;
}) {
  const { width: cw, height: ch, label } = CARD_PRESETS[preset];
  return (
    <CanvasStage
      width={cw}
      height={ch}
      background={card.background}
      label={`카드 캔버스 ${label}`}
      mini={mini}
      onDragOver={onDrop ? (e) => e.preventDefault() : undefined}
      onDrop={onDrop}
    >
      {card.layers.map((l) =>
        l.hidden ? null : (
          <CanvasLayer key={l.id} box={l} cw={cw} ch={ch} label={l.name} selected={!mini && selected === l.id} onPointerDown={onLayerDown ? (e) => onLayerDown(l, e) : undefined}>
            {l.kind === "image" && <CanvasImage src={l.src} fit={l.fit} />}
            {l.kind === "overlay" && <CanvasOverlay opacity={l.opacity} />}
            {l.kind === "text" && <CanvasText text={l.text} family={cssFamily(l.font)} size={l.size} cw={cw} weight={l.weight} color={l.color} align={l.align} lineHeight={l.lineHeight} />}
            {!mini && selected === l.id && onHandleDown && <CanvasHandles onPointerDown={(m, e) => onHandleDown(l, m, e)} />}
          </CanvasLayer>
        ),
      )}
    </CanvasStage>
  );
}

export function CardsEditor({ initialDecks, assets }: { initialDecks: DeckSummary[]; assets: EditorAsset[] }) {
  const [decks, setDecks] = useState(initialDecks);
  const [cur, setCur] = useState<Loaded | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "alert" | "accent"; text: string } | null>(null);
  const [newPreset, setNewPreset] = useState<CardPresetId>("4:5");
  const [assetTab, setAssetTab] = useState<EditorAsset["group"]>("generated");
  const drag = useRef<{ id: string; mode: DragMode; sx: number; sy: number; scale: number; start: { x: number; y: number; w: number; h: number }; keep: boolean } | null>(null);

  const deck = cur?.deck ?? null;
  const card = deck?.cards[index] ?? null;
  const layer = card?.layers.find((l) => l.id === selected) ?? null;

  /** 덱 고치기 — 바뀌면 저장 안 됨 표시 */
  const edit = useCallback((fn: (d: CardDeck) => CardDeck) => {
    setCur((c) => (c ? { ...c, deck: fn(c.deck) } : c));
    setDirty(true);
  }, []);
  const editCard = useCallback((fn: (c: DeckCard) => DeckCard) => edit((d) => updateCard(d, index, fn)), [edit, index]);

  useEffect(() => clearTimers, []);

  // 저장 안 한 채 떠나면 묻는다
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // Delete/Backspace — 입력칸 밖에서 선택 레이어 삭제
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!selected || (e.key !== "Delete" && e.key !== "Backspace")) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable]") || t.isContentEditable)) return;
      e.preventDefault();
      editCard((c) => removeLayer(c, selected));
      setSelected(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selected, editCard]);

  // ── 끌기(이동·크기) ──
  const startDrag = (l: CardLayer, mode: DragMode, e: PointerEvent<HTMLElement>) => {
    if (!deck || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setSelected(l.id);
    const stage = (e.currentTarget as HTMLElement).closest("[data-canvas-stage]");
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    drag.current = { id: l.id, mode, sx: e.clientX, sy: e.clientY, scale: CARD_PRESETS[deck.preset].width / rect.width, start: { x: l.x, y: l.y, w: l.w, h: l.h }, keep: l.kind === "image" };
    const preset = deck.preset;
    const move = (ev: globalThis.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const box = dragBox(d.start, d.mode, (ev.clientX - d.sx) * d.scale, (ev.clientY - d.sy) * d.scale, preset, d.keep !== ev.shiftKey);
      editCard((c) => updateLayer(c, d.id, box));
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ── 자산 넣기(끌어 놓기·누르기) ──
  const addAsset = async (a: EditorAsset, at?: { cx: number; cy: number }) => {
    if (!deck) return;
    const img = await loadImage(a.src);
    const l = imageLayer(newId(), deck.preset, a.src, { name: a.label, aspect: img ? img.width / img.height : undefined, scale: 1, ...at });
    editCard((c) => addLayer(c, l));
    setSelected(l.id);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const a = assets.find((x) => x.id === e.dataTransfer.getData(DND_TYPE));
    if (!a || !deck) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const { width, height } = CARD_PRESETS[deck.preset];
    void addAsset(a, { cx: ((e.clientX - rect.left) / rect.width) * width, cy: ((e.clientY - rect.top) / rect.height) * height });
  };

  // ── 덱 열기·만들기·저장·삭제 ──
  const open = async (id: string) => {
    if (dirty && !confirm("저장하지 않은 변경이 있습니다. 버리고 열까요?")) return;
    setBusy(true);
    const r = await api<Loaded>(`/${id}`);
    setBusy(false);
    if (r.status !== 200) return setMsg({ tone: "alert", text: "덱을 불러오지 못했습니다" });
    setCur({ deck: r.body.deck, revision: r.body.revision });
    setIndex(0);
    setSelected(null);
    setDirty(false);
    setMsg(null);
  };
  const create = async () => {
    if (dirty && !confirm("저장하지 않은 변경이 있습니다. 버리고 새로 만들까요?")) return;
    setBusy(true);
    const r = await api<Loaded>("", { method: "POST", body: JSON.stringify({ title: "새 카드뉴스", preset: newPreset }) });
    setBusy(false);
    if (r.status !== 201) return setMsg({ tone: "alert", text: "새 덱을 만들지 못했습니다" });
    setDecks((ds) => [{ id: r.body.deck.id, title: r.body.deck.title, preset: r.body.deck.preset, cardCount: 1, revision: 1, updatedAt: new Date().toISOString() }, ...ds]);
    setCur({ deck: r.body.deck, revision: r.body.revision });
    setIndex(0);
    setSelected(null);
    setDirty(false);
  };
  const save = async () => {
    if (!cur) return;
    setBusy(true);
    const r = await api<Loaded & { errors?: string[]; status?: number }>(`/${cur.deck.id}`, { method: "PUT", body: JSON.stringify({ deck: cur.deck, revision: cur.revision }) });
    setBusy(false);
    if (r.status === 200) {
      setCur({ deck: r.body.deck, revision: r.body.revision });
      setDirty(false);
      setDecks((ds) => [{ id: r.body.deck.id, title: r.body.deck.title, preset: r.body.deck.preset, cardCount: r.body.deck.cards.length, revision: r.body.revision, updatedAt: new Date().toISOString() }, ...ds.filter((d) => d.id !== r.body.deck.id)]);
      return setMsg({ tone: "accent", text: "저장했습니다" });
    }
    if (r.status === 409) return setMsg({ tone: "alert", text: "다른 곳에서 먼저 저장했습니다 — 덱을 다시 불러온 뒤 고쳐 주세요" });
    setMsg({ tone: "alert", text: `저장하지 못했습니다${r.body?.errors ? ` — ${r.body.errors.slice(0, 3).join(", ")}` : ""}` });
  };
  const remove = async () => {
    if (!cur || !confirm(`「${cur.deck.title}」 덱을 지울까요? 되돌릴 수 없습니다.`)) return;
    const r = await api(`/${cur.deck.id}`, { method: "DELETE" });
    if (r.status !== 204) return setMsg({ tone: "alert", text: "지우지 못했습니다" });
    setDecks((ds) => ds.filter((d) => d.id !== cur.deck.id));
    setCur(null);
    setDirty(false);
  };

  // ── PNG ──
  const exportCards = async (which: number[]) => {
    if (!deck) return;
    setBusy(true);
    try {
      for (const i of which) {
        const blob = await cardPng(deck.cards[i]!, deck.preset);
        if (!blob) throw new Error("캔버스");
        download(blob, exportName(deck.title, i));
        await later(250); // 브라우저가 연속 내려받기를 막지 않게
      }
      setMsg({ tone: "accent", text: `PNG ${which.length}장을 내려받았습니다` });
    } catch {
      setMsg({ tone: "alert", text: "PNG 를 만들지 못했습니다" });
    } finally {
      setBusy(false);
    }
  };

  // ── 덱이 없을 때: 목록·새로 만들기 ──
  if (!deck || !card) {
    return (
      <Stack gap={5}>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <Card>
          <CardHeader
            title="새 카드뉴스"
            action={
              <Button variant="primary" onClick={create} disabled={busy}>
                만들기
              </Button>
            }
          />
          <Segmented label="카드 규격">
            {PRESET_IDS.map((p) => (
              <SegmentedItem key={p} current={newPreset === p} onClick={() => setNewPreset(p)}>
                {CARD_PRESETS[p].label}
              </SegmentedItem>
            ))}
          </Segmented>
        </Card>
        <Card>
          <CardHeader title="저장된 덱" />
          {decks.length === 0 ? (
            <EmptyState title="저장된 덱이 없습니다" />
          ) : (
            <List>
              {decks.map((d) => (
                <ListItem key={d.id} as="button" type="button" onClick={() => open(d.id)} title={d.title} meta={`${CARD_PRESETS[d.preset]?.label ?? d.preset} · ${d.cardCount}장 · ${d.updatedAt.slice(0, 16).replace("T", " ")}`} />
              ))}
            </List>
          )}
        </Card>
      </Stack>
    );
  }

  const { width: cw, height: ch } = CARD_PRESETS[deck.preset];
  const layersTop = [...card.layers].reverse();
  const shown = assets.filter((a) => a.group === assetTab);
  const setL = (patch: Partial<CardLayer>) => layer && editCard((c) => updateLayer(c, layer.id, patch));

  return (
    <Stack gap={5}>
      <Stack direction="row" gap={3} wrap align="center">
        <Input aria-label="덱 제목" value={deck.title} maxLength={80} onChange={(e) => edit((d) => ({ ...d, title: e.target.value }))} />
        <Text tone="mute">
          {CARD_PRESETS[deck.preset].label} · {deck.cards.length}장{dirty ? " · 저장 안 됨" : ""}
        </Text>
        <Button variant="primary" onClick={save} disabled={busy || !dirty}>
          저장
        </Button>
        <Button variant="secondary" onClick={() => exportCards([index])} disabled={busy}>
          이 장 PNG
        </Button>
        <Button variant="secondary" onClick={() => exportCards(deck.cards.map((_, i) => i))} disabled={busy}>
          전체 PNG
        </Button>
        <Button variant="secondary" onClick={() => (dirty && !confirm("저장하지 않은 변경을 버릴까요?") ? null : (setCur(null), setDirty(false)))}>
          덱 목록
        </Button>
        <Button variant="secondary" onClick={remove} disabled={busy}>
          덱 삭제
        </Button>
      </Stack>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <EditorLayout
        deck={
          <>
            <DeckStrip label="카드 순서">
              {deck.cards.map((c, i) => (
                <DeckThumb key={c.id} index={i} current={i === index} label={`${i + 1}번째 장`} onClick={() => (setIndex(i), setSelected(null))}>
                  <CardView card={c} preset={deck.preset} mini />
                </DeckThumb>
              ))}
            </DeckStrip>
            <Stack gap={2}>
              <Button variant="secondary" onClick={() => (edit((d) => addCard(d, newId(), index)), setIndex(index + 1), setSelected(null))}>
                장 추가
              </Button>
              <Button variant="secondary" onClick={() => (edit((d) => duplicateCard(d, index, newId)), setIndex(index + 1), setSelected(null))}>
                복제
              </Button>
              <Stack direction="row" gap={2}>
                <IconButton label="앞으로" disabled={index === 0} onClick={() => (edit((d) => moveCard(d, index, -1)), setIndex(index - 1))}>
                  ↑
                </IconButton>
                <IconButton label="뒤로" disabled={index === deck.cards.length - 1} onClick={() => (edit((d) => moveCard(d, index, 1)), setIndex(index + 1))}>
                  ↓
                </IconButton>
                <IconButton label="장 삭제" disabled={deck.cards.length <= 1} onClick={() => confirm(`${index + 1}번째 장을 지울까요?`) && (edit((d) => removeCard(d, index)), setIndex(Math.max(0, index - 1)), setSelected(null))}>
                  ×
                </IconButton>
              </Stack>
            </Stack>
          </>
        }
        stage={
          <>
            <CardView card={card} preset={deck.preset} selected={selected} onLayerDown={(l, e) => startDrag(l, "move", e)} onHandleDown={(l, m, e) => startDrag(l, m, e)} onDrop={onDrop} />
            <Stack direction="row" gap={2} wrap>
              <Button variant="secondary" onClick={() => { const l = textLayer(newId(), deck.preset); editCard((c) => addLayer(c, l)); setSelected(l.id); }}>
                텍스트
              </Button>
              <Button variant="secondary" onClick={() => { const l = overlayLayer(newId(), deck.preset); editCard((c) => addLayer(c, l)); setSelected(l.id); }}>
                검정 덮개
              </Button>
              <Button variant="secondary" onClick={() => setSelected(null)} disabled={!selected}>
                선택 해제
              </Button>
            </Stack>
            <Text tone="mute">
              {cw}×{ch} · 자산을 끌어 놓거나 눌러 넣기 · 모서리로 크기(이미지는 비율 유지, Shift 로 해제) · Delete 로 삭제
            </Text>
          </>
        }
        panel={
          <>
            <Card>
              <CardHeader title="자산" />
              <Segmented label="자산 종류">
                <SegmentedItem current={assetTab === "generated"} onClick={() => setAssetTab("generated")}>
                  생성 이미지
                </SegmentedItem>
                <SegmentedItem current={assetTab === "reference"} onClick={() => setAssetTab("reference")}>
                  레퍼런스
                </SegmentedItem>
              </Segmented>
              {shown.length === 0 ? (
                <EmptyState title="자산이 없습니다" />
              ) : (
                <AssetGrid>
                  {shown.map((a) => (
                    <AssetTile key={a.id} src={a.src} label={a.label} onDragStart={(e) => (e.dataTransfer.setData(DND_TYPE, a.id), (e.dataTransfer.effectAllowed = "copy"))} onClick={() => addAsset(a)} />
                  ))}
                </AssetGrid>
              )}
            </Card>
            <Card>
              <CardHeader title="레이어" />
              {layersTop.length === 0 ? (
                <EmptyState title="레이어가 없습니다" />
              ) : (
                <div role="list" aria-label="레이어(위가 앞)">
                  {layersTop.map((l) => (
                    <LayerRow
                      key={l.id}
                      name={l.name}
                      kind={KIND_LABEL[l.kind]}
                      selected={l.id === selected}
                      hidden={l.hidden}
                      onSelect={() => setSelected(l.id)}
                      actions={
                        <>
                          <IconButton label="올리기" disabled={l.id === card.layers.at(-1)?.id} onClick={() => editCard((c) => moveLayer(c, l.id, 1))}>
                            ↑
                          </IconButton>
                          <IconButton label="내리기" disabled={l.id === card.layers[0]?.id} onClick={() => editCard((c) => moveLayer(c, l.id, -1))}>
                            ↓
                          </IconButton>
                          <IconButton label={l.hidden ? "보이기" : "숨기기"} onClick={() => editCard((c) => toggleLayerHidden(c, l.id))}>
                            {l.hidden ? "◌" : "●"}
                          </IconButton>
                          <IconButton label="삭제" onClick={() => (editCard((c) => removeLayer(c, l.id)), l.id === selected && setSelected(null))}>
                            ×
                          </IconButton>
                        </>
                      }
                    />
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <CardHeader title={layer ? `속성 — ${layer.name}` : "카드 속성"} />
              <Stack gap={4}>
                {!layer && <ColorField label="바탕색" value={card.background} onChange={(v) => editCard((c) => ({ ...c, background: v }))} />}
                {layer && (
                  <Field label="이름">
                    <Input value={layer.name} maxLength={40} onChange={(e) => setL({ name: e.target.value })} />
                  </Field>
                )}
                {layer?.kind === "text" && (
                  <>
                    <Field label="내용">
                      <Textarea value={layer.text} maxLength={2000} onChange={(e) => setL({ text: e.target.value })} />
                    </Field>
                    <FieldRow>
                      <Field label="서체">
                        <Select value={layer.font} onChange={(e) => setL({ font: e.target.value as CardFont })}>
                          {CARD_FONTS.map((f) => (
                            <option key={f} value={f}>
                              {FONT_LABEL[f]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="굵기">
                        <Select value={layer.weight} onChange={(e) => setL({ weight: Number(e.target.value) as (typeof CARD_WEIGHTS)[number] })}>
                          {CARD_WEIGHTS.map((w) => (
                            <option key={w} value={w}>
                              {w}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </FieldRow>
                    <Range label="크기" value={layer.size} min={12} max={400} step={1} display={`${layer.size}`} onChange={(v) => setL({ size: v })} />
                    <Range label="줄 간격" value={layer.lineHeight} min={0.8} max={3} step={0.05} display={layer.lineHeight.toFixed(2)} onChange={(v) => setL({ lineHeight: v })} />
                    <ColorField label="색" value={layer.color} onChange={(v) => setL({ color: v })} />
                    <Segmented label="정렬">
                      {(["left", "center", "right"] as const).map((a) => (
                        <SegmentedItem key={a} current={layer.align === a} onClick={() => setL({ align: a })}>
                          {a === "left" ? "왼쪽" : a === "center" ? "가운데" : "오른쪽"}
                        </SegmentedItem>
                      ))}
                    </Segmented>
                  </>
                )}
                {layer?.kind === "overlay" && <Range label="불투명도" value={layer.opacity} min={0} max={1} step={0.01} display={`${Math.round(layer.opacity * 100)}%`} onChange={(v) => setL({ opacity: v })} />}
                {layer?.kind === "image" && (
                  <Segmented label="맞춤">
                    <SegmentedItem current={layer.fit === "cover"} onClick={() => setL({ fit: "cover" })}>
                      채우기
                    </SegmentedItem>
                    <SegmentedItem current={layer.fit === "contain"} onClick={() => setL({ fit: "contain" })}>
                      전체 보이기
                    </SegmentedItem>
                  </Segmented>
                )}
                {layer && (
                  <FieldRow>
                    {(["x", "y", "w", "h"] as const).map((k) => (
                      <Field key={k} label={k.toUpperCase()}>
                        <Input type="number" mono value={layer[k]} onChange={(e) => Number.isFinite(Number(e.target.value)) && setL({ [k]: k === "w" || k === "h" ? Math.max(24, Number(e.target.value)) : Number(e.target.value) })} />
                      </Field>
                    ))}
                  </FieldRow>
                )}
              </Stack>
            </Card>
          </>
        }
      />
    </Stack>
  );
}
