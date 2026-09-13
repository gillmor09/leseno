/**
 * Publisher advice: Einzelband vs. Mehrteiler / series shape.
 */

import { generateText } from "@/lib/ai/provider";
import {
  MEHRTEILER_FORM_LABELS,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import { resolveRomanTextModel } from "@/lib/roman/model";
import type { RomanCharakter, RomanSzenenRasterItem } from "@/lib/roman/types";

const SYSTEM = `Du bist erfahrene:r Verlagslektor:in und Serien-Planer:in für Belletristik und Kinder-/Jugendbücher.
Du entscheidest nüchtern, ob ein Stoff als Einzelband, Duologie, Trilogie oder offene Serie tragfähiger ist.
Kriterien: dramatische Arc-Länge, Zielalter, Markt/Lesererwartung, Cliffhanger-Risiko, Wiederholungsgefahr, Band-Autonomie.
Schreibe auf Deutsch, klar und entscheidungsorientiert. Keine Floskeln.`;

export type MehrteilerAdviceInput = {
  title: string;
  genre: string;
  praemisse: string;
  tonalitaet: string;
  stilbibel: string;
  kiRegelwerk: string;
  manuskriptRaw: string;
  charaktere: RomanCharakter[];
  szenenRaster: RomanSzenenRasterItem[];
  editorial: RomanEditorial;
};

/**
 * Returns editable prose advice (Empfehlung + Begründung + Band-Skizze).
 */
export async function generateMehrteilerBeratung(
  input: MehrteilerAdviceInput,
): Promise<string> {
  const model = await resolveRomanTextModel();
  const e = input.editorial;
  const chars = input.charaktere
    .filter((c) => c.name.trim())
    .slice(0, 12)
    .map((c) => `${c.name}: ${c.motivation || c.rolle || "—"}`)
    .join("\n");
  const rasterHint = input.szenenRaster
    .filter((r) => r.szenenziel.trim())
    .slice(0, 20)
    .map((r, i) => `${i + 1}. ${r.szenenziel.trim()}`)
    .join("\n");

  const userText = `Bewerte diesen Roman-Stoff für Einzelband vs. Mehrteiler.

# Arbeitstitel
${input.title || "(ohne Titel)"}

# Genre / Ton
${input.genre || "—"} · ${input.tonalitaet || "—"}

# Prämisse
${input.praemisse || "—"}

# Zielgruppe / Umfang (gesetzt)
Alter: ${e.zielAlterMin ?? "?"}–${e.zielAlterMax ?? "?"} · Lesestufe: ${e.lesestufe || "—"}
Zielwortzahl Band: ${e.zielWortzahlRoman ?? "offen"}
Aktuelle Mehrteiler-Einschätzung: ${MEHRTEILER_FORM_LABELS[e.mehrteilerForm]}
Serie: ${e.serieTitel || "—"} · Band: ${e.bandNr ?? "—"}
Notizen: ${e.mehrteilerNotizen || "—"}

# Figuren (Auszug)
${chars || "—"}

# Raster-Ziele (Auszug)
${rasterHint || "—"}

# Outline/Manuskript (Auszug, max. 6000 Zeichen)
${(input.manuskriptRaw || "").trim().slice(0, 6000) || "—"}

# Stil / Regeln (kurz)
${(input.stilbibel || input.kiRegelwerk || "").trim().slice(0, 1500) || "—"}

Antworte in dieser Struktur:

## Empfehlung
(eine klare Empfehlung: Einzelband / Duologie / Trilogie / Serie — und warum)

## Wann Einzelband reicht
(Bullet-Punkte)

## Wann Mehrteiler lohnt
(Bullet-Punkte; welche Bögen in welche Bände)

## Band-Skizze (falls Mehrteiler)
Band 1: …
Band 2: …
(ggf. weitere)

## Risiken
(Wiederholung, Cliffhanger-Müdigkeit, Zielalter, Markt)

## Nächster redaktioneller Schritt
(ein konkreter nächster Schritt für die Autor:in)`;

  const text = await generateText({
    model,
    systemInstruction: SYSTEM,
    maxTokens: 3500,
    userText,
  });
  const clean = text.trim();
  if (!clean) throw new Error("Keine Mehrteiler-Beratung erhalten.");
  return clean;
}
