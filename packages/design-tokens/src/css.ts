// 토큰 → CSS 변수. 대시보드 layout 이 <style> 로 한 번 주입한다.
import { color, component, fontSize, fontStack, layout, letterSpacing, motion, radius, space } from "./tokens";

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export function cssVariables(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(color)) vars[`--c-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(fontStack)) vars[`--ff-${k}`] = v;
  for (const [k, v] of Object.entries(fontSize)) vars[`--fs-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(space)) vars[`--sp-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(radius)) vars[`--r-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(layout)) vars[`--l-${kebab(k)}`] = `${v}px`;
  for (const [k, v] of Object.entries(letterSpacing)) vars[`--ls-${k}`] = v;
  for (const [k, v] of Object.entries(motion)) vars[`--m-${k}`] = v;
  for (const [name, spec] of Object.entries(component)) {
    for (const [k, v] of Object.entries(spec)) vars[`--${name}-${kebab(k)}`] = typeof v === "number" ? `${v}px` : String(v);
  }
  return vars;
}

export function cssText(selector = ":root"): string {
  const body = Object.entries(cssVariables())
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  return `${selector} {\n${body}\n}\n`;
}
