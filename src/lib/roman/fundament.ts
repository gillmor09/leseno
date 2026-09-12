/**
 * Book foundation helpers: compose prompt context, default fan persona, empty sheets.
 */

import type {
  RomanCharakter,
  RomanSzenenRasterItem,
  RomanUpsertInput,
} from "@/lib/roman/types";

export function emptyCharakter(): RomanCharakter {
  return {
    name: "",
    alter: "",
    rolle: "",
    motivation: "",
    schwaeche: "",
    sprachstil: "",
  };
}

export function emptySzenenRasterItem(): RomanSzenenRasterItem {
  return {
    szeneId: "",
    ort: "",
    figuren: "",
    szenenziel: "",
    emotionalStart: "",
    emotionalEnd: "",
    kapitelNr: 1,
  };
}

/** Default KI rulebook — can be edited per roman. */
export const DEFAULT_KI_REGELWERK = `Show, don't tell.
Keine KI-Floskeln, keine Meta-Kommentare, keine Aufzählung von Schreibregeln im Fließtext.
Dialoge glaubwürdig und figurenbezogen; Anteil dem Genre anpassen.
Orthografie und Zeichensetzung sauber.
Perspektive und Zeitform strikt einhalten.
Tonalität und Stilmittel im gesamten Roman identisch halten — kein Stilbruch zwischen Szenen.
Wortwahl und Satzrhythmus an Stil-Anker / Stilbibel angleichen.`;

/**
 * Suggests a fan persona from genre/tonality when the user has not set one yet.
 */
export function suggestFanPersona(input: {
  genre: string;
  tonalitaet: string;
  praemisse: string;
}): { name: string; profil: string } {
  const genre = input.genre.trim() || "Belletristik";
  const ton = input.tonalitaet.trim() || "spannend und nahbar";
  return {
    name: `${genre}-Stammleser:in`,
    profil: `Du bist eine begeisterte Stammleser:in von ${genre}-Romanen.
Du liest viel in genau diesem Genre, kennst typische Tropes und wirst ungeduldig bei Leerlauf.
Tonalität, die dich anspricht: ${ton}.
${input.praemisse.trim() ? `Zur Prämisse dieses Buchs: ${input.praemisse.trim()}` : ""}
Du gibst ehrliches Leser-Feedback: Emotionen, Spannung, Identifikation, Lesefluss.
Du bist keine Lektor:in — dich interessiert, ob du die Szene weiterlesen würdest.`,
  };
}

function formatCharaktere(list: RomanCharakter[]): string {
  const rows = list.filter((c) => c.name.trim() || c.rolle.trim());
  if (!rows.length) return "";
  return rows
    .map((c, i) => {
      const parts = [
        c.name && `Name: ${c.name}`,
        c.alter && `Alter: ${c.alter}`,
        c.rolle && `Rolle: ${c.rolle}`,
        c.motivation && `Motivation/Ziel: ${c.motivation}`,
        c.schwaeche && `Schwäche/Konflikt: ${c.schwaeche}`,
        c.sprachstil && `Sprachstil: ${c.sprachstil}`,
      ].filter(Boolean);
      return `Figur ${i + 1}:\n${parts.join("\n")}`;
    })
    .join("\n\n");
}

function formatSzenenRaster(list: RomanSzenenRasterItem[]): string {
  const rows = list.filter(
    (r) => r.szeneId.trim() || r.szenenziel.trim() || r.ort.trim(),
  );
  if (!rows.length) return "";
  return rows
    .map((r, i) => {
      const parts = [
        r.szeneId && `Szene-ID: ${r.szeneId}`,
        r.kapitelNr != null && `Kapitel: ${r.kapitelNr}`,
        r.ort && `Ort: ${r.ort}`,
        r.figuren && `Figuren: ${r.figuren}`,
        r.szenenziel && `Szenenziel: ${r.szenenziel}`,
        (r.emotionalStart || r.emotionalEnd) &&
          `Emotionaler Bogen: ${r.emotionalStart || "?"} → ${r.emotionalEnd || "?"}`,
      ].filter(Boolean);
      return `Raster ${i + 1}:\n${parts.join("\n")}`;
    })
    .join("\n\n");
}

/** Enough fields for prompt composition (claim payload may omit title/manuscript). */
type ContextSource = {
  title?: string;
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
  manuskriptRaw?: string;
};

/**
 * Builds the shared bible block for Gemini (foundation + optional manuscript).
 * Empty sections are omitted so early/late entry both work.
 */
