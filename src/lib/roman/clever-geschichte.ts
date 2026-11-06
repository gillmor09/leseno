/**
 * Clever erzählt: one adventure Kurzgeschichte from Unterthema + facts.
 * „Abenteuer-Wissen“ lives outside prose (UI card / export), not in the body.
 */

import { generateText } from "@/lib/ai/provider";
import { formatCleverGeschichteBrief } from "@/lib/roman/clever-erzaehlt";
import { formatCleverThemaStanceBrief } from "@/lib/roman/clever-thema-stance";
import type { CleverUnterthemaKapitel } from "@/lib/roman/editorial";
import type { RomanEditorial } from "@/lib/roman/editorial";
import { countWords, emptyRomanEditorial } from "@/lib/roman/editorial";
import { ROMAN_PROSE_MAX_TOKENS } from "@/lib/roman/pipeline/quality-brief";
import {
  ABENTEUER_WISSEN_HEADING,
  stripAbenteuerWissen,
  stripErzaehlerWrappers,
} from "@/lib/roman/clever-geschichte-strip";
import { scrubManuskriptChapterBody } from "@/lib/roman/plot-chapters";
import { resolveRomanKiRolle } from "@/lib/roman/roles";

export {
  ABENTEUER_WISSEN_HEADING,
  stripAbenteuerWissen,
  stripErzaehlerWrappers,
};

/**
 * Format Abenteuer-Wissen for export / print (not stored in Manuskript-Prosa).
 * Reader order after prose: Infografik (separate) → this block.
 */
export function formatAbenteuerWissenBlock(fakten: string[]): string {
  const items = fakten.map((f) => f.trim()).filter((f) => f.length >= 3);
  if (items.length === 0) return "";
  const lines = items.map((f, i) => {
    const n = i + 1;
    const mark =
      n <= 10 ? ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"][n - 1]! : `${n}.`;
    return `${mark}  ${f}`;
  });
  return [
    ABENTEUER_WISSEN_HEADING,
    "",
    "Was du aus diesem Abenteuer mitnimmst:",
    "",
    ...lines,
  ].join("\n");
}

/** Numbered takeaway lines for PDF/EPUB (without the decorative heading fence). */
export function abenteuerWissenExportLines(fakten: string[]): string[] {
  return fakten
    .map((f) => f.trim())
    .filter((f) => f.length >= 3)
    .map((f, i) => `${i + 1}. ${f}`);
}

/**
 * True when the chapter body is still the Unterthemen mirror (Faktenliste),
 * not a written Kurzgeschichte.
 */
export function isCleverUnterthemenPlaceholderBody(body: string): boolean {
  const t = stripErzaehlerWrappers(body).replace(/\r\n/g, "\n").trim();
  if (!t) return true;
  if (/^Faktencheck\s*:/im.test(t)) return true;
  if (/^Hinweis\s*:/im.test(t)) return true;
  const lines = t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return true;
  const metaOrBullet = lines.filter(
    (l) =>
      /^Faktencheck\s*:/i.test(l) ||
      /^Hinweis\s*:/i.test(l) ||
      /^[-*•]\s+/.test(l) ||
      /^→/.test(l) ||
      /^Korrektur\s*:/i.test(l),
  ).length;
  return metaOrBullet / lines.length >= 0.55;
}

/**
 * True only for a real adventure story — Unterthemen-Platzhalter zählen nicht.
 */
export function hasRealCleverGeschichteProse(body: string): boolean {
  const scrubbed = scrubManuskriptChapterBody(stripErzaehlerWrappers(body));
  if (!scrubbed || isCleverUnterthemenPlaceholderBody(scrubbed)) return false;
  return scrubbed.length >= 80 && countWords(scrubbed) >= 40;
}

/**
 * Erzähler: adventure Kurzgeschichte for one Unterthema (prosa only).
 */
export async function writeCleverGeschichte(input: {
  thema: string;
  editorial: RomanEditorial;
  kapitel: CleverUnterthemaKapitel;
}): Promise<{
  body: string;
  wordCount: number;
  modelLabel: string;
  /** @deprecated Always empty — Lernpunkt lives in the story, not as a separate block. */
  lernpunkt: string;
  fakten: string[];
}> {
  const fakten = input.kapitel.fakten.map((f) => f.trim()).filter(Boolean);
  if (fakten.length < 3) {
    throw new Error(
      `Geschichte ${input.kapitel.nummer}: zu wenige Fakten (mind. 3). Unterthemen prüfen.`,
    );
  }

  const brief = formatCleverGeschichteBrief(input.editorial);
  const stanceBrief = formatCleverThemaStanceBrief(
    input.editorial.cleverThemaStance,
  );
  const { rolle, model } = await resolveRomanKiRolle("clever_erzaehler");
  const faktenList = fakten.map((f, i) => `${i + 1}. ${f}`).join("\n");

  const userText = `# Auftrag
Schreibe EINE eigenständige Abenteuer-Kurzgeschichte zu diesem Unterthema.
Die Geschichte soll sich wie ein kleines Abenteuer anfühlen: Neugier, Hindernis, Spannung, Wendung, glückliche/erhellende Auflösung.

# Buch-Thema
${input.thema.trim() || "—"}

# Unterthema (Kapitel ${input.kapitel.nummer})
${input.kapitel.titel}

# Verbindliche Fakten (ALLE müssen in der Handlung vorkommen — nicht als Vortrag, sondern erlebt)
${faktenList}

# Länge & Stil (verbindlich)
${brief || "Altersgerechte Kurzgeschichte laut Buch-Auswahl."}

${stanceBrief ? `${stanceBrief}\n` : ""}
# Regeln
- Deutsch. Keine Meta-Kommentare im Fließtext.
- Abenteuer-Charakter: Figur(en) mit Ziel, sichtbares Hindernis, Wendepunkt, Erkenntnis — kein reiner Erklärtext.
- Fachlich korrekt: nur die gelieferten Fakten; nichts erfinden.
- Am Ende der Handlung die Erkenntnis spürbar machen (ohne Lehrbuch-Absatz und ohne eigenen „Lernpunkt“-Block) — als Handlungsmacht, nicht als Predigt.
- Schreibe KEINE Faktliste und kein „Abenteuer-Wissen“ in den Text — das kommt separat in UI/Export.
- KEINE Marker wie ===GESCHICHTE===, ===LERNPUNKT=== oder ===ENDE===.

# Ausgabe
NUR die fertige Abenteuer-Kurzgeschichte als Fließtext (Prosa) — sonst nichts.`;

  const text = await generateText({
    model,
    systemInstruction: rolle.systemPrompt,
    userText,
    preferJson: false,
    maxTokens: ROMAN_PROSE_MAX_TOKENS,
    timeoutMs: 180_000,
  });

  const body = scrubManuskriptChapterBody(stripErzaehlerWrappers(text));
  if (body.trim().length < 80) {
    throw new Error(
      `Geschichte ${input.kapitel.nummer}: Erzähler lieferte zu wenig Text. Bitte erneut.`,
    );
  }

  return {
    body,
    wordCount: countWords(body),
    modelLabel: model.label,
    lernpunkt: "",
    fakten,
  };
}

/** Resolve Unterthema chapter from editorial for a story number. */
export function cleverKapitelForStory(
  editorial: RomanEditorial | null | undefined,
  chapterNumber: number,
): CleverUnterthemaKapitel | null {
  const ed = editorial ?? emptyRomanEditorial();
  const doc = ed.cleverUnterthemen;
  if (!doc) return null;
  return doc.kapitel.find((k) => k.nummer === chapterNumber) ?? null;
}
