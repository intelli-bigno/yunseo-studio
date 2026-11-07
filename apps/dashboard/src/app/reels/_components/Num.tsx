"use client";
// 숫자 칸 — 쓰는 동안은 글자, 칸을 벗어나거나 Enter 를 누르면 한 번만 값을 넘긴다(op 한 개 = 되돌리기 한 번).
import { useEffect, useState } from "react";
import { Field, Input } from "@yunseo/ui";

export function Num({ label, value, min, max, step, disabled, onCommit }: { label: string; value: number; min: number; max: number; step: number; disabled?: boolean; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text);
    if (text.trim() === "" || !Number.isFinite(n)) return setText(String(value));
    const v = Math.min(max, Math.max(min, n));
    setText(String(v));
    if (v !== value) onCommit(v);
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
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </Field>
  );
}
