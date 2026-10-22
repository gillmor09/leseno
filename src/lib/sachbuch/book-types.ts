/**
 * Sachbuchtypen = gängige Formate / Kerngebiete für den Greenfield-Neubau.
 * Code-Katalog zuerst; Bücher speichern `bookTypeId` in `makro` erst nach
 * Vorschlag/Bestätigung aus der Idee (nicht beim Anlegen).
 * Generation bauplan: see `bauplaene/` + `.cursor/rules/sachbuch-*.mdc`.
 */

import {
  formatBauplanForBookType,
  TRANSFORMATIVES_BUSINESS_BAUPLAN_ID,
  TRANSFORMATIVES_BUSINESS_DEFAULT_THESIS,
} from "@/lib/sachbuch/bauplaene";
import type { SachbuchMakroTyp } from "@/lib/sachbuch/types";

export type SachbuchBookType = {
  id: string;
  /** Full product name. */
  name: string;
  /** Short chip / list label. */
  shortLabel: string;
  /** What this Kerngebiet is for (prompts + UI). */
  description: string;
  /** Makro backbone (journey | erklaerung | erzaehlung). */
  makroTyp: SachbuchMakroTyp;
  /** Extra interview focus for Idee-Q&A. */
  interviewFocus: string;
  /** Default core thesis (overridden by book Idee when set). */
  defaultThesis: string;
  /** Signals for LLM type-matching (German keywords / patterns). */
  matchHints: string;
};

/**
 * Transformative business nonfiction with case-study analytics.
 * Bauplan: Kapitel-Triade A/B/C, Mythen-Breaker, Diagnose-Check.
 */
export const SACHBUCH_BOOK_TYPE_TRANSFORMATIVES_BUSINESS: SachbuchBookType = {
  id: TRANSFORMATIVES_BUSINESS_BAUPLAN_ID,
  name: "Transformatives Business-Sachbuch mit Fallstudien-Analytik",
  shortLabel: "Transformatives Business",
  description:
    "Diagnostic & actionable Non-Fiction: Fallstudie → Faktencheck → Transformation. " +
    "Entlarvt Ausreden (z. B. „wegen Datenschutz“), fundiert juristisch/technisch, " +
    "liefert Prozess-Diagnose und Privacy-by-Design-Hebel — kein Motivationsbuch.",
  makroTyp: "journey",
  interviewFocus:
    "Unpopuläre Business-These, Fallstudien/Belege, typische Ausreden im Büro, " +
    "welche Prozesse wirklich blockieren, was Leser:innen danach anders entscheiden sollen.",
  defaultThesis: TRANSFORMATIVES_BUSINESS_DEFAULT_THESIS,
  matchHints:
    "Business, Organisation, Datenschutz als Ausrede, Prozesse, Transformation, " +
    "Fallstudie, Diagnose, Privacy-by-Design, Change, Führungskräfte, Compliance-Theater",
};

export const SACHBUCH_BOOK_TYPE_PRAXIS_RATGEBER: SachbuchBookType = {
  id: "praxis-ratgeber",
  name: "Praxis-Ratgeber / How-to",
  shortLabel: "Praxis-Ratgeber",
  description:
    "Schrittorientiertes Sachbuch: konkrete Schritte, Checklisten, Tools. " +
    "Leser:innen sollen danach etwas können oder umsetzen — weniger These, mehr Anleitung.",
  makroTyp: "journey",
  interviewFocus:
    "Welches Problem lösen Leser:innen Schritt für Schritt? Welche Fehler vermeiden? " +
    "Welche Tools/Routinen liefern messbaren Fortschritt?",
  defaultThesis:
    "Gute Ratgeber liefern reproduzierbare Schritte statt Motivation.",
  matchHints:
    "How-to, Anleitung, Checkliste, Schritt für Schritt, Praxis, Tipps, " +
    "Anwendung, Übungen, Playbook, Handbuch",
};

