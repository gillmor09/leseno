/**
 * Recherche tab (Idee → Spec): Google-Search coach dialog + dossier weave.
 * Uses Gemini roles `recherche_coach` / `recherche_redakteur`.
 */

import { generateWithGemini } from "@/lib/ai/gemini";
import {
  BUCHTYP_LABELS,
  type RomanBuchTyp,
  type RomanRechercheSource,
} from "@/lib/roman/editorial";
import { CLIP, ROMAN_PROSE_MAX_TOKENS } from "@/lib/roman/pipeline/quality-brief";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import type { RomanIdeaChatMessage } from "@/lib/roman/types";

const MAX_HISTORY = 40;
const MARK_START = "===RECHERCHE===";
const MARK_ENDE = "===ENDE===";

export const RECHERCHE_SCOPE_MANDATE = `Stufe Recherche — Zweck und Grenzen (verbindlich):
- Hintergrundrecherche vertieft die Idee mit belegbaren Fakten, Kontexten und Fachhintergründen für die spätere Spec.
- Erlaubt: Definitionen, Historie, Orte/Prozesse, gesellschaftliche/technische Kontexte, Kontroversen, typische Missverständnisse, Quellenhinweise.
- VERBOTEN: Kapitelpläne, Szenenfolgen, fertige Figurensteckbriefe, Exposé-Prosa, Ideendokumentation ersetzen.
- Keine erfundenen „Fakten“ — Unsicheres kennzeichnen.`;

const OUTPUT_HINT = `Ausgabeformat (verbindlich):

${MARK_START}
…vollständiges Hintergrunddossier als Fließtext/Absätze…
${MARK_ENDE}

Kein JSON, keine Markdown-Fences, kein Meta-Text außerhalb der Marker.
${RECHERCHE_SCOPE_MANDATE}`;

function formatHistory(messages: RomanIdeaChatMessage[]): string {
  return messages
    .slice(-MAX_HISTORY)
    .map((m) => {
      const who = m.role === "user" ? "Autor:in" : "Recherche-Coach";
      return `${who}:\n${m.content.trim()}`;
    })
    .join("\n\n");
}

function stripFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json|markdown|md|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseRechercheDossier(raw: string): string {
  const cleaned = stripFence(raw);
  const start = cleaned.indexOf(MARK_START);
  const end = cleaned.lastIndexOf(MARK_ENDE);
  if (start >= 0 && end > start) {
    return cleaned
      .slice(start + MARK_START.length, end)
      .trim()
      .slice(0, 50_000);
  }
  // Soft fallback: whole reply if markers missing.
  return cleaned.slice(0, 50_000);
}

function mapSources(
  sources: Array<{ title: string; uri: string }> | undefined,
): RomanRechercheSource[] {
  if (!sources?.length) return [];
  return sources
    .map((s) => ({
      title: String(s.title ?? "").trim().slice(0, 300),
      uri: String(s.uri ?? "").trim().slice(0, 2_000),
    }))
    .filter((s) => Boolean(s.uri))
    .slice(0, 24);
}

async function requireGeminiRolle(key: string) {
  const resolved = await resolveRomanKiRolle(key);
  if (resolved.model.provider.trim().toLowerCase() !== "gemini") {
    throw new Error(
      `${resolved.rolle.label} braucht ein Gemini-Modell (Google Search). Bitte unter KI-Rollen anpassen.`,
    );
  }
  return resolved;
}

/**
 * One coach reply with Google Search (does not write the dossier).
 */
