import {
  Issues,
  RULE_ORIGINS,
  SEVERITIES,
  SURFACES,
  type BannedExpressionRule,
  type ValidationResult,
} from "@yunseo/domain";
import type {
  ActivePreset,
  BrandPreset,
  CharacterPreset,
  FormatPreset,
  LanguagePreset,
  TonePreset,
} from "./types";

const HEX_OR_TBD = /^(#[0-9a-fA-F]{6}|TBD)$/;

function color(e: Issues, value: unknown, path: string): string {
  const v = e.text(value, path);
  if (v !== "" && !HEX_OR_TBD.test(v)) e.add(path, "#RRGGBB 또는 TBD 여야 한다");
  return v;
}

export function validateBrand(input: unknown): ValidationResult<BrandPreset> {
  const e = new Issues();
  const r = e.record(input, "$");
  const palette = e.record(r["palette"], "palette");
  const typeface = e.record(r["typeface"], "typeface");
  return e.result({
    id: e.text(r["id"], "id"),
    status: e.oneOf(r["status"], ["placeholder", "confirmed"] as const, "status", "placeholder"),
    name: e.text(r["name"], "name"),
    handle: e.text(r["handle"], "handle"),
    concept: e.text(r["concept"], "concept"),
    core_sentence: e.text(r["core_sentence"], "core_sentence"),
    impression: e.textArray(r["impression"], "impression", 1),
    palette: {
      bg: color(e, palette["bg"], "palette.bg"),
      ink: color(e, palette["ink"], "palette.ink"),
      muted: color(e, palette["muted"], "palette.muted"),
      accent: color(e, palette["accent"], "palette.accent"),
    },
    typeface: { display: e.text(typeface["display"], "typeface.display"), body: e.text(typeface["body"], "typeface.body") },
    logo: e.text(r["logo"], "logo"),
    visual_rules: e.textArray(r["visual_rules"], "visual_rules", 1),
  });
}

export function validateCharacter(input: unknown): ValidationResult<CharacterPreset> {
  const e = new Issues();
  const r = e.record(input, "$");
  return e.result({
    id: e.text(r["id"], "id"),
    kind: e.oneOf(r["kind"], ["undecided", "person", "illustrated", "editor"] as const, "kind", "undecided"),
    name: e.text(r["name"], "name"),
    speaking_style: e.text(r["speaking_style"], "speaking_style"),
    appearance_ref: e.text(r["appearance_ref"], "appearance_ref"),
  });
}

export function validateTone(input: unknown): ValidationResult<TonePreset> {
  const e = new Issues();
  const r = e.record(input, "$");
  return e.result({
    id: e.text(r["id"], "id"),
    voice: e.textArray(r["voice"], "voice", 1),
    principles: e.textArray(r["principles"], "principles", 1),
    reading_level: e.text(r["reading_level"], "reading_level"),
    emoji: e.oneOf(r["emoji"], ["none", "minimal"] as const, "emoji", "none"),
  });
}

export function validateLanguage(input: unknown): ValidationResult<LanguagePreset> {
  const e = new Issues();
  const r = e.record(input, "$");
  return e.result({
    id: e.text(r["id"], "id"),
    status: e.oneOf(r["status"], ["provisional", "confirmed"] as const, "status", "provisional"),
    publish: e.text(r["publish"], "publish"),
    operator_ui: e.text(r["operator_ui"], "operator_ui"),
    note: e.text(r["note"], "note"),
  });
}

export function validateFormat(input: unknown): ValidationResult<FormatPreset> {
  const e = new Issues();
  const r = e.record(input, "$");
  const status = e.oneOf(r["status"], ["active", "reserved"] as const, "status", "reserved");
  const minStages = status === "active" ? 1 : 0;
  const stages = e.array(r["stages"], "stages", minStages).map((raw, i) => {
    const p = `stages[${i}]`;
    const s = e.record(raw, p);
    return { id: e.text(s["id"], `${p}.id`), label: e.text(s["label"], `${p}.label`), question: e.text(s["question"], `${p}.question`) };
  });
  const cards = e.array(r["cards"], "cards", minStages).map((raw, i) => {
    const p = `cards[${i}]`;
    const c = e.record(raw, p);
    const stage = c["stage"] === null ? null : e.text(c["stage"], `${p}.stage`);
    if (stage !== null && !stages.some((s) => s.id === stage)) e.add(`${p}.stage`, `stages 에 없는 단계: ${stage}`);
    const max = c["max_chars"];
    if (max !== null && !(typeof max === "number" && Number.isInteger(max) && max > 0)) {
      e.add(`${p}.max_chars`, "양의 정수 또는 null 이어야 한다");
    }
    return { slot: e.text(c["slot"], `${p}.slot`), stage, max_chars: typeof max === "number" ? max : null };
  });
  return e.result({
    id: e.text(r["id"], "id"),
    kind: e.oneOf(r["kind"], ["pre_issue", "post_issue"] as const, "kind", "pre_issue"),
    status,
    publish_timing: e.text(r["publish_timing"], "publish_timing"),
    limits_provisional: r["limits_provisional"] === true,
    stages,
    cards,
  });
}

export function validateActive(input: unknown): ValidationResult<ActivePreset> {
  const e = new Issues();
  const r = e.record(input, "$");
  return e.result({
    brand: e.text(r["brand"], "brand"),
    character: e.text(r["character"], "character"),
    tone: e.text(r["tone"], "tone"),
    language: e.text(r["language"], "language"),
    compliance: e.text(r["compliance"], "compliance"),
    formats: e.textArray(r["formats"], "formats", 1),
  });
}

/** presets/compliance/banned-expressions.yaml — 규칙 목록을 검증해 domain 의 규칙 타입으로 돌려준다. */
export function validateBannedExpressions(input: unknown): ValidationResult<BannedExpressionRule[]> {
  const e = new Issues();
  const r = e.record(input, "$");
  const seen = new Set<string>();
  const rules = e.array(r["rules"], "rules", 1).map((raw, i) => {
    const p = `rules[${i}]`;
    const x = e.record(raw, p);
    const id = e.text(x["id"], `${p}.id`);
    if (seen.has(id)) e.add(`${p}.id`, `중복 id: ${id}`);
    seen.add(id);
    const origin = e.oneOf(x["origin"], RULE_ORIGINS, `${p}.origin`, "proposed");
    const severity = e.oneOf(x["severity"], SEVERITIES, `${p}.severity`, "warn");
    // 사람이 아직 확정하지 않은 제안 규칙은 게시를 막지 않고 경고만 한다.
    if (origin === "proposed" && severity === "block") e.add(`${p}.severity`, "origin: proposed 규칙은 warn 만 가능하다");
    const surfaces = e.array(x["surfaces"], `${p}.surfaces`, 1).map((s, j) =>
      e.oneOf(s, SURFACES, `${p}.surfaces[${j}]`, "body"),
    );
    return { id, terms: e.textArray(x["terms"], `${p}.terms`, 1), surfaces, severity, origin, reason: e.text(x["reason"], `${p}.reason`) };
  });
  return e.result(rules);
}
