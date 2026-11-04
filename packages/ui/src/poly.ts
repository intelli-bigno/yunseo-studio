// 공통 타입·도우미. 화면은 className·style 을 넘기지 못한다 — 모양은 props(variant·size·tone)로만 고른다.
import type { ComponentPropsWithoutRef, CSSProperties, ElementType } from "react";

/** 링크 등 다른 요소로 그릴 수 있는 컴포넌트의 props. className·style 은 막는다. */
export type Poly<E extends ElementType, P = object> = P & { as?: E } & Omit<ComponentPropsWithoutRef<E>, keyof P | "as" | "className" | "style">;

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");

export type Tone = "default" | "dim" | "mute" | "accent" | "alert" | "brass";
export type Gap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** CSS 변수만 담은 style (ui 내부 전용 — 화면은 style 을 못 쓴다) */
export const vars = (o: Record<`--${string}`, string | number>) => o as unknown as CSSProperties;