export const SACHBUCH_BOOK_TYPE_ERKLAERBUCH: SachbuchBookType = {
  id: "erklaerbuch",
  name: "Erklär-/Einführungsbuch",
  shortLabel: "Erklärbuch",
  description:
    "Macht ein Thema verständlich: Fehlvorstellungen ausräumen, Begriffe klären, " +
    "Zusammenhänge zeigen — ohne Transformationsreise oder reine Story.",
  makroTyp: "erklaerung",
  interviewFocus:
    "Was soll wirklich verstanden sein? Welche Verwechslung steht im Weg? " +
    "Welche Beispiele machen das Abstrakte greifbar?",
  defaultThesis:
    "Verstehen schlägt Auswendiglernen: klare Modelle statt Buzzwords.",
  matchHints:
    "erklären, verstehen, Einführung, Grundlagen, populärwissenschaftlich light, " +
    "Begriff, Modell, Fehlvorstellung, Überblick",
};

export const SACHBUCH_BOOK_TYPE_POPULAERWISSENSCHAFT: SachbuchBookType = {
  id: "populaerwissenschaft",
  name: "Populärwissenschaft",
  shortLabel: "Populärwissenschaft",
  description:
    "Wissenschaftliche Erkenntnis für Laien: Evidenz, Studien, Metaphern. " +
    "Spannung aus dem Warum der Natur/Gesellschaft, nicht aus Business-Change.",
  makroTyp: "erklaerung",
  interviewFocus:
    "Welche überraschende Erkenntnis? Welche Studie/Befund trägt? " +
    "Wo endet der aktuelle Konsens, wo beginnt Spekulation?",
  defaultThesis:
    "Gute Populärwissenschaft macht Evidenz erzählbar, ohne sie zu verwässern.",
  matchHints:
    "Wissenschaft, Studie, Forschung, Gehirn, Klima, Physik, Biologie, " +
    "Evidenz, Experiment, Forscher, populärwissenschaft",
};

export const SACHBUCH_BOOK_TYPE_ERZAEHLEND: SachbuchBookType = {
  id: "erzaehlendes-sachbuch",
  name: "Erzählendes Sachbuch / Narrative Nonfiction",
  shortLabel: "Erzählendes Sachbuch",
  description:
    "Eine starke Fallgeschichte oder Reportage trägt die Erkenntnis. " +
    "Szenen, Figuren, Wendepunkt — These entsteht aus dem Erlebten.",
  makroTyp: "erzaehlung",
  interviewFocus:
    "Welcher Fall/welche Person trägt das Buch? Welche Szene bleibt? " +
    "Welche Erkenntnis soll am Ende stehen?",
  defaultThesis:
    "Eine präzise erzählte Fallgeschichte schlägt zehn abstrakte Thesen.",
  matchHints:
    "Geschichte, Fall, Reportage, Protagonist, Szene, Wendepunkt, Narrative, " +
    "Biografie light, investigative Erzählung, True Story",
};

export const SACHBUCH_BOOK_TYPE_THESEN_ESSAY: SachbuchBookType = {
  id: "thesen-essay",
  name: "Thesen-/Essay-Sachbuch",
  shortLabel: "Thesen-Essay",
  description:
    "Argumentiert eine klare, oft unbequeme These. Debatte, Gegenargumente, " +
    "Zuspitzung — weniger Anleitung, mehr Denkangebot.",
  makroTyp: "erklaerung",
  interviewFocus:
    "Welche unpopuläre These? Welche Gegenargumente musst du entkräften? " +
    "Was soll der Leser danach anders denken (nicht nur tun)?",
  defaultThesis:
    "Eine harte These plus ehrliche Gegenargumente schlägt weiches Both-sides.",
  matchHints:
    "These, Essay, Argument, Debatte, Kritik, Gesellschaft, Meinung, " +
    "Zuspitzung, Streitschrift, unpopulär",
};

