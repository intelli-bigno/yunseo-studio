import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { parse } from "yaml";
import type { ValidationResult } from "@yunseo/domain";
import type { PresetBundle } from "./types";
import {
  validateActive,
  validateBannedExpressions,
  validateBrand,
  validateCharacter,
  validateFormat,
  validateLanguage,
  validateTone,
} from "./validate";

export class PresetError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(`프리셋 오류 ${errors.length}건\n${errors.join("\n")}`);
    this.errors = errors;
  }
}

/** presets 디렉터리 안의 파일만 읽는다 (active.yaml 이 밖을 가리켜도 거부). */
function read(dir: string, file: string, hash: ReturnType<typeof createHash>): unknown {
  const full = resolve(dir, file);
  const rel = relative(dir, full);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new PresetError([`${file}: presets 디렉터리 밖을 가리킬 수 없다`]);
  const text = readFileSync(full, "utf8");
  hash.update(file).update("\0").update(text).update("\0");
  return parse(text) as unknown;
}

/** active.yaml 이 가리키는 프리셋을 읽어 스키마로 검증한다. 오류는 모아서 한 번에 던진다. */
export function loadPresets(presetsDir: string): PresetBundle {
  const dir = resolve(presetsDir);
  const hash = createHash("sha256");
  const errors: string[] = [];
  const check = <T>(file: string, result: ValidationResult<T>): T | undefined => {
    if (result.ok) return result.value;
    errors.push(...result.errors.map((m) => `${file}: ${m}`));
    return undefined;
  };

  const active = check("active.yaml", validateActive(read(dir, "active.yaml", hash)));
  if (!active) throw new PresetError(errors);

  const brand = check(active.brand, validateBrand(read(dir, active.brand, hash)));
  const character = check(active.character, validateCharacter(read(dir, active.character, hash)));
  const tone = check(active.tone, validateTone(read(dir, active.tone, hash)));
  const language = check(active.language, validateLanguage(read(dir, active.language, hash)));
  const bannedExpressions = check(active.compliance, validateBannedExpressions(read(dir, active.compliance, hash)));
  const formats = active.formats.flatMap((file) => {
    const f = check(file, validateFormat(read(dir, file, hash)));
    return f ? [f] : [];
  });

  if (errors.length > 0 || !brand || !character || !tone || !language || !bannedExpressions) throw new PresetError(errors);
  return { brand, character, tone, language, formats, bannedExpressions, versionHash: hash.digest("hex") };
}