export async function chatRechercheCoach(input: {
  buchTyp: RomanBuchTyp;
  ideeKurz: string;
  dossier: string;
  history: RomanIdeaChatMessage[];
  userMessage: string;
}): Promise<{
  reply: string;
  modelLabel: string;
  sources: RomanRechercheSource[];
}> {
  const { rolle, model } = await requireGeminiRolle("recherche_coach");
  const typLabel =
    input.buchTyp === "unbekannt"
      ? "noch offen"
      : BUCHTYP_LABELS[input.buchTyp];

  const userText = `# Buchtyp
${typLabel}

${RECHERCHE_SCOPE_MANDATE}

# Ideendokumentation (Kontext — nicht umschreiben)
${input.ideeKurz.trim().slice(0, CLIP.idee) || "(noch dünn — trotzdem recherchieren, wo sinnvoll)"}

# Bisheriges Hintergrunddossier (nur Kontext — du schreibst es nicht um)
${input.dossier.trim().slice(0, CLIP.recherche) || "(noch leer)"}

# Dialog bisher
${formatHistory(input.history) || "(Beginn)"}

# Neue Nachricht der Autor:in
${input.userMessage.trim()}

Antworte als Recherche-Coach.
Nutze Google Search aktiv für belastbare Hintergründe.
Gib knappe Faktenimpulse + max. 2–3 gezielte Rückfragen oder nächste Recherche-Winkel.
Keine Kapitelpläne, keine Spec-Prosa.`;

  const result = await generateWithGemini({
    modelSlug: model.modelSlug,
    systemInstruction: `${rolle.systemPrompt}

${RECHERCHE_SCOPE_MANDATE}`,
    userText,
    googleSearch: true,
    thinkingLevel: model.reasoningEffort ?? "low",
    maxTokens: 4_000,
    timeoutMs: 180_000,
  });

  const reply = result.text.trim();
  if (!reply) {
    throw new Error("Recherche-Coach hat keine Antwort geliefert.");
  }
  return {
    reply: reply.slice(0, 20_000),
    modelLabel: model.label,
    sources: mapSources(result.groundingSources),
  };
}

/**
 * Weave latest turn + search findings into the full research dossier.
 */
export async function weaveRechercheDossier(input: {
  buchTyp: RomanBuchTyp;
  ideeKurz: string;
  dossier: string;
  userMessage: string;
  coachReply: string;
}): Promise<{
  dossier: string;
  modelLabel: string;
  sources: RomanRechercheSource[];
}> {
  const { rolle, model } = await requireGeminiRolle("recherche_redakteur");
  const typLabel =
    input.buchTyp === "unbekannt"
      ? "noch offen"
      : BUCHTYP_LABELS[input.buchTyp];

  const userText = `# Buchtyp
${typLabel}

${RECHERCHE_SCOPE_MANDATE}

# Ideendokumentation (Kontext)
${input.ideeKurz.trim().slice(0, CLIP.idee) || "(leer)"}

# Bisheriges Hintergrunddossier
${input.dossier.trim().slice(0, CLIP.recherche) || "(leer — aus diesem Turn neu aufbauen)"}

# Neuester Dialog-Turn
Autor:in:
${input.userMessage.trim()}

Recherche-Coach:
${input.coachReply.trim()}

Auftrag:
Erzeuge das VOLLSTÄNDIGE verwobene Hintergrunddossier (nicht nur Diff).
Nutze Google Search, um Fakten zu prüfen/ergänzen.
Quellen kurz im Text nennen, wo hilfreich.
Keine Ideendokumentation ersetzen, keine Kapitelpläne, keine Spec-Steckbriefe.

${OUTPUT_HINT}`;

  const result = await generateWithGemini({
    modelSlug: model.modelSlug,
    systemInstruction: `${rolle.systemPrompt}

${RECHERCHE_SCOPE_MANDATE}

Für DIESE Antwort:
${OUTPUT_HINT}`,
    userText,
    googleSearch: true,
    thinkingLevel: model.reasoningEffort ?? "low",
    maxTokens: ROMAN_PROSE_MAX_TOKENS,
    timeoutMs: 180_000,
  });

  const dossier = parseRechercheDossier(result.text);
  if (dossier.length < 20) {
    throw new Error("Recherche-Dossier konnte nicht aktualisiert werden.");
  }
  return {
    dossier,
    modelLabel: model.label,
    sources: mapSources(result.groundingSources),
  };
}
