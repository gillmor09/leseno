/**
 * Admin novel pipeline types (`leseno.roman_kontext` / `leseno.szenen`).
 */

import type {
  RomanBuchruecken,
  RomanVorsatz,
} from "@/lib/roman/front-matter";

export type { RomanBuchruecken, RomanVorsatz };

export type SzeneStatus =
  | "READY_FOR_WRITING"
  | "DRAFTING"
  | "REVIEWING"
  | "REVISING"
  | "COMPLETED";

/** Character sheet (section 2 of book foundation). */
export type RomanCharakter = {
  name: string;
  alter: string;
  rolle: string;
  motivation: string;
  schwaeche: string;
  sprachstil: string;
};

/** Planning row for the scene grid (section 4) — before/ beside operational `szenen`. */
export type RomanSzenenRasterItem = {
  szeneId: string;
  ort: string;
  figuren: string;
  szenenziel: string;
  emotionalStart: string;
  emotionalEnd: string;
  kapitelNr?: number;
};

export type RomanKontext = {
  id: string;
  title: string;
  manuskriptRaw: string;
  /** Legacy free-text style bible; also composed from foundation when empty. */
  stilbibel: string;
  aktuelleZusammenfassung: string;
  /** 1. Book foundation */
  genre: string;
  praemisse: string;
  perspektive: string;
  zeitform: string;
  tonalitaet: string;
  /** 2. Characters */
  charaktere: RomanCharakter[];
  /** 3. World */
  weltSchauplaetze: string;
  weltRegeln: string;
  /** 4. Scene grid (planning) */
  szenenRaster: RomanSzenenRasterItem[];
  /** 5. KI rulebook */
  kiRegelwerk: string;
  /** Fan test-reader persona */
  fanPersonaName: string;
  fanPersonaProfil: string;
  /** Book cover (Flux data URL) + last Gemini/Flux prompt debug */
  coverImageDataUrl: string;
  coverPrompt: string;
  /** Author line for spine / title page */
  autorName: string;
  /** Print spine copy + design notes (Gemini) */
  buchruecken: RomanBuchruecken;
  /** Minimal eBook front matter between cover and chapter 1 */
  vorsatz: RomanVorsatz;
  createdAt: string;
  updatedAt: string;
};

export type RomanKontextSummary = RomanKontext & {
  szenenTotal: number;
  szenenCompleted: number;
  szenenReady: number;
  hasCover?: boolean;
};

export type Szene = {
  id: string;
  romanId: string;
  kapitelNr: number;
  szenenNr: number;
  briefing: string;
  entwurfRaw: string;
  feedbackLektor: string;
  feedbackFan: string;
  entwurfRevidiert: string;
  status: SzeneStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type ClaimedSzene = Szene & {
  stilbibel: string;
  aktuelleZusammenfassung: string;
  genre: string;
  praemisse: string;
  perspektive: string;
  zeitform: string;
  tonalitaet: string;
  charaktere: RomanCharakter[];
  weltSchauplaetze: string;
  weltRegeln: string;
  szenenRaster: RomanSzenenRasterItem[];
  kiRegelwerk: string;
  fanPersonaName: string;
  fanPersonaProfil: string;
};

export type SzeneRoadmapItem = {
  kapitel_nr: number;
  szenen_nr: number;
  briefing: string;
};

export type RomanUpsertInput = {
  id?: string | null;
  title: string;
  manuskriptRaw: string;
  stilbibel: string;
  genre: string;
  praemisse: string;
  perspektive: string;
  zeitform: string;
  tonalitaet: string;
  charaktere: RomanCharakter[];
  weltSchauplaetze: string;
  weltRegeln: string;
  szenenRaster: RomanSzenenRasterItem[];
  kiRegelwerk: string;
  fanPersonaName: string;
  fanPersonaProfil: string;
};
