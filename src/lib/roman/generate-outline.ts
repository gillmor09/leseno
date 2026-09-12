/**
 * Generates an editable outline/exposé from book foundation (steps 1–4).
 * Written into `manuskriptRaw` so Phase 0 and later scenes can build on it.
 */

import { generateText } from "@/lib/ai/provider";
import { buildRomanPromptContext } from "@/lib/roman/fundament";
import { resolveRomanTextModel } from "@/lib/roman/model";
import type { RomanCharakter, RomanSzenenRasterItem } from "@/lib/roman/types";

export type RomanOutlineGenerateInput = {
  title: string;
  genre: string;
  praemisse: string;
  perspektive: string;
  zeitform: string;
  tonalitaet: string;
  stilbibel: string;
  charaktere: RomanCharakter[];
  weltSchauplaetze: string;
  weltRegeln: string;
  szenenRaster: RomanSzenenRasterItem[];
  kiRegelwerk: string;
  fanPersonaName: string;
  fanPersonaProfil: string;
};

function hasEnoughFoundation(input: RomanOutlineGenerateInput): boolean {
  if (input.praemisse.trim().length >= 20) return true;
  if (input.genre.trim().length >= 2 && input.tonalitaet.trim().length >= 5) {
    return true;
  }
  if (input.szenenRaster.some((r) => r.szenenziel.trim().length >= 10)) {
    return true;
  }
  if (input.charaktere.some((c) => c.name.trim() && c.motivation.trim())) {
    return true;
  }
  return false;
}

/**
 * Gemini writes a German outline/exposé (not full novel prose) from the foundation.
 */
export async function generateRomanOutlineFromFoundation(
  input: RomanOutlineGenerateInput,
): Promise<string> {
  if (!hasEnoughFoundation(input)) {
    throw new Error(
      "Für ein Outline brauchst du mindestens Prämisse, Figuren oder ein Szenen-Raster.",
    );
  }

  const context = buildRomanPromptContext(
    { ...input, manuskriptRaw: "" },
    { includeManuskript: false },
  );

  const model = await resolveRomanTextModel();
  const raw = await generateText({
    model,
    systemInstruction: `Du bist Dramaturg:in und Ghostwriter für Belletristik-Outlines (deutscher Markt).
Aufgabe: Aus dem Buch-Fundament ein editierbares Exposé / Handlungsoutline erzeugen — kein fertiger Roman, keine ausformulierten Szenenprosa.

Regeln:
- Deutsch, klar, dramaturgisch.
- Struktur als Markdown-ähnlicher Klartext (Überschriften mit # / ## ok).
- Keine Meta-Kommentare („Hier ist das Outline“), kein JSON.
- Widersprich dem Fundament nicht; fülle Lücken sinnvoll.
- Länge: etwa 1.500–4.000 Wörter — kompakt genug zum Überarbeiten, reich genug für Phase-0-Roadmap.`,
    userText: `Erzeuge ein editierbares Exposé/Outline für diesen Roman.

Inhalt soll enthalten:
1. Arbeitstitel & Logline
2. Genre, Ton, Perspektive, Zeitform (kurz)
3. Figuren (Ziele, Konflikte, Beziehungen)
4. Welt / Schauplätze / Regeln (knapp)
5. Handungsbogen in 3 Akten (oder vergleichbar)
6. Kapitel- oder Beat-Outline chronologisch — an vorhandenes Szenen-Raster anlehnen und erweitern
7. Offene Fragen / Spannungsanker für die spätere Ausarbeitung

Das Ergebnis landet im Feld „Manuskript / Outline“ und wird Grundlage für Szenen-Roadmap und Schreibpipeline.

# Fundament
${context || "(leer)"}`,
  });

  const text = raw.trim();
  if (text.length < 200) {
    throw new Error("Outline kam zu kurz zurück — Fundament ergänzen und erneut versuchen.");
  }
  return text;
}
