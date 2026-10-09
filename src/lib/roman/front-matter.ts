/**
 * Buchrücken + minimal eBook front matter (Vorsatz) via Gemini.
 * Best practice for fiction eBooks: title page + copyright (+ short dedication/epigraph).
 */

import { generateText } from "@/lib/ai/provider";
import { resolveRomanTextModel } from "@/lib/roman/model";

/** Default author on title / copyright / spine. */
export const ROMAN_DEFAULT_AUTHOR = "Jannis Fynk";

/** Default imprint on title page (leseno). */
export const ROMAN_DEFAULT_IMPRINT = "leseno.de";

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
    autorZeile: ROMAN_DEFAULT_AUTHOR,
    verlagZeile: ROMAN_DEFAULT_IMPRINT,
    gestaltungshinweise: "",
  };
}

export function emptyVorsatz(): RomanVorsatz {
  const year = String(new Date().getFullYear());
  return {
    titelseite: {
      titel: "",
      untertitel: "",
      autor: ROMAN_DEFAULT_AUTHOR,
      imprint: ROMAN_DEFAULT_IMPRINT,
    },
    impressum: {
      jahr: year,
      rechteinhaber: ROMAN_DEFAULT_AUTHOR,
      hinweis: `© ${year} ${ROMAN_DEFAULT_AUTHOR} · ${ROMAN_DEFAULT_IMPRINT}. Alle Rechte vorbehalten.`,
      disclaimer:
        "Dies ist ein Werk der Fiktion. Ähnlichkeiten mit lebenden oder toten Personen, Orten oder Ereignissen sind rein zufällig.",
    },
    widmung: "",
    motto: "",
  };
}

/** One-line copyright with default author + leseno.de. */
export function defaultCopyrightHinweis(year?: string): string {
  const y = (year ?? String(new Date().getFullYear())).trim() || String(new Date().getFullYear());
  return `© ${y} ${ROMAN_DEFAULT_AUTHOR} · ${ROMAN_DEFAULT_IMPRINT}. Alle Rechte vorbehalten.`;
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
  const autorFixed =
    input.autorName.trim() || ROMAN_DEFAULT_AUTHOR;
  const model = await resolveRomanTextModel();
  const raw = await generateText({
    model,
    preferJson: true,
    systemInstruction: `Du bist Lektor:in und Buchgestalter:in für Belletristik-eBooks (deutscher Markt).
Erzeuge Buchrücken-Texte und minimale Vorsatzseiten nach eBook-Best-Practice:
- So wenig wie möglich vor Kapitel 1.
- Pflicht: Titelseite + Impressum/Copyright + Motto/Epigraph.
- Motto: EIN starkes, kurzes Zitat (1–2 Sätze), das den KERNGEDANKEN des Buches trifft — literarisch, memorabel, kein Klischee-Spruch, kein Spoiler der Pointe. Darf original klingen (als Motto des Werks) oder ein passendes klassisches Zitat mit Quellenangabe sein.
- Autor auf Titelseite/Copyright ist fest „${ROMAN_DEFAULT_AUTHOR}“; Imprint/Verlag „${ROMAN_DEFAULT_IMPRINT}“ — nicht ändern.
- Optional nur wenn sinnvoll und kurz: Widmung.
- Kein Schmutztitel, kein langes Inhaltsverzeichnis, keine Danksagung vorn, keine Autor:innen-Bio vorn.
Antworte ausschließlich mit JSON (kein Markdown außerhalb).`,
    userText: `Erstelle Buchrücken + Vorsatz für diesen Roman.

# Arbeitstitel
${input.title.trim() || "Unbenannter Roman"}

# Autor:in (verbindlich — so übernehmen)
${autorFixed}

# Imprint (verbindlich)
${ROMAN_DEFAULT_IMPRINT}

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
  "autorName": "${autorFixed}",
  "buchruecken": {
    "titelKurz": "Kurztitel für den Rücken (max. ~40 Zeichen ideal)",
    "autorZeile": "${autorFixed}",
    "verlagZeile": "${ROMAN_DEFAULT_IMPRINT}",
    "gestaltungshinweise": "2–5 Sätze Design: Schrift-Hierarchie, Farben passend zu Genre/Tonalität, Lesbarkeit auf schmalem Rücken, Druckhinweise"
  },
  "vorsatz": {
    "titelseite": {
      "titel": "Vollständiger Titel",
      "untertitel": "optional oder leer",
      "autor": "${autorFixed}",
      "imprint": "${ROMAN_DEFAULT_IMPRINT}"
    },
    "impressum": {
      "jahr": "${year}",
      "rechteinhaber": "${autorFixed}",
      "hinweis": "© ${year} ${autorFixed} · ${ROMAN_DEFAULT_IMPRINT}. Alle Rechte vorbehalten.",
      "disclaimer": "Kurzer Fiktions-Disclaimer auf Deutsch"
    },
    "widmung": "kurz oder leer",
    "motto": "Starkes Motto/Epigraph zum Buchkern (Pflicht, nicht leer)"
  }
}`,
  });

  const parsed = parseFrontMatterResponse(raw);

  // Fill sensible defaults if Gemini left gaps — author/imprint always leseno defaults.
  if (!parsed.vorsatz.titelseite.titel.trim()) {
    parsed.vorsatz.titelseite.titel = input.title.trim() || "Unbenannter Roman";
  }
  if (!parsed.buchruecken.titelKurz.trim()) {
    parsed.buchruecken.titelKurz = parsed.vorsatz.titelseite.titel.slice(0, 40);
  }
  parsed.autorName = autorFixed;
  parsed.vorsatz.titelseite.autor = autorFixed;
  parsed.vorsatz.titelseite.imprint = ROMAN_DEFAULT_IMPRINT;
  parsed.buchruecken.autorZeile = autorFixed;
  parsed.buchruecken.verlagZeile =
    parsed.buchruecken.verlagZeile.trim() || ROMAN_DEFAULT_IMPRINT;
  parsed.vorsatz.impressum.jahr =
    parsed.vorsatz.impressum.jahr.trim() || year;
  parsed.vorsatz.impressum.rechteinhaber = autorFixed;
  parsed.vorsatz.impressum.hinweis =
    parsed.vorsatz.impressum.hinweis.trim() ||
    defaultCopyrightHinweis(parsed.vorsatz.impressum.jahr);
  if (!parsed.vorsatz.impressum.hinweis.toLowerCase().includes("leseno")) {
    parsed.vorsatz.impressum.hinweis = defaultCopyrightHinweis(
      parsed.vorsatz.impressum.jahr,
    );
  }
  if (!parsed.vorsatz.impressum.disclaimer.trim()) {
    parsed.vorsatz.impressum.disclaimer = emptyVorsatz().impressum.disclaimer;
  }
  if (!parsed.vorsatz.motto.trim()) {
    parsed.vorsatz.motto =
      "Wer nichts hinterfragt, wird mitgeschoben — und nennt es Fortschritt.";
  }

  return parsed;
}

/** True if front matter has usable title-page content. */
export function hasUsableVorsatz(vorsatz: RomanVorsatz): boolean {
  return Boolean(vorsatz.titelseite.titel.trim());
}

/** Flat form fields for Titelseite / Copyright / Motto in the marketing panel. */
export type RomanVorsatzUiFields = {
  titel: string;
  untertitel: string;
  autor: string;
  imprint: string;
  copyrightHinweis: string;
  motto: string;
};

/** Flatten vorsatz for editable UI fields (defaults: Jannis Fynk / leseno.de). */
export function vorsatzToUiFields(
  v: RomanVorsatz,
  fallbackTitle = "",
): RomanVorsatzUiFields {
  const year = v.impressum.jahr.trim() || String(new Date().getFullYear());
  return {
    titel: v.titelseite.titel.trim() || fallbackTitle.trim(),
    untertitel: v.titelseite.untertitel,
    autor: v.titelseite.autor.trim() || ROMAN_DEFAULT_AUTHOR,
    imprint: v.titelseite.imprint.trim() || ROMAN_DEFAULT_IMPRINT,
    copyrightHinweis:
      v.impressum.hinweis.trim() || defaultCopyrightHinweis(year),
    motto: v.motto,
  };
}

/** Merge marketing-panel edits back into a full vorsatz object. */
export function mergeVorsatzFromUiFields(
  previous: RomanVorsatz,
  ui: RomanVorsatzUiFields,
): RomanVorsatz {
  const year =
    previous.impressum.jahr.trim() || String(new Date().getFullYear());
  const autor = ui.autor.trim() || ROMAN_DEFAULT_AUTHOR;
  const imprint = ui.imprint.trim() || ROMAN_DEFAULT_IMPRINT;
  const hinweis =
    ui.copyrightHinweis.trim() || defaultCopyrightHinweis(year);
  return {
    ...previous,
    titelseite: {
      titel: ui.titel.trim(),
      untertitel: ui.untertitel.trim(),
      autor,
      imprint,
    },
    impressum: {
      ...previous.impressum,
      jahr: year,
      rechteinhaber: autor,
      hinweis,
    },
    motto: ui.motto.trim(),
  };
}