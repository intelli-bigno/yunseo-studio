import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { contentBlockers, findBannedExpressions, validateContentDoc } from "@yunseo/domain";
import { PresetError, brandPromoTexts, findPlaceholders, loadPresets } from "@yunseo/presets-schema";

export interface RunResult {
  code: number;
  lines: string[];
}

function yamlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return yamlFiles(full);
    return entry.name.endsWith(".yaml") ? [full] : [];
  });
}

/**
 * 프리셋·콘텐츠를 검증한다.
 * - 스키마 오류, 금지 표현 block, 브랜드 전면 문구 위반 → 실패 (종료 코드 1)
 * - 자리표시자(TBD)는 기본 정보로만 표시. publish=true 이면 실패 (게시 단계 차단 규칙)
 */
export function runValidate(rootDir: string, options: { publish: boolean }): RunResult {
  const lines: string[] = [];
  let failed = false;

  let presets;
  try {
    presets = loadPresets(join(rootDir, "presets"));
  } catch (error) {
    if (error instanceof PresetError) return { code: 1, lines: error.errors.map((m) => `✗ ${m}`) };
    throw error;
  }
  lines.push(`✓ 프리셋 ${presets.versionHash.slice(0, 12)} (언어 ${presets.language.publish}, ${presets.language.status})`);

  for (const { path, text } of brandPromoTexts(presets.brand)) {
    for (const hit of findBannedExpressions(text, "brand_promo", presets.bannedExpressions)) {
      lines.push(`${hit.severity === "block" ? "✗" : "!"} ${path}: ${hit.ruleId} 「${hit.matched}」`);
      failed ||= hit.severity === "block";
    }
  }

  const contentDir = join(rootDir, "content");
  for (const file of yamlFiles(contentDir)) {
    const name = file.slice(rootDir.length + 1);
    const result = validateContentDoc(parse(readFileSync(file, "utf8")) as unknown);
    if (!result.ok) {
      lines.push(...result.errors.map((m) => `✗ ${name}: ${m}`));
      failed = true;
      continue;
    }
    // 금지 표현·글자 상한·출처/기준 시점 — verified 는 block, draft 는 warn (검수 전에 채울 칸은 한 줄로 묶는다)
    const { block, warn } = contentBlockers(result.value, { banned: presets.bannedExpressions, formats: presets.formats });
    const toFill = warn.filter((f) => f.message.startsWith("[draft] "));
    for (const f of block) lines.push(`✗ ${name}: ${f.path} ${f.message}`);
    for (const f of warn.filter((x) => !toFill.includes(x))) lines.push(`! ${name}: ${f.path} ${f.message}`);
    if (toFill.length > 0) lines.push(`· ${name}: 검수 전에 채울 칸 ${toFill.length}건 (draft)`);
    failed ||= block.length > 0;
    lines.push(`✓ ${name} (${result.value.status})`);
  }

  const placeholders = findPlaceholders(presets);
  if (placeholders.length > 0) {
    const mark = options.publish ? "✗" : "·";
    lines.push(`${mark} 자리표시자(TBD) ${placeholders.length}건 — 게시 단계에서 차단: ${placeholders.join(", ")}`);
    failed ||= options.publish;
  }
  return { code: failed ? 1 : 0, lines };
}
