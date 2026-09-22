/**
 * Clever erzählt: one adventure Kurzgeschichte from Unterthema + facts.
 * „Abenteuer-Wissen“ lives outside prose (UI card / export), not in the body.
 */

import { generateText } from "@/lib/ai/provider";
import { formatCleverGeschichteBrief } from "@/lib/roman/clever-erzaehlt";
import type { CleverUnterthemaKapitel } from "@/lib/roman/editorial";
import type { RomanEditorial } from "@/lib/roman/editorial";
import { countWords, emptyRomanEditorial } from "@/lib/roman/editorial";
import { scrubManuskriptChapterBody } from "@/lib/roman/plot-chapters";
import { resolveRomanKiRolle } from "@/lib/roman/roles";

/** Marker line used if a legacy body still contains an appended block. */
export const ABENTEUER_WISSEN_HEADING = "———— Abenteuer-Wissen ————";

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

/** Remove a trailing Abenteuer-Wissen block from legacy prose. */
export function stripAbenteuerWissen(body: string): string {
  const text = body.replace(/\r\n/g, "\n");
  const markers = [
    ABENTEUER_WISSEN_HEADING,
    "Abenteuer-Wissen",
    "===ABENTEUER-WISSEN===",
  ];
  let cut = -1;
  for (const m of markers) {
    const i = text.lastIndexOf(m);
    if (i >= 0 && (cut < 0 || i < cut)) cut = i;
  }
  if (cut < 0) return text.trim();
  let start = cut;
  while (start > 0 && (text[start - 1] === "\n" || text[start - 1] === "—")) {
    start -= 1;
  }
  return text.slice(0, start).trim();
}

/**
 * Strip Erzähler wrapper markers / Lernpunkt blocks so only story prose remains.
 * Tolerates models that still emit ===GESCHICHTE=== despite plain-prose prompts.
 */
export function stripErzaehlerWrappers(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").trim();
  const gMatch = text.match(
    /===GESCHICHTE===\s*([\s\S]*?)(?====LERNPUNKT===|===ABENTEUER-WISSEN===|===ENDE===|$)/i,
  );
  if (gMatch?.[1]?.trim()) {
    text = gMatch[1].trim();
  } else {
    text = text
      .replace(/===LERNPUNKT===[\s\S]*$/i, "")
      .replace(/===ENDE===[\s\S]*$/i, "")
      .replace(/===GESCHICHTE===/gi, "")
      .replace(/===ABENTEUER-WISSEN===[\s\S]*$/i, "")
      .trim();
  }
  // Drop a trailing „Lernpunkt:“ section if the model adds it without markers.
  text = text.replace(
    /\n+(?:#{1,3}\s*)?(?:kern)?lernpunkt\s*:?\s*\n[\s\S]*$/i,
    "",
  );
  return stripAbenteuerWissen(text);
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

# Regeln
- Deutsch. Keine Meta-Kommentare im Fließtext.
- Abenteuer-Charakter: Figur(en) mit Ziel, sichtbares Hindernis, Wendepunkt, Erkenntnis — kein reiner Erklärtext.
- Fachlich korrekt: nur die gelieferten Fakten; nichts erfinden.
- Am Ende der Handlung die Erkenntnis spürbar machen (ohne Lehrbuch-Absatz und ohne eigenen „Lernpunkt“-Block).
- Schreibe KEINE Faktliste und kein „Abenteuer-Wissen“ in den Text — das kommt separat in UI/Export.
- KEINE Marker wie ===GESCHICHTE===, ===LERNPUNKT=== oder ===ENDE===.

# Ausgabe
NUR die fertige Abenteuer-Kurzgeschichte als Fließtext (Prosa) — sonst nichts.`;

  const text = await generateText({
    model,
    systemInstruction: rolle.systemPrompt,
    userText,
    preferJson: false,
    maxTokens: 6_000,
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
