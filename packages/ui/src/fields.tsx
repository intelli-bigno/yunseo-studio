"use client";
// 숫자 입력 — 숫자 칸(NumberField)·슬라이더(Range). 카드 편집기와 릴스 편집기가 따로 만들던 것을 한 부품으로 모았다.
import { useEffect, useRef, useState } from "react";
import { Field, Input } from "./controls";

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * 숫자 칸 — 범위 밖은 min~max 로 당기고, 빈 값·숫자 아님은 무시한다.
 * live: 칠 때마다 onChange(카드 편집기 — 화면이 바로 따라온다). 아니면 칸을 벗어나거나 Enter 를 눌렀을 때 한 번만(릴스 편집기 — op 한 개 = 되돌리기 한 번).
 */
export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  disabled,
  live = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean | undefined;
  live?: boolean;
  onChange: (v: number) => void;
}) {
  const show = (v: number) => String(live ? round2(v) : v);
  const [text, setText] = useState(() => show(value));
  // 밖에서 값이 바뀌면(되돌리기·다른 레이어 선택) 칸도 따라간다. 방금 친 글자와 같은 값이면 건드리지 않는다
  useEffect(() => setText((t) => (Number(t) === value ? t : show(value))), [value]);
  const commit = () => {
    const n = Number(text);
    if (text.trim() === "" || !Number.isFinite(n)) return setText(show(value));
    const v = Math.min(max, Math.max(min, n));
    setText(show(v));
    if (v !== value) onChange(v);
  };
  return (
    <Field label={label}>
      <Input
        type="number"
        mono
        value={text}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          if (!live) return setText(e.target.value);
          const raw = e.target.value;
          const n = Number(raw);
          if (raw === "" || !Number.isFinite(n)) return;
          const v = Math.min(max, Math.max(min, n));
          setText(v === n ? raw : show(v));
          onChange(v);
        }}
        onBlur={live ? undefined : commit}
        onKeyDown={live ? undefined : (e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </Field>
  );
}

/**
 * 슬라이더 — 값 표시는 옆 글자로. onChange 는 움직이는 동안 계속(미리보기).
 * onCommit 을 주면 놓을 때(포인터 뗌·키 뗌·포커스 나감) 한 번만 더 부른다(릴스 편집기 — op 한 개).
 */
export function Range({
  label,
  value,
  min,
  max,
  step,
  display,
  disabled,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display?: string | undefined;
  disabled?: boolean | undefined;
  onChange: (v: number) => void;
  onCommit?: ((v: number) => void) | undefined;
}) {
  const dirty = useRef(false);
  const commit = (v: number) => {
    if (!onCommit || !dirty.current) return;
    dirty.current = false;
    onCommit(v);
  };
  return (
    <label className="ui-field">
      <span className="ui-range-head">
        <span className="ui-t-label ui-tone-mute">{label}</span>
        <span className="ui-t-label ui-mono">{display ?? value}</span>
      </span>
      <input
        className="ui-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          dirty.current = true;
          onChange(Number(e.target.value));
        }}
        onPointerUp={(e) => commit(Number(e.currentTarget.value))}
        onKeyUp={(e) => commit(Number(e.currentTarget.value))}
        onBlur={(e) => commit(Number(e.currentTarget.value))}
      />
    </label>
  );
}
