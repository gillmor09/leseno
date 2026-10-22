/**
 * Cheap assist model for Graph / Continuity / Freigabe / JSON helpers
 * (anonymous calls — not a named KI-Rolle from Admin).
 * Named roles always use their Admin `modelSlug` via {@link resolveRomanKiRolle},
 * except prose roles when `allowProseModel: false` (Spec-Entwurf etc.).
 * Haiku 5.5: instruction-following JSON and canon checks. Prose stays on the
 * configured Autor / Co-Autor model (typically GPT-6 Luna).
 */

import { resolveRomanSchreibModel } from "@/lib/roman/model";
import type { AiModelConfig } from "@/lib/prompts/catalog";

/** Wired slug — assist calls that are not a named Admin KI-Rolle. */
export const ROMAN_ASSIST_MODEL_SLUG = "claude-haiku-5-5";

/**
 * Notable writer/lektor roles (docs / UI hints). All Admin roles keep their
 * configured `modelSlug` at runtime; this list is informational only.
 */
export const ROMAN_CONFIGURED_MODEL_ROLE_KEYS = [
  "schreib_coach",
  "entwicklungslektor",
  "co_autor",
  "autor",
] as const;

/**
 * Manuskript/Roman prose roles — may be forced to the assist model when
 * `allowProseModel: false` (e.g. Spec-Entwurf mit Co-Autor-Prompt).
 */
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

/** Resolve Haiku 5.5 for Graph, Continuity, Chapter Packet, Briefs. */
export async function resolveRomanAssistModel(): Promise<AiModelConfig> {
  return resolveRomanSchreibModel(ROMAN_ASSIST_MODEL_SLUG);
}