export const SACHBUCH_BOOK_TYPE_INVESTIGATIV: SachbuchBookType = {
  id: "investigativ-reportage",
  name: "Investigativ / Reportage",
  shortLabel: "Investigativ",
  description:
    "Recherche-getrieben: Missstände, Systeme, Belege. Enthüllen und einordnen, " +
    "nicht primär Coaching oder How-to.",
  makroTyp: "erzaehlung",
  interviewFocus:
    "Welcher Missstand? Welche Quellen/Belege? Wer profitiert vom Status quo? " +
    "Was soll öffentlich werden?",
  defaultThesis:
    "Systeme ändern sich erst, wenn Belege die Ausreden überstimmen.",
  matchHints:
    "Investigativ, Enthüllung, Missstand, Recherche, Dokumente, Whistleblower, " +
    "Korruption, Systemkritik, Reportage, Journalismus",
};

/** Ordered catalog for UI + LLM matching. */
export const SACHBUCH_BOOK_TYPES: readonly SachbuchBookType[] = [
  SACHBUCH_BOOK_TYPE_TRANSFORMATIVES_BUSINESS,
  SACHBUCH_BOOK_TYPE_PRAXIS_RATGEBER,
  SACHBUCH_BOOK_TYPE_ERKLAERBUCH,
  SACHBUCH_BOOK_TYPE_POPULAERWISSENSCHAFT,
  SACHBUCH_BOOK_TYPE_ERZAEHLEND,
  SACHBUCH_BOOK_TYPE_THESEN_ESSAY,
  SACHBUCH_BOOK_TYPE_INVESTIGATIV,
];

/** Only used as last-resort fallback when a stored id is unknown — not at create. */
export const DEFAULT_SACHBUCH_BOOK_TYPE_ID =
  SACHBUCH_BOOK_TYPE_TRANSFORMATIVES_BUSINESS.id;

export function getSachbuchBookType(
  id: string | null | undefined,
): SachbuchBookType | null {
  if (!id?.trim()) return null;
  return SACHBUCH_BOOK_TYPES.find((t) => t.id === id.trim()) ?? null;
}

/** True when the book has an explicit, known Sachbuchtyp. */
export function hasConfirmedSachbuchBookType(
  id: string | null | undefined,
): boolean {
  return getSachbuchBookType(id) !== null;
}

/**
 * Resolve for prompts that need a type. Prefer confirmed id;
 * unknown/empty → transformative only as last resort (legacy books).
 */
export function resolveSachbuchBookType(
  id: string | null | undefined,
): SachbuchBookType {
  return (
    getSachbuchBookType(id) ?? SACHBUCH_BOOK_TYPE_TRANSFORMATIVES_BUSINESS
  );
}

/** Catalog block for LLM type-suggestion prompts. */
export function formatSachbuchBookTypesCatalogForPrompt(): string {
  return SACHBUCH_BOOK_TYPES.map(
    (t, i) =>
      `${i + 1}. id=${t.id}
Name: ${t.name}
Kurz: ${t.shortLabel}
Beschreibung: ${t.description}
Makro-Form: ${t.makroTyp}
Match-Hinweise: ${t.matchHints}`,
  ).join("\n\n");
}

/**
 * Full generation bauplan for prompts (Idee, Outline, Kapitel).
 * Prefer book Idee (unpopularOpinion / briefing head) as thesis when present.
 * Unknown types get a compact generic bauplan from the catalog entry.
 */
export function formatBookTypeBauplanPrompt(
  bookTypeId: string | null | undefined,
  opts?: { thesis?: string | null },
): string {
  const specific = formatBauplanForBookType(bookTypeId, opts);
  if (specific) return specific;

  const t = getSachbuchBookType(bookTypeId);
  if (!t) return "";

  const thesis = (opts?.thesis ?? "").trim() || t.defaultThesis;
  return `# Sachbuchtyp: ${t.name}
${t.description}

Kern-These (verbindlich, soweit gesetzt): ${thesis}

Makro-Form: ${t.makroTyp}
Interview-/Schreibfokus: ${t.interviewFocus}

Regeln:
- Kein Motivations-Fluff; konkrete Beispiele und Belege.
- These durchziehen; keine Parallel-These erfinden.
- Ton und Struktur dem Typ anpassen (${t.shortLabel}).`;
}
