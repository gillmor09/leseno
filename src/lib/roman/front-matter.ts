/**
 * Buchrücken + minimal eBook front matter (Vorsatz) via Gemini.
 * Best practice for fiction eBooks: title page + copyright (+ short dedication/epigraph).
 */

import { generateText } from "@/lib/ai/provider";
import { resolveRomanTextModel } from "@/lib/roman/model";

export type RomanBuchruecken = {
  /** Short title for spine (may abbreviate long titles). */
  titelKurz: string;
  autorZeile: string;
  verlagZeile: string;
  /** Print/spine art direction (colors, hierarchy, mood) — Gemini design. */
  gestaltungshinweise: string;
};

export type RomanVorsatz = {
  titelseite: {
    titel: string;
    untertitel: string;
    autor: string;
    imprint: string;
  };
  impressum: {
    jahr: string;
    rechteinhaber: string;
    hinweis: string;
    disclaimer: string;
  };
  /** Optional; empty string = omit page. */
  widmung: string;
  /** Optional epigraph/motto; empty = omit. */
  motto: string;
};

export function emptyBuchruecken(): RomanBuchruecken {
  return {
    titelKurz: "",
    autorZeile: "",
    verlagZeile: "",
    gestaltungshinweise: "",
  };
}

export function emptyVorsatz(): RomanVorsatz {
  const year = String(new Date().getFullYear());
  return {
    titelseite: {
      titel: "",
      untertitel: "",
      autor: "",
      imprint: "Eigenverlag",
    },
    impressum: {
      jahr: year,
      rechteinhaber: "",
      hinweis: "",
      disclaimer:
        "Dies ist ein Werk der Fiktion. Ähnlichkeiten mit lebenden oder toten Personen, Orten oder Ereignissen sind rein zufällig.",
    },
    widmung: "",
    motto: "",
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseBuchrueckenJson(value: unknown): RomanBuchruecken {
  const row = asRecord(value);
  const base = emptyBuchruecken();
  return {
    titelKurz: String(row.titelKurz ?? row.titel_kurz ?? base.titelKurz),
    autorZeile: String(row.autorZeile ?? row.autor_zeile ?? base.autorZeile),
    verlagZeile: String(row.verlagZeile ?? row.verlag_zeile ?? base.verlagZeile),
    gestaltungshinweise: String(
      row.gestaltungshinweise ?? base.gestaltungshinweise,
    ),
  };
}

export function parseVorsatzJson(value: unknown): RomanVorsatz {
  const row = asRecord(value);
  const base = emptyVorsatz();
  const titel = asRecord(row.titelseite);
  const impressum = asRecord(row.impressum);
  return {
    titelseite: {
      titel: String(titel.titel ?? base.titelseite.titel),
      untertitel: String(titel.untertitel ?? base.titelseite.untertitel),
      autor: String(titel.autor ?? base.titelseite.autor),
      imprint: String(titel.imprint ?? base.titelseite.imprint),
    },
    impressum: {
      jahr: String(impressum.jahr ?? base.impressum.jahr),
      rechteinhaber: String(
        impressum.rechteinhaber ?? base.impressum.rechteinhaber,
      ),
      hinweis: String(impressum.hinweis ?? base.impressum.hinweis),
      disclaimer: String(impressum.disclaimer ?? base.impressum.disclaimer),
    },
    widmung: String(row.widmung ?? base.widmung),
    motto: String(row.motto ?? row.epigraph ?? base.motto),
  };
}

function stripFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseFrontMatterResponse(raw: string): {
  buchruecken: RomanBuchruecken;
  vorsatz: RomanVorsatz;
  autorName: string;
} {
  const cleaned = stripFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("Gemini-Antwort ist kein gültiges JSON.");
    }
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  }
  const obj = asRecord(parsed);
  const buchruecken = parseBuchrueckenJson(obj.buchruecken ?? obj.spine);
  const vorsatz = parseVorsatzJson(obj.vorsatz ?? obj.frontMatter);
  const autorName = String(
    obj.autorName ?? obj.autor_name ?? vorsatz.titelseite.autor ?? "",
  ).trim();
  return { buchruecken, vorsatz, autorName };
}

const MAX_MS = 8_000;
const MAX_SUMMARY = 6_000;

/**
 * Gemini designs spine + minimal fiction eBook front matter from manuscript/summary.
 */
