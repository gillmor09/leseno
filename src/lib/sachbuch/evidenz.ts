/**
 * Phase 2 — Evidence mapping via Google Search (no RAG).
 */

import { generateWithGemini } from "@/lib/ai/gemini";
import { generateText } from "@/lib/ai/provider";
import { resolveSachbuchAgentModel } from "@/lib/sachbuch/resolve-agent";
import {
  getSachbuchKontext,
  patchSachbuchBook,
} from "@/lib/sachbuch/repository";
import type {
  SachbuchEvidenzClaim,
  SachbuchGroundingSource,
  SachbuchKontext,
} from "@/lib/sachbuch/types";

type ClaimJson = {
  claim?: string;
  evidence?: string;
  counter?: string;
};

/**
 * Run researcher with Google Search; store claims + sources.
 */
export async function runSachbuchEvidenz(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  if (!book.idee.unpopularOpinion.trim() && !book.idee.briefing.trim()) {
    throw new Error("Zuerst UVP schärfen (Phase 1).");
  }

  const slot = book.agents.researcher;
  const model = await resolveSachbuchAgentModel(slot);
  const userText = `Buch: ${book.title}
Zielgruppe: ${book.zielgruppe.trim() || "—"}

UVP / Unpopular Opinion:
${book.idee.unpopularOpinion.trim() || "—"}

Briefing:
${book.idee.briefing.trim() || "—"}

Case Studies:
${book.idee.caseStudies.join("\n") || "—"}

Aufgabe: Recherche (Google Search). Liefere JSON:
{
  "queries": ["Suchanfrage 1", "..."],
  "claims": [
    { "claim": "...", "evidence": "...", "counter": "..." }
  ]
}
Kein Markdown-Fence. Keine erfundenen Studien.`;

  let text = "";
  let sources: SachbuchGroundingSource[] = [];

  if (
    slot.googleSearch &&
    model.provider.trim().toLowerCase() === "gemini"
  ) {
    const result = await generateWithGemini({
      modelSlug: model.modelSlug,
      systemInstruction: slot.systemPrompt,
      userText,
      googleSearch: true,
      maxTokens: 8192,
      timeoutMs: 300_000,
    });
    text = result.text.trim();
    sources = (result.groundingSources ?? []).map((s) => ({
      title: s.title || s.uri,
      uri: s.uri,
    }));
  } else {
    text = (
      await generateText({
        model,
        systemInstruction: slot.systemPrompt,
        userText,
        preferJson: true,
        maxTokens: 8192,
        timeoutMs: 300_000,
      })
    ).trim();
  }

  let queries: string[] = [];
  let claims: SachbuchEvidenzClaim[] = [];
  try {
    const cleaned = text.replace(/^```json?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      queries?: string[];
      claims?: ClaimJson[];
    };
    queries = Array.isArray(parsed.queries)
      ? parsed.queries.map((q) => String(q).trim()).filter(Boolean)
      : [];
    claims = Array.isArray(parsed.claims)
      ? parsed.claims.map((c) => ({
          id: crypto.randomUUID(),
          claim: String(c.claim ?? "").trim(),
          evidence: String(c.evidence ?? "").trim(),
          counter: String(c.counter ?? "").trim(),
          sources: sources.slice(0, 5),
        }))
      : [];
  } catch {
    claims = [
      {
        id: crypto.randomUUID(),
        claim: "Roh-Recherche (JSON-Parse fehlgeschlagen)",
        evidence: text.slice(0, 4000),
        counter: "",
        sources,
      },
    ];
  }

  return patchSachbuchBook(sachbuchId, {
    evidenz: {
      queries,
      claims,
      status: claims.length > 0 ? "ready" : "in_progress",
    },
  });
}
