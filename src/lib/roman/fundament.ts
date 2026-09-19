/**
 * Book foundation helpers: compose prompt context, default fan persona, empty sheets.
 */

import {
  buildEditorialMustBlock,
  buildStrukturMustBlock,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import type {
  RomanCharakter,
  RomanSzenenRasterItem,
  RomanUpsertInput,
} from "@/lib/roman/types";

/**
 * Hard rule for all prompts after Idee: person names only from Steckbriefe.
 * Idea dossier / Finder chat may still contain placeholder or outdated names.
 */
export const ROMAN_NAME_SOURCE_RULE = `Figurennamen (HARTE REGEL): Verbindlich sind NUR die Namen aus den Charakter-Steckbriefen (Fundament). Namen in Ideendokumentation, Ideen-Finder-Chat oder sonstigen Ideen-Texten sind Platzhalter/veraltet — hart ignorieren, nicht übernehmen, nicht kritisieren, nicht angleichen. Rollen/Figurenkerne aus der Idee bleiben inhaltlich nutzbar; die Bezeichnung der Person kommt aus dem Steckbrief.`;

export function emptyCharakter(): RomanCharakter {
  return {
    name: "",
    alter: "",
    rolle: "",
    wesenszuege: "",
    motivation: "",
    schwaeche: "",
    bogen: "",
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
Wortwahl und Satzrhythmus an Stil-Anker / Stilbibel angleichen.
Alters- und Lesestufe aus Stilbibel/Regelwerk strikt einhalten (z. B. 8–10 Jahre = kurze Sätze, bekannte Wörter, keine Erwachsenensprache).`;

/**
 * KI-Regelwerk + Stilbibel as hard MUST (outline, Phase 0, scene prompts).
 */
export function buildStyleMustBlocks(roman: {
  kiRegelwerk: string;
  stilbibel: string;
  editorial?: RomanEditorial;
}): string {
  const rules = roman.kiRegelwerk.trim() || DEFAULT_KI_REGELWERK;
  const stil = roman.stilbibel.trim();
  const parts: string[] = [];
  if (roman.editorial) {
    const editorialBlock = buildEditorialMustBlock(roman.editorial);
    if (editorialBlock) parts.push(editorialBlock);
    const strukturBlock = buildStrukturMustBlock(roman.editorial);
    if (strukturBlock) parts.push(strukturBlock);
  }
  parts.push(`## MUSS — KI-Regelwerk (verbindlich, keine Ausnahme)
Jeder Satz, jede Formulierung und jede Idee muss zu diesen Regeln passen. Bei Konflikt mit Eleganz, „literarischem“ Ton oder Dramaturgie gewinnen DIESE Regeln.

${rules}`);
  if (stil) {
    parts.push(`## MUSS — Zusätzliche Stilbibel (verbindlich, keine Ausnahme)
Die Stilbibel ist Pflicht, kein Vorschlag. Zielalter, Lesestufe, Wortwahl, Satzlänge und Ton daraus sind hart: kein Abweichen, kein „erwachsenerer“ Ersatzstil.

${stil}`);
  }
  return parts.join("\n\n");
}

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
Nenne 2–4 Lieblingsbücher / Autor:innen in diesem Genre als persönlichen Maßstab (realistisch, deutsch oder international bekannt).
Du gibst ehrliches, auch kritisches Leser-Feedback: Emotionen, Spannung, Identifikation, Lesefluss — und wo es hinter deinen Lieblingsbüchern zurückbleibt.
Du bist keine Lektor:in — dich interessiert, ob du weiterlesen und das Buch weiterempfehlen würdest.`,
  };
}

/** True when at least one sheet has meaningful content. */
export function hasFilledCharaktere(list: RomanCharakter[]): boolean {
  return list.some(
    (c) =>
      c.name.trim().length >= 2 ||
      c.rolle.trim().length >= 2 ||
      c.motivation.trim().length >= 20 ||
      (c.wesenszuege ?? "").trim().length >= 20,
  );
}

/** Full character sheets for prompts / gate review. */
export function formatCharaktere(list: RomanCharakter[]): string {
  const rows = list.filter((c) => c.name.trim() || c.rolle.trim());
  if (!rows.length) return "";
  return rows
    .map((c, i) => {
      const parts = [
        c.name && `Name: ${c.name}`,
        c.alter && `Alter: ${c.alter}`,
        c.rolle && `Rolle: ${c.rolle}`,
        c.wesenszuege && `Wesenszüge: ${c.wesenszuege}`,
        c.motivation && `Ziel/Motiv: ${c.motivation}`,
        c.schwaeche && `Schwäche/Hindernis: ${c.schwaeche}`,
        c.bogen && `Bogen/Wandel: ${c.bogen}`,
        c.sprachstil && `Tonalität/Sprache: ${c.sprachstil}`,
      ].filter(Boolean);
      return `Figur ${i + 1}:\n${parts.join("\n")}`;
    })
    .join("\n\n");
}

/** Scene grid rows for prompts / gate review. */
export function formatSzenenRaster(list: RomanSzenenRasterItem[]): string {
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
  editorial?: RomanEditorial;
  manuskriptRaw?: string;
};

/**
 * Builds the shared bible block for Gemini (foundation + optional manuscript).
 * Empty sections are omitted so early/late entry both work.
 * Style MUST blocks come first so models weigh them hardest.
 */
export function buildRomanPromptContext(
  roman: ContextSource,
  options?: { includeManuskript?: boolean; maxManuskriptChars?: number },
): string {
  const blocks: string[] = [];

  blocks.push(buildStyleMustBlocks(roman));

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
  if (chars) {
    blocks.push(`## Charakter-Steckbriefe\n${chars}`);
    blocks.push(`## MUSS — Figurennamen\n${ROMAN_NAME_SOURCE_RULE}`);
  }

  const welt = [
    roman.weltSchauplaetze && `Hauptschauplätze:\n${roman.weltSchauplaetze}`,
    roman.weltRegeln && `Regeln & Grenzen:\n${roman.weltRegeln}`,
  ].filter(Boolean);
  if (welt.length) blocks.push(`## Welt & Regeln\n${welt.join("\n\n")}`);

  const raster = formatSzenenRaster(roman.szenenRaster);
  if (raster) blocks.push(`## Szenen-Raster (Plot-Plan)\n${raster}`);

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
      wesenszuege: String(row.wesenszuege ?? row.wesenszüge ?? ""),
      motivation: String(row.motivation ?? ""),
      schwaeche: String(row.schwaeche ?? ""),
      bogen: String(row.bogen ?? ""),
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
    editorial: partial?.editorial,
  };
}
