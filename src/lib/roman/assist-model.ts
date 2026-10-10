/**
 * Cheap assist model for Graph / Continuity / Freigabe / JSON helpers.
 * Writer roles keep their configured slug via {@link ROMAN_CONFIGURED_MODEL_ROLE_KEYS}.
 */

import { resolveRomanSchreibModel } from "@/lib/roman/model";
import type { AiModelConfig } from "@/lib/prompts/catalog";

/** Wired slug — assist calls that are not a named writer/lektor role. */
export const ROMAN_ASSIST_MODEL_SLUG = "gemini-3.8-flash";

/**
 * Roles that keep their DB/fallback `modelSlug` (Haiku / Luna / Gemini).
 * Other belletristik roles still resolve to {@link ROMAN_ASSIST_MODEL_SLUG}.
 */
export const ROMAN_CONFIGURED_MODEL_ROLE_KEYS = [
  "schreib_coach",
  "entwicklungslektor",
  "co_autor",
  "autor",
] as const;

/** Manuskript prose roles — may still be gated by `allowProseModel`. */
export const ROMAN_PROSE_ROLE_KEYS = ["co_autor", "autor"] as const;

/** @deprecated Use {@link ROMAN_PROSE_ROLE_KEYS} — kept for call sites. */
export const ROMAN_PROSE_ROLE_KEY = "co_autor";

export function isRomanConfiguredModelRoleKey(key: string): boolean {
  return (ROMAN_CONFIGURED_MODEL_ROLE_KEYS as readonly string[]).includes(
    key.trim(),
  );
}

export function isRomanProseRoleKey(key: string): boolean {
  return (ROMAN_PROSE_ROLE_KEYS as readonly string[]).includes(key.trim());
}

/** Resolve Gemini 3.8 Flash for Graph, Continuity, Chapter Packet, Briefs. */
export async function resolveRomanAssistModel(): Promise<AiModelConfig> {
  return resolveRomanSchreibModel(ROMAN_ASSIST_MODEL_SLUG);
}
