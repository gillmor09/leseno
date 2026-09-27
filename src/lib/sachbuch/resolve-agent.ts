/**
 * Resolve a per-book Sachbuch agent slot to a wired AiModelConfig.
 */

import type { AiModelConfig } from "@/lib/prompts/catalog";
import { resolveRomanSchreibModel } from "@/lib/roman/model";
import type {
  SachbuchAgentKey,
  SachbuchAgents,
  SachbuchAgentSlot,
} from "@/lib/sachbuch/types";

export async function resolveSachbuchAgentModel(
  slot: SachbuchAgentSlot,
): Promise<AiModelConfig> {
  return resolveRomanSchreibModel(slot.modelSlug);
}

export function getSachbuchAgentSlot(
  agents: SachbuchAgents,
  key: SachbuchAgentKey,
): SachbuchAgentSlot {
  return agents[key];
}