export async function generateRomanFrontMatter(input: {
  title: string;
  autorName: string;
  genre: string;
  praemisse: string;
  tonalitaet: string;
  manuskriptRaw: string;
  aktuelleZusammenfassung: string;
}): Promise<{
  autorName: string;
  buchruecken: RomanBuchruecken;
  vorsatz: RomanVorsatz;
}> {
  const hasMaterial =
    input.manuskriptRaw.trim().length >= 40 ||
    input.aktuelleZusammenfassung.trim().length >= 40 ||
    input.praemisse.trim().length >= 20 ||
    input.title.trim().length >= 2;
  if (!hasMaterial) {
    throw new Error(
      "Für Buchrücken/Vorsatz brauchst du Titel, Prämisse, Manuskript oder Zusammenfassung.",
    );
  }

  let manuskript = input.manuskriptRaw.trim();
  if (manuskript.length > MAX_MS) {
    manuskript = `${manuskript.slice(0, MAX_MS)}\n\n[… gekürzt …]`;
  }
  let summary = input.aktuelleZusammenfassung.trim();
  if (summary.length > MAX_SUMMARY) {
    summary = `${summary.slice(0, MAX_SUMMARY)}\n\n[… gekürzt …]`;
  }

  const year = String(new Date().getFullYear());
  const model = await resolveRomanTextModel();
  const raw = await generateText({
    model,
    preferJson: true,
    systemInstruction: `Du bist Lektor:in und Buchgestalter:in für Belletristik-eBooks (deutscher Markt).
Erzeuge Buchrücken-Texte und minimale Vorsatzseiten nach eBook-Best-Practice:
- So wenig wie möglich vor Kapitel 1.
- Pflicht: Titelseite + Impressum/Copyright.
- Optional nur wenn sinnvoll und kurz: Widmung, Motto/Epigraph.
- Kein Schmutztitel, kein langes Inhaltsverzeichnis, keine Danksagung vorn, keine Autor:innen-Bio vorn.
Antworte ausschließlich mit JSON (kein Markdown außerhalb).`,
    userText: `Erstelle Buchrücken + Vorsatz für diesen Roman.

# Arbeitstitel
${input.title.trim() || "Unbenannter Roman"}

# Autor:in (falls bekannt, sonst sinnvollen Platzhalter/Künstlernamen vorschlagen)
${input.autorName.trim() || "(unbekannt — bitte Vorschlag)"}

# Genre / Tonalität / Prämisse
Genre: ${input.genre.trim() || "—"}
Tonalität: ${input.tonalitaet.trim() || "—"}
Prämisse: ${input.praemisse.trim() || "—"}

# Laufende Zusammenfassung (falls vorhanden)
${summary || "(noch leer)"}

# Manuskript / Outline (Auszug)
${manuskript || "(leer)"}

Gib JSON in genau dieser Form:
{
  "autorName": "Name der Autorin/des Autors",
  "buchruecken": {
    "titelKurz": "Kurztitel für den Rücken (max. ~40 Zeichen ideal)",
    "autorZeile": "Autor:innenname auf dem Rücken",
    "verlagZeile": "Imprint/Eigenverlag-Kurzzeile",
    "gestaltungshinweise": "2–5 Sätze Design: Schrift-Hierarchie, Farben passend zu Genre/Tonalität, Lesbarkeit auf schmalem Rücken, Druckhinweise"
  },
  "vorsatz": {
    "titelseite": {
      "titel": "Vollständiger Titel",
      "untertitel": "optional oder leer",
      "autor": "Autor:in",
      "imprint": "Eigenverlag oder Imprint"
    },
    "impressum": {
      "jahr": "${year}",
      "rechteinhaber": "©-Inhaber:in",
      "hinweis": "Eine Zeile © ${year} Name. Alle Rechte vorbehalten.",
      "disclaimer": "Kurzer Fiktions-Disclaimer auf Deutsch"
    },
    "widmung": "kurz oder leer",
    "motto": "kurzes Motto/Epigraph oder leer"
  }
}`,
  });

  const parsed = parseFrontMatterResponse(raw);

  // Fill sensible defaults if Gemini left gaps.
  if (!parsed.vorsatz.titelseite.titel.trim()) {
    parsed.vorsatz.titelseite.titel = input.title.trim() || "Unbenannter Roman";
  }
  if (!parsed.buchruecken.titelKurz.trim()) {
    parsed.buchruecken.titelKurz = parsed.vorsatz.titelseite.titel.slice(0, 40);
  }
  const autor =
    parsed.autorName ||
    parsed.vorsatz.titelseite.autor ||
    input.autorName.trim() ||
    "Autor:in";
  parsed.autorName = autor;
  if (!parsed.vorsatz.titelseite.autor.trim()) {
    parsed.vorsatz.titelseite.autor = autor;
  }
  if (!parsed.buchruecken.autorZeile.trim()) {
    parsed.buchruecken.autorZeile = autor;
  }
  if (!parsed.vorsatz.impressum.rechteinhaber.trim()) {
    parsed.vorsatz.impressum.rechteinhaber = autor;
  }
  if (!parsed.vorsatz.impressum.hinweis.trim()) {
    parsed.vorsatz.impressum.hinweis = `© ${parsed.vorsatz.impressum.jahr || year} ${autor}. Alle Rechte vorbehalten.`;
  }
  if (!parsed.vorsatz.impressum.disclaimer.trim()) {
    parsed.vorsatz.impressum.disclaimer = emptyVorsatz().impressum.disclaimer;
  }

  return parsed;
}

/** True if front matter has usable title-page content. */
export function hasUsableVorsatz(vorsatz: RomanVorsatz): boolean {
  return Boolean(vorsatz.titelseite.titel.trim());
}