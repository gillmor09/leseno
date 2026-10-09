/**
 * Cheap assist model for everything that is not Manuskript prose.
 * Manuskript draft → `co_autor` (Gemini Flash); Verbessern → `autor` (Opus).
 * Structure/assembly → Gemini Flash assist.
 */

import { resolveRomanSchreibModel } from "@/lib/roman/model";
import type { AiModelConfig } from "@/lib/prompts/catalog";

/** Wired slug — all non-prose pipeline assist calls. */
export const ROMAN_ASSIST_MODEL_SLUG = "gemini-3.8-flash";

/** Roles that may keep their configured prose model (not forced to assist Flash). */
export const ROMAN_PROSE_ROLE_KEYS = ["co_autor", "autor"] as const;

/** @deprecated Use {@link ROMAN_PROSE_ROLE_KEYS} — kept for call sites. */
export const ROMAN_PROSE_ROLE_KEY = "co_autor";

export function isRomanProseRoleKey(key: string): boolean {
  return (ROMAN_PROSE_ROLE_KEYS as readonly string[]).includes(key.trim());
}

/** Resolve Gemini 3.8 Flash for Graph, Continuity, Chapter Packet, Briefs. */
export async function resolveRomanAssistModel(): Promise<AiModelConfig> {
  return resolveRomanSchreibModel(ROMAN_ASSIST_MODEL_SLUG);
}
