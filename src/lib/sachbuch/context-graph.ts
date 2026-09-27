/**
 * Phase 4 — per-chapter Context Graph.
 */

import { generateText } from "@/lib/ai/provider";
import { SACHBUCH_KAPITEL_WORDS_TARGET } from "@/lib/sachbuch/agent-defaults";
import { resolveSachbuchAgentModel } from "@/lib/sachbuch/resolve-agent";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "@/lib/sachbuch/repository";
import type { SachbuchContextGraph, SachbuchKontext } from "@/lib/sachbuch/types";

export async function generateSachbuchContextGraph(input: {
  sachbuchId: string;
  kapitelId: string;
}): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(input.sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  const kapitel = book.kapitel.find((k) => k.id === input.kapitelId);
  if (!kapitel) throw new Error("Kapitel nicht gefunden.");

  const idx = book.kapitel.findIndex((k) => k.id === input.kapitelId);
  const prev = book.kapitel.slice(0, Math.max(0, idx));
  const prevTerms = prev.flatMap((k) => k.contextGraph.establishedTerms);
  const evidenz = book.evidenz.claims
    .slice(0, 15)
    .map((c) => c.claim)
    .join("; ");

  const slot = book.agents.architect;
  const model = await resolveSachbuchAgentModel(slot);
  const raw = await generateText({
    model,
    systemInstruction: slot.systemPrompt,
    userText: `Buch: ${book.title}
UVP: ${book.idee.unpopularOpinion}
Kapitel: ${kapitel.title}
Ziele: ${kapitel.goals}

Vorgänger-Kapitel: ${prev.map((k) => k.title).join(", ") || "keins"}
Bereits etablierte Begriffe: ${prevTerms.join(", ") || "—"}
Evidenz-Claims: ${evidenz || "—"}

Erzeuge Context Graph als JSON:
{
  "readerKnowledge": "Was weiß der Leser hier bereits?",
  "establishedTerms": ["Begriff1", "..."],
  "claimsToProve": ["Behauptung die hier bewiesen werden muss", "..."],
  "dependsOnKapitelIds": []
}
claimsToProve: 8–14 konkrete Behauptungen (genug Stoff für ein volles Kapitel à ca. ${SACHBUCH_KAPITEL_WORDS_TARGET} Wörter).
dependsOnKapitelIds nur aus: ${prev.map((k) => k.id).join(", ") || "(leer)"}.
Kein Markdown-Fence.`,
    preferJson: true,
    maxTokens: 3000,
    timeoutMs: 180_000,
  });

  let graph: SachbuchContextGraph = { ...kapitel.contextGraph };
  try {
    const cleaned = raw.replace(/^```json?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<SachbuchContextGraph>;
    const allowed = new Set(prev.map((k) => k.id));
    graph = {
      readerKnowledge: String(parsed.readerKnowledge ?? "").trim(),
      establishedTerms: Array.isArray(parsed.establishedTerms)
        ? parsed.establishedTerms.map((t) => String(t).trim()).filter(Boolean)
        : [],
      claimsToProve: Array.isArray(parsed.claimsToProve)
        ? parsed.claimsToProve.map((t) => String(t).trim()).filter(Boolean)
        : [],
      dependsOnKapitelIds: Array.isArray(parsed.dependsOnKapitelIds)
        ? parsed.dependsOnKapitelIds
            .map((id) => String(id))
            .filter((id) => allowed.has(id))
        : [],
    };
  } catch {
    throw new Error("Context-Graph-JSON ungültig. Bitte erneut versuchen.");
  }

  return patchSachbuchKapitel(input.sachbuchId, input.kapitelId, {
    contextGraph: graph,
    status: "graph",
  });
}
