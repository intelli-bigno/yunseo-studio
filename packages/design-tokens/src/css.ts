// 토큰 → CSS 변수. 대시보드 layout 이 <style> 로 한 번 주입한다.
import { color, component, fontStack, grid, layout, motion, radius, shadow, space, type } from "./tokens";

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export function cssVariables(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(color)) vars[`--c-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(fontStack)) vars[`--ff-${k}`] = v;
  for (const [k, t] of Object.entries(type)) {
    vars[`--fs-${k}`] = `${t.size}px`;
    vars[`--lh-${k}`] = `${t.line}px`;
    vars[`--fw-${k}`] = String(t.weight);
    vars[`--ls-${k}`] = t.tracking;
    vars[`--ff-${k}`] = `var(--ff-${t.family})`;
  }
  for (const [k, v] of Object.entries(space)) vars[`--sp-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(radius)) vars[`--r-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(layout)) vars[`--l-${kebab(k)}`] = `${v}px`;
  vars["--grid-columns"] = String(grid.columns);
  vars["--grid-gutter"] = `${grid.gutter}px`;
  vars["--grid-margin"] = `${grid.margin}px`;
  for (const [k, v] of Object.entries(shadow)) vars[`--shadow-${k}`] = v;
  for (const [k, v] of Object.entries(motion)) vars[`--m-${kebab(k)}`] = v;
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
