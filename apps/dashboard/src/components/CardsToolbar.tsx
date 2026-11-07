"use client";
// [cards] 편집기 위 도구줄 — 한 줄. 제목(바로 고침)·규격·상태 | 실행취소·다시실행 · 추가 · 내보내기 · 덱 · 단축키 도움말 · 저장.
// 자주 안 쓰는 조작(내보내기·덱 열기/삭제·요소 추가)은 메뉴로, 단축키 안내는 ? 도움말로 넣어 높이를 아낀다.
import { CARD_PRESETS, type CardPresetId } from "@yunseo/domain";
import { Button, IconButton, KeyHint, Select, Stack, Text, Toolbar, ToolbarGroup, ToolbarNote, ToolbarSep, ToolbarStatus, ToolbarTitle } from "@yunseo/ui";
import { Menu, MenuItem, MenuLabel, MenuSep, Popover } from "@yunseo/ui/menu";

export interface ToolbarDeck {
  id: string;
  title: string;
  cardCount: number;
  updatedAt: string;
}

export interface CardsToolbarProps {
  title: string;
  onTitle: (v: string) => void;
  preset: CardPresetId;
  onPreset: (p: CardPresetId) => void;
  /** 캔버스 원본 크기 글자(예: 1080×1350) */
  size: string;
  cardCount: number;
  /** 아직 저장한 적 없는 새 덱 */
  isNew: boolean;
  dirty: boolean;
  busy: boolean;
  msg: { tone: "alert" | "accent"; text: string } | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canSave: boolean;
  onSave: () => void;
  decks: ToolbarDeck[];
  /** 지금 열려 있는 저장된 덱 id (새 덱이면 null) */
  currentId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRemove: () => void;
  canDeselect: boolean;
  onAddText: () => void;
  onAddOverlay: () => void;
  onAddGradient: () => void;
  onDeselect: () => void;
  onExportOne: () => void;
  onExportAll: () => void;
}

const PRESET_IDS = Object.keys(CARD_PRESETS) as CardPresetId[];

/** 단축키 안내 — [키, 하는 일]. 화면에는 ? 도움말로만 나온다 */
export const SHORTCUTS: readonly (readonly [string[], string])[] = [
  [["Delete"], "선택한 요소 삭제"],
  [["⌘", "D"], "선택한 요소 복제"],
  [["⌘", "Z"], "실행취소"],
  [["⇧", "⌘", "Z"], "다시실행"],
  [["Esc"], "선택 해제"],
  [["Alt"], "끌 때 붙기 끄기"],
  [["Shift"], "크기 끌 때 비율 풀기"],
];

export function CardsToolbar(p: CardsToolbarProps) {
  return (
    <Toolbar label="카드뉴스 편집 도구">
      <ToolbarTitle aria-label="덱 제목" placeholder="덱 제목" value={p.title} maxLength={80} onChange={(e) => p.onTitle(e.target.value)} />
      <Select aria-label="카드 규격" title={p.size} value={p.preset} onChange={(e) => p.onPreset(e.target.value as CardPresetId)}>
        {PRESET_IDS.map((id) => (
          <option key={id} value={id}>
            {CARD_PRESETS[id].label}
          </option>
        ))}
      </Select>
      <ToolbarStatus tone={p.dirty ? "accent" : undefined}>
        {p.cardCount}장 · {p.size}
        {p.isNew ? " · 새 덱" : ""}
        {p.dirty ? " · 저장 안 됨" : ""}
      </ToolbarStatus>
      {p.msg && <ToolbarNote tone={p.msg.tone}>{p.msg.text}</ToolbarNote>}
      <ToolbarGroup>
        <IconButton label="실행취소 (⌘Z)" onClick={p.onUndo} disabled={!p.canUndo}>
          ↶
        </IconButton>
        <IconButton label="다시실행 (⇧⌘Z)" onClick={p.onRedo} disabled={!p.canRedo}>
          ↷
        </IconButton>
        <ToolbarSep />
        <Menu label="요소 추가" trigger="+ 추가">
          <MenuItem onSelect={p.onAddText}>텍스트</MenuItem>
          <MenuItem onSelect={p.onAddOverlay}>덮개</MenuItem>
          <MenuItem onSelect={p.onAddGradient}>그라데이션 덮개</MenuItem>
          <MenuSep />
          <MenuItem onSelect={p.onDeselect} disabled={!p.canDeselect}>
            선택 해제
          </MenuItem>
        </Menu>
        <Menu label="PNG 내보내기" trigger="내보내기" disabled={p.busy}>
          <MenuItem onSelect={p.onExportOne}>이 장 PNG</MenuItem>
          <MenuItem onSelect={p.onExportAll}>전체 PNG ({p.cardCount}장)</MenuItem>
        </Menu>
        <Menu label="덱" trigger="덱" disabled={p.busy} align="end">
          <MenuItem onSelect={p.onNew}>새 덱</MenuItem>
          <MenuSep />
          <MenuLabel>{p.decks.length ? `저장된 덱 ${p.decks.length}` : "저장된 덱 없음"}</MenuLabel>
          {p.decks.map((d) => (
            <MenuItem key={d.id} current={d.id === p.currentId} onSelect={() => p.onOpen(d.id)}>
              {d.title} · {d.cardCount}장 · {d.updatedAt.slice(0, 16).replace("T", " ")}
            </MenuItem>
          ))}
          <MenuSep />
          <MenuItem tone="alert" onSelect={p.onRemove}>
            덱 삭제
          </MenuItem>
        </Menu>
        <Popover label="단축키 도움말" trigger="?" variant="icon" align="end">
          <Stack gap={2}>
            {SHORTCUTS.map(([keys, label]) => (
              <KeyHint key={label} keys={keys} label={label} />
            ))}
            <Text tone="mute" size="label">
              끌면 가장자리·가운데·다른 레이어에 붙음
            </Text>
          </Stack>
        </Popover>
        <Button variant="primary" onClick={p.onSave} disabled={!p.canSave}>
          저장
        </Button>
      </ToolbarGroup>
    </Toolbar>
  );
}
