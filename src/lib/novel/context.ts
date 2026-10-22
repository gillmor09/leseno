/**
 * Prompt context slices: style_guide + knowledge_graph for every write/review.
 * Voice card is the style motor; anti-AI detectors stay outside prompts.
 */

import {
  formatLogicLedgerForAuthor,
  getLogicLedger,
  LOGIC_LEDGER_KEY,
} from "@/lib/novel/logic-ledger";
import { mergeMandatoryProseRules } from "@/lib/novel/prose-guardrails";
import { formatVoiceCardForAuthor, getVoiceCard } from "@/lib/novel/voice-card";
import type { NovelBundle } from "@/lib/novel/types";

export function formatStyleGuideBlock(bundle: NovelBundle): string {
  const s = bundle.styleGuide;
  if (!s) {
    return `# Styleguide
(noch leer)

${formatVoiceCardForAuthor(null)}`;
  }
  const rules = mergeMandatoryProseRules(s.styleRules);
  const dos = rules.dos.map((x) => `- ${x}`).join("\n");
  const donts = rules.donts.map((x) => `- ${x}`).join("\n");
  return `# Styleguide
Genre: ${s.genre}${s.subgenre ? ` / ${s.subgenre}` : ""}
Tonalität: ${s.primaryTone}
Perspektive: ${s.narrativePerspective}
Do's:
${dos || "- —"}
Don'ts:
${donts || "- —"}
Notes:
${rules.notes || "—"}`;
}

export function formatKnowledgeGraphBlock(bundle: NovelBundle): string {
  const kg = bundle.knowledgeGraph;
  if (!kg) return "# Wissensgraph\n(noch leer)";
  const { [LOGIC_LEDGER_KEY]: _ledger, ...states } = kg.entityStates;
  const ledgerBlock = formatLogicLedgerForAuthor(getLogicLedger(bundle));
  return `# Wissensgraph
## Entity-States
${JSON.stringify(states, null, 2).slice(0, 6_000)}
## Timeline
${JSON.stringify(kg.timelineEvents, null, 2).slice(0, 4_000)}
${ledgerBlock ? `\n${ledgerBlock}` : ""}`;
}

export function formatWorldBlock(bundle: NovelBundle): string {
  const w = bundle.worldBuilding;
  if (!w) return "# Welt\n(noch leer)";
  return `# Weltbau
## Figuren
${JSON.stringify(w.characters, null, 2).slice(0, 6_000)}
## Orte
${JSON.stringify(w.locations, null, 2).slice(0, 3_000)}
## Lore
${JSON.stringify(w.loreRules, null, 2).slice(0, 3_000)}`;
}

/**
 * Canon prefix for write hops: idea + styleguide + voice + world + graph.
 */
export function formatCanonPrefix(
  bundle: NovelBundle,
  opts?: { chapterNumber?: number },
): string {
  const voice = formatVoiceCardForAuthor(
    getVoiceCard(bundle),
    opts?.chapterNumber,
  );
  return [
    `# High Concept\n${bundle.novel.highConceptIdea}`,
    formatStyleGuideBlock(bundle),
    voice,
    formatWorldBlock(bundle),
    formatKnowledgeGraphBlock(bundle),
  ]
    .filter(Boolean)
    .join("\n\n");
}