export function buildRomanPromptContext(
  roman: ContextSource,
  options?: { includeManuskript?: boolean; maxManuskriptChars?: number },
): string {
  const blocks: string[] = [];

  const meta = [
    roman.title?.trim() && `Arbeitstitel: ${roman.title.trim()}`,
    roman.genre && `Genre: ${roman.genre}`,
    roman.praemisse && `Prämisse: ${roman.praemisse}`,
    roman.perspektive && `Perspektive: ${roman.perspektive}`,
    roman.zeitform && `Zeitform: ${roman.zeitform}`,
    roman.tonalitaet && `Tonalität & Stil: ${roman.tonalitaet}`,
  ].filter(Boolean);
  if (meta.length) {
    blocks.push(`## Buch-Fundament\n${meta.join("\n")}`);
  }

  const chars = formatCharaktere(roman.charaktere);
  if (chars) blocks.push(`## Charakter-Steckbriefe\n${chars}`);

  const welt = [
    roman.weltSchauplaetze && `Hauptschauplätze:\n${roman.weltSchauplaetze}`,
    roman.weltRegeln && `Regeln & Grenzen:\n${roman.weltRegeln}`,
  ].filter(Boolean);
  if (welt.length) blocks.push(`## Welt & Regeln\n${welt.join("\n\n")}`);

  const raster = formatSzenenRaster(roman.szenenRaster);
  if (raster) blocks.push(`## Szenen-Raster (Plot-Plan)\n${raster}`);

  const rules = roman.kiRegelwerk.trim() || DEFAULT_KI_REGELWERK;
  blocks.push(`## KI-Regelwerk\n${rules}`);

  if (roman.stilbibel.trim()) {
    blocks.push(`## Zusätzliche Stilbibel\n${roman.stilbibel.trim()}`);
  }

  if (options?.includeManuskript && roman.manuskriptRaw?.trim()) {
    let ms = roman.manuskriptRaw.trim();
    const cap = options.maxManuskriptChars ?? 120_000;
    if (ms.length > cap) {
      ms = `${ms.slice(0, cap)}\n\n[… Manuskript gekürzt …]`;
    }
    blocks.push(`## Manuskript / Outline\n${ms}`);
  }

  return blocks.join("\n\n");
}

/** Resolved fan persona for prompts (explicit or suggested). */
export function resolveFanPersona(roman: {
  genre: string;
  tonalitaet: string;
  praemisse: string;
  fanPersonaName: string;
  fanPersonaProfil: string;
}): { name: string; profil: string } {
  if (roman.fanPersonaName.trim() && roman.fanPersonaProfil.trim()) {
    return {
      name: roman.fanPersonaName.trim(),
      profil: roman.fanPersonaProfil.trim(),
    };
  }
  const suggested = suggestFanPersona(roman);
  return {
    name: roman.fanPersonaName.trim() || suggested.name,
    profil: roman.fanPersonaProfil.trim() || suggested.profil,
  };
}

export function parseCharaktereJson(value: unknown): RomanCharakter[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    return {
      name: String(row.name ?? ""),
      alter: String(row.alter ?? ""),
      rolle: String(row.rolle ?? ""),
      motivation: String(row.motivation ?? ""),
      schwaeche: String(row.schwaeche ?? ""),
      sprachstil: String(row.sprachstil ?? ""),
    };
  });
}

export function parseSzenenRasterJson(value: unknown): RomanSzenenRasterItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const kapitel = Number(row.kapitelNr ?? row.kapitel_nr ?? 1);
    return {
      szeneId: String(row.szeneId ?? row.szene_id ?? ""),
      ort: String(row.ort ?? ""),
      figuren: String(row.figuren ?? ""),
      szenenziel: String(row.szenenziel ?? ""),
      emotionalStart: String(row.emotionalStart ?? row.emotional_start ?? ""),
      emotionalEnd: String(row.emotionalEnd ?? row.emotional_end ?? ""),
      kapitelNr: Number.isFinite(kapitel) && kapitel >= 1 ? kapitel : 1,
    };
  });
}

export function emptyRomanUpsertFields(
  partial?: Partial<RomanUpsertInput>,
): Omit<RomanUpsertInput, "id" | "title"> & { title: string } {
  return {
    title: partial?.title ?? "",
    manuskriptRaw: partial?.manuskriptRaw ?? "",
    stilbibel: partial?.stilbibel ?? "",
    genre: partial?.genre ?? "",
    praemisse: partial?.praemisse ?? "",
    perspektive: partial?.perspektive ?? "",
    zeitform: partial?.zeitform ?? "",
    tonalitaet: partial?.tonalitaet ?? "",
    charaktere: partial?.charaktere?.length
      ? partial.charaktere
      : [emptyCharakter()],
    weltSchauplaetze: partial?.weltSchauplaetze ?? "",
    weltRegeln: partial?.weltRegeln ?? "",
    szenenRaster: partial?.szenenRaster?.length
      ? partial.szenenRaster
      : [emptySzenenRasterItem()],
    kiRegelwerk: partial?.kiRegelwerk ?? DEFAULT_KI_REGELWERK,
    fanPersonaName: partial?.fanPersonaName ?? "",
    fanPersonaProfil: partial?.fanPersonaProfil ?? "",
  };
}
