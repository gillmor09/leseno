/**
 * Book-specific hard publisher rules (MUSS bullets) via the strongest wired LLM.
 * Claude Sonnet 5 preferred for tight editorial discipline; Gemini 3.8 Flash fallback.
 */

import { generateText } from "@/lib/ai/provider";
import { findWiredAiEndpoint } from "@/lib/ai/wired-models";
import type { RomanEditorial } from "@/lib/roman/editorial";
import { resolveRomanSchreibModel } from "@/lib/roman/model";
import type { AiModelConfig } from "@/lib/prompts/catalog";
import type { RomanCharakter, RomanSzenenRasterItem } from "@/lib/roman/types";

const SYSTEM = `Du bist Cheflektor:in eines renommierten Belletristik-Verlags.
Du formulierst HARTE Verlagsregeln (MUSS) für genau EINEN Roman — kurz, prüfbar, ohne Floskeln.
Keine Vorschläge („versuche“, „achte darauf“), sondern Befehle.
Keine Wiederholung des allgemeinen Show-don't-tell-Grundsatzes, außer alters- oder genrespezifisch zugespitzt.
Antwort: ausschließlich JSON.`;

export type HarteRegelnGenerateInput = {
  title: string;
  genre: string;
  praemisse: string;
  tonalitaet: string;
  perspektive: string;
  zeitform: string;
  stilbibel: string;
  kiRegelwerk: string;
  manuskriptRaw: string;
  charaktere: RomanCharakter[];
  szenenRaster: RomanSzenenRasterItem[];
  editorial: RomanEditorial;
  /** Existing bullets — model may refine/replace, not ignore context. */
  existingHarteRegeln: string[];
};

function wiredConfig(slug: string): AiModelConfig | null {
  const endpoint = findWiredAiEndpoint(slug);
  if (!endpoint) return null;
  if (
    endpoint.provider !== "gemini" &&
    endpoint.provider !== "claude" &&
    endpoint.provider !== "openai-compatible"
  ) {
    return null;
  }
  return {
    id: endpoint.modelSlug,
    label: endpoint.label,
    provider: endpoint.provider,
    modelSlug: endpoint.modelSlug,
    supportsSystemPrompt: true,
    supportsJsonOutput: true,
    isActive: true,
    notes: null,
    ttsVoiceId: null,
  };
}

/**
 * Best wired model for editorial rule crafting: Claude Sonnet 5 → Gemini 3.8 Flash.
 */
export async function resolveRomanEditorialRulesModel(): Promise<AiModelConfig> {
  const claude = wiredConfig("claude-sonnet-5");
  if (claude) return claude;
  const gemini = wiredConfig("gemini-3.8-flash");
  if (gemini) return gemini;
  return resolveRomanSchreibModel("gemini-3.8-flash");
}

function parseRulesJson(raw: string): string[] {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fence?.[1] ?? trimmed).trim();
  try {
    const parsed = JSON.parse(body) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((x) => String(x).trim()).filter(Boolean);
    }
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { rules?: unknown }).rules)) {
      return ((parsed as { rules: unknown[] }).rules)
        .map((x) => String(x).trim())
        .filter(Boolean);
    }
  } catch {
    // fall through to line parse
  }
  return body
    .split("\n")
    .map((l) => l.replace(/^[\s\-–•*\d.)]+/, "").trim())
    .filter((l) => l.length >= 12);
}

/**
 * Generates 5–8 book-specific hard rules; replaces the editable list (user reviews).
 */
export async function generateHarteRegelnForBook(
  input: HarteRegelnGenerateInput,
): Promise<{ rules: string[]; modelLabel: string }> {
  const model = await resolveRomanEditorialRulesModel();
  const e = input.editorial;
  const age =
    e.zielAlterMin != null || e.zielAlterMax != null
      ? `${e.zielAlterMin ?? "?"}-${e.zielAlterMax ?? "?"} Jahre`
      : "nicht gesetzt";
  const chars = input.charaktere
    .filter((c) => c.name.trim())
    .slice(0, 10)
    .map(
      (c) =>
        `${c.name}${c.alter ? ` (${c.alter})` : ""}: ${c.motivation || c.rolle || "—"}`,
    )
    .join("\n");
  const existing =
    input.existingHarteRegeln.filter((r) => r.trim()).join("\n") || "(noch keine)";

  const userText = `Erzeuge harte Verlagsregeln für DIESES Buch.

# Buch
Titel: ${input.title || "(ohne)"}
Genre: ${input.genre || "—"}
Prämisse: ${input.praemisse || "—"}
Tonalität: ${input.tonalitaet || "—"}
Perspektive: ${input.perspektive || "—"}
Zeitform: ${input.zeitform || "—"}

# Zielgruppe / Umfang
Alter: ${age}
Lesestufe: ${e.lesestufe || "—"}
Zielwortzahl Roman: ${e.zielWortzahlRoman ?? "offen"}
Szenenlänge: ${e.zielWortzahlSzeneMin ?? "?"}–${e.zielWortzahlSzeneMax ?? "?"} Wörter
Mehrteiler: ${e.mehrteilerForm}${e.serieTitel ? ` · ${e.serieTitel}` : ""}

# Figuren (Auszug)
${chars || "—"}

# Bereits gesetzte harte Regeln (darfst verschärfen/ersetzen)
${existing}

# Stilbibel / KI-Regelwerk (Kontext, nicht abschreiben)
${(input.stilbibel || input.kiRegelwerk || "").trim().slice(0, 2500) || "—"}

# Outline-Auszug
${(input.manuskriptRaw || "").trim().slice(0, 4000) || "—"}

Anforderungen:
- Genau 5 bis 8 Regeln
- Jede Regel ein vollständiger deutscher Imperativ-Satz (max. ca. 140 Zeichen)
- Spezifisch für Genre + Zielalter + Prämisse dieses Buchs
- Keine generischen KI-Floskeln, keine Meta-Kommentare

Antwort ausschließlich als JSON-Objekt:
{"rules":["…","…"]}`;

  const text = await generateText({
    model,
    systemInstruction: SYSTEM,
    maxTokens: 2000,
    userText,
  });
  const rules = parseRulesJson(text).slice(0, 8);
  if (rules.length < 3) {
    throw new Error("Zu wenige brauchbare Regeln von der KI — bitte erneut versuchen.");
  }
  return { rules, modelLabel: model.label };
}
