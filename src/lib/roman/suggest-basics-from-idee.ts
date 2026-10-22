/**
 * Derive Basics (genre, tonality, grobRegeln, optional age) from Idee.
 * Runs after Idee Hard-Gate is green; user can edit on the Basics tab.
 */

import { generateText } from "@/lib/ai/provider";
import {
  BUCHTYP_LABELS,
  ideeFingerprintForBasics,
  type RomanBuchTyp,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import { CLIP, ROMAN_DRAFT_MAX_TOKENS } from "@/lib/roman/pipeline/quality-brief";
import { resolveRomanKiRolle } from "@/lib/roman/roles";

export type BasicsFromIdeeSuggest = {
  genre: string;
  tonalitaet: string;
  grobRegeln: string;
  zielAlterMin: number | null;
  zielAlterMax: number | null;
  begruendung: string;
  modelLabel: string;
  ideeFingerprint: string;
};

function stripFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json|markdown|md|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const cleaned = stripFence(raw);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("KI lieferte kein JSON für Basics-Ableitung.");
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new Error("Basics-Ableitung: JSON ungültig.");
  }
}

function asAge(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i < 0 || i > 120) return null;
  return i;
}

/**
 * Suggest Genre / Tonalität / Basis-Regeln (and optional age band) from Idee.
 */
export async function suggestBasicsFromIdee(input: {
  buchTyp: RomanBuchTyp;
  title: string;
  ideeKurz: string;
  existingGenre?: string;
  existingTonalitaet?: string;
  existingGrobRegeln?: string;
  existingAlterMin?: number | null;
  existingAlterMax?: number | null;
}): Promise<BasicsFromIdeeSuggest> {
  const idee = input.ideeKurz.trim();
  if (idee.length < 80) {
    throw new Error(
      "Idee zu dünn — bitte zuerst Idee ausarbeiten (Hard-Gate), dann Basics ableiten.",
    );
  }

  const { rolle, model } = await resolveRomanKiRolle("entwicklungslektor");
  const userText = `# Auftrag
Leite aus der Ideendokumentation passende Basics ab: Genre, Sprache & Tonalität (Schreiber),
Basis-Regeln (harte Verbote/Gebote fürs ganze Buch), optional Zielalter.

# Buchtyp
${BUCHTYP_LABELS[input.buchTyp]}
Titel (Orientierung): ${input.title.trim() || "(ohne)"}

# Ideendokumentation
${idee.slice(0, CLIP.idee)}

# Bestehende Werte (nur Hinweis — bei Konflikt Idee hat Vorrang, außer Autor hat klar Besseres)
Genre: ${(input.existingGenre ?? "").trim() || "(leer)"}
Tonalität: ${(input.existingTonalitaet ?? "").trim() || "(leer)"}
Grob-Regeln: ${(input.existingGrobRegeln ?? "").trim() || "(leer)"}
Alter: ${input.existingAlterMin ?? "?"}-${input.existingAlterMax ?? "?"}

# Ausgabe (NUR ein JSON-Objekt, keine Markdown-Fences)
{
  "genre": "kurzes Genre-Label DE",
  "tonalitaet": "1–3 Absätze Stimme/Register/Humor-Tabus — Priority-0 für Prosa",
  "grobRegeln": "Bullet-Absatz Basis-Regeln (MUSS/DARF NICHT) — Priority-0 Canon",
  "zielAlterMin": 12,
  "zielAlterMax": 99,
  "begruendung": "2–4 Sätze warum diese Basics zur Idee passen"
}

Regeln:
- Humor nur verlangen, wenn die Idee es trägt — kein erzwungenes Comedy-Buch.
- grobRegeln konkret und prüfbar (nicht weich).
- zielAlterMin/Max Zahlen oder null; bei Erwachsenen-Spannung oft 16–99 oder 18–99.`;

  const raw = await generateText({
    model,
    systemInstruction: `${rolle.systemPrompt}

Zusatz: Du bist Entwicklungslektor für Verlags-Basics. Antworte ausschließlich mit dem JSON-Objekt.`,
    userText,
    preferJson: true,
    maxTokens: Math.min(ROMAN_DRAFT_MAX_TOKENS, 4_000),
  });

  const obj = parseJsonObject(raw);
  const genre = String(obj.genre ?? "").trim().slice(0, 200);
  const tonalitaet = String(obj.tonalitaet ?? "").trim().slice(0, 2_000);
  const grobRegeln = String(obj.grobRegeln ?? "").trim().slice(0, 8_000);
  const begruendung = String(obj.begruendung ?? "").trim().slice(0, 1_200);
  if (genre.length < 2) {
    throw new Error("Basics-Ableitung: Genre fehlt.");
  }
  if (tonalitaet.length < 40) {
    throw new Error("Basics-Ableitung: Tonalität zu dünn.");
  }
  if (grobRegeln.length < 40) {
    throw new Error("Basics-Ableitung: Basis-Regeln zu dünn.");
  }

  let min = asAge(obj.zielAlterMin);
  let max = asAge(obj.zielAlterMax);
  if (min != null && max != null && min > max) {
    const t = min;
    min = max;
    max = t;
  }

  return {
    genre,
    tonalitaet,
    grobRegeln,
    zielAlterMin: min,
    zielAlterMax: max,
    begruendung: begruendung || "Aus der Idee abgeleitet.",
    modelLabel: model.label,
    ideeFingerprint: ideeFingerprintForBasics(idee),
  };
}

/** True when Basics look empty enough to auto-fill without confirm. */
export function basicsLookEmptyForAutoDerive(input: {
  genre?: string | null;
  tonalitaet?: string | null;
  editorial?: RomanEditorial | null;
}): boolean {
  const ton = (input.tonalitaet ?? "").trim();
  const grob = (input.editorial?.grobRegeln ?? "").trim();
  const genre = (input.genre ?? "").trim();
  return ton.length < 40 && grob.length < 40 && genre.length < 2;
}
