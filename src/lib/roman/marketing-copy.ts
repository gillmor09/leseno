/**
 * Amazon / Klappentext marketing copy for a roman:
 * back-cover blurb + one-line eyecatcher (Untertitel / Search hook).
 */

import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import { resolveRomanTextModel } from "@/lib/roman/model";
import type { RomanCharakter, RomanKontext } from "@/lib/roman/types";

export type RomanMarketingCopyResult = {
  klappentext: string;
  einzeiler: string;
};

function formatChars(chars: RomanCharakter[]): string {
  return chars
    .filter((c) => c.name.trim())
    .slice(0, 5)
    .map((c) => `${c.name.trim()}${c.rolle.trim() ? ` (${c.rolle.trim()})` : ""}`)
    .join("; ");
}

/**
 * Gemini writes German Klappentext + Einzeiler from book materials.
 */
export async function generateRomanMarketingCopy(input: {
  title: string;
  genre: string;
  praemisse: string;
  tonalitaet: string;
  ideeKurz?: string;
  alterLabel?: string;
  charaktere: RomanCharakter[];
  manuskriptExcerpt?: string;
}): Promise<RomanMarketingCopyResult> {
  const model = await resolveRomanTextModel();
  const systemInstruction = `Du schreibst Verkaufstexte für deutsche eBooks (Amazon KDP).
Antworte NUR als JSON-Objekt:
{"klappentext":"...","einzeiler":"..."}

klappentext = Rückseitentext / Amazon-Produktbeschreibung:
- Deutsch, Appetitmacher, 90–160 Wörter
- Spannungsbogen andeuten, ohne Spoiler des Endes
- Genre- und Altersklassen-Ton treffen
- Keine Hashtags, kein HTML, keine „In diesem Buch…“-Meta-Floskeln

einzeiler = Untertitel / Eyecatcher für Amazon (Suchergebnis / Unterzeile):
- Ein Satz oder Satzfragment, max. 90 Zeichen
- Neugierig machen, Kernversprechen, kein Titel wiederholen`;

  const userText = `# Titel
${input.title.trim() || "(ohne Titel)"}

# Genre
${input.genre.trim() || "—"}

# Altersklasse
${input.alterLabel?.trim() || "—"}

# Prämisse / Kernaussage
${input.praemisse.trim() || "—"}

# Ton
${input.tonalitaet.trim() || "—"}

# Idee (gekürzt)
${(input.ideeKurz ?? "").trim().slice(0, 3_500) || "—"}

# Figuren
${formatChars(input.charaktere) || "—"}

# Ausschnitt
${(input.manuskriptExcerpt ?? "").trim().slice(0, 4_000) || "—"}

Schreibe klappentext und einzeiler jetzt.`;

  const raw = await generateText({
    model,
    systemInstruction,
    userText,
    preferJson: true,
    maxTokens: 1_200,
    timeoutMs: 60_000,
  });
  const parsed = parseModelJsonObject(raw) as {
    klappentext?: unknown;
    einzeiler?: unknown;
  };
  const klappentext =
    typeof parsed.klappentext === "string" ? parsed.klappentext.trim() : "";
  const einzeiler =
    typeof parsed.einzeiler === "string" ? parsed.einzeiler.trim() : "";
  if (klappentext.length < 40 || einzeiler.length < 8) {
    throw new Error("Marketing-Text unvollständig — bitte erneut erzeugen.");
  }
  return {
    klappentext: klappentext.slice(0, 4_000),
    einzeiler: einzeiler.slice(0, 120),
  };
}

export function marketingCopySourceFromRoman(roman: RomanKontext): {
  title: string;
  genre: string;
  praemisse: string;
  tonalitaet: string;
  ideeKurz: string;
  alterLabel: string;
  charaktere: RomanCharakter[];
  manuskriptExcerpt: string;
} {
  const ed = roman.editorial;
  const alter =
    ed?.zielAlterMin != null || ed?.zielAlterMax != null
      ? ed.zielAlterMin != null && ed.zielAlterMax != null
        ? `${ed.zielAlterMin}–${ed.zielAlterMax} Jahre`
        : ed.zielAlterMin != null
          ? `ab ${ed.zielAlterMin}`
          : `bis ${ed.zielAlterMax}`
      : "";
  const prose = (ed?.manuskriptText ?? "").trim();
  const outline = (roman.manuskriptRaw ?? "").trim();
  return {
    title: roman.title,
    genre: roman.genre,
    praemisse: roman.praemisse,
    tonalitaet: roman.tonalitaet,
    ideeKurz: ed?.ideeKurz ?? "",
    alterLabel: alter,
    charaktere: roman.charaktere,
    manuskriptExcerpt: prose || outline,
  };
}
