/**
 * Editorial JSON for `leseno.roman_kontext.editorial`:
 * book type, structure docs, length/age/series, rules, market scan, reifegrade,
 * optional Testleser-Leser-Feedback on Manuskript.
 * Gate fields remain in the JSON shape for backward compatibility.
 */

import {
  parseRomanReifegrade,
  type RomanReifegrade,
} from "@/lib/roman/reifegrad-model";
import { parsePlotChapters } from "@/lib/roman/plot-chapters";
import {
  parseRomanSzenenplotStructured,
  type RomanSzenenplotStructured,
} from "@/lib/roman/szenenplot-structured";

export type RomanMehrteilerForm = "unbekannt" | "einzelband" | "duologie" | "trilogie" | "serie";

export type RomanBuchTyp = "unbekannt" | "belletristik" | "serie_welt" | "sachbuch";

export type RomanGateId = "idee" | "fundament" | "struktur" | "outline";

/** Critique / review dialog turns (same shape as Ideen-Finder chat). */
export type RomanGateChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type RomanGateState = {
  reviewedAt: string | null;
  reviewText: string;
  freigegebenAt: string | null;
  /** Dialog loop for critical review (Idee-Gate; others usually empty). */
  chat: RomanGateChatMessage[];
};

export type RomanEditorialGates = {
  idee: RomanGateState;
  fundament: RomanGateState;
  struktur: RomanGateState;
  outline: RomanGateState;
};

export type RomanEditorialChecklist = {
  ideeKlar: boolean;
  fundamentVoll: boolean;
  regelnHart: boolean;
  umfangGesetzt: boolean;
  outlineGeprueft: boolean;
  roadmapGeprueft: boolean;
  stilStichprobe: boolean;
  coverOk: boolean;
  vorsatzOk: boolean;
  readyToPublish: boolean;
};

/** Manual „Fertig“ flags per Buch-Pipeline-Tab (UI tab ids). */
export type RomanPipelineFertig = Partial<
  Record<
    | "typ"
    | "idee"
    | "spec"
    | "outline"
    | "schreiben"
    | "cover"
    | "export",
    boolean
  >
>;

/** One competitive title from Basics market scan. */
export type RomanMarktanalyseBuch = {
  title: string;
  author: string;
  whyPopular: string;
  /** Themes from up to ~20 worst / most critical reviews. */
  critiquePoints: string[];
  /** Themes from up to ~20 best / most enthusiastic reviews. */
  strengthPoints: string[];
  /** How many negative reviews the model reports having considered. */
  worstReviewsConsidered?: number;
  /** How many positive reviews the model reports having considered. */
  bestReviewsConsidered?: number;
};

/**
 * Competitive landscape from KI-Rolle `marktanalyst` (Gemini + Google Search).
 * Stored on editorial jsonb; used as anti-mediocrity input later in the pipeline.
 */
export type RomanMarktanalyse = {
  genre: string;
  zielgruppe: string;
  /** Optional reader-promise directions used for this scan (labels). */
  richtungen: string[];
  scannedAt: string;
  books: RomanMarktanalyseBuch[];
  topCritiqueThemes: string[];
  neglectedNeed: string;
  topStrengthThemes: string[];
  /** What need the best reviews show is already well served in the segment. */
  fulfilledNeed: string;
  modelLabel: string;
  sources?: Array<{ title: string; uri: string }>;
  searchSuggestionsHtml?: string;
  webSearchQueries?: string[];
};

/** Traffic-light status for rules / market needs in Testleser feedback. */
export type RomanLeserFeedbackStatus = "erfuellt" | "teilweise" | "fehlt";

/**
 * Machine-actionable Co-Autor instruction (Leser-Feedback + Reifegrad-Improve).
 */
export type RomanKritikWichtigkeit = "kritisch" | "wichtig" | "nice_to_have";

export type RomanAenderungsPrompt = {
  /** Short label for UI / history. */
  titel: string;
  /** lokal = only `kapitel`; buchweit = every manuscript chapter / whole artifact. */
  scope: "lokal" | "buchweit";
  /** Chapter numbers when scope is lokal (ranges expanded at parse). */
  kapitel: number[];
  /** Clear instruction: where + what to change (patch brief body). */
  anweisung: string;
  /** Priority for UI + apply filtering (nice_to_have = optional polish). */
  wichtigkeit: RomanKritikWichtigkeit;
  /**
   * Author must choose before Einarbeiten (fork / open question).
   * When true, UI shows a text field; decision is injected into the patch brief.
   */
  entscheidungNoetig?: boolean;
  /** Short question shown above the author text field. */
  entscheidungFrage?: string;
};

/** Heuristic + explicit flag: prompt needs a human decision before apply. */
export function aenderungsPromptNeedsAuthorDecision(
  prompt: RomanAenderungsPrompt,
): boolean {
  if (prompt.entscheidungNoetig) return true;
  if ((prompt.entscheidungFrage ?? "").trim().length >= 8) return true;
  const blob = `${prompt.titel}\n${prompt.anweisung}`;
  return (
    /\bentscheide\b/i.test(blob) ||
    /\bentscheidung\b/i.test(blob) ||
    /\bentweder\b[\s\S]{0,80}\boder\b/i.test(blob) ||
    /\bODER\b/.test(blob)
  );
}

/** Actionable prompts that still need an author decision field. */
export function aenderungsPromptsNeedingDecision(
  prompts: RomanAenderungsPrompt[],
): Array<{ index: number; prompt: RomanAenderungsPrompt }> {
  const actionable = new Set(actionableAenderungsPrompts(prompts));
  const out: Array<{ index: number; prompt: RomanAenderungsPrompt }> = [];
  for (let index = 0; index < prompts.length; index += 1) {
    const prompt = prompts[index]!;
    if (!actionable.has(prompt)) continue;
    if (aenderungsPromptNeedsAuthorDecision(prompt)) {
      out.push({ index, prompt });
    }
  }
  return out;
}

export const KRITIK_WICHTIGKEIT_LABEL: Record<RomanKritikWichtigkeit, string> = {
  kritisch: "Kritisch",
  wichtig: "Wichtig",
  nice_to_have: "Nice to have",
};

const WICHTIGKEIT_RANK: Record<RomanKritikWichtigkeit, number> = {
  kritisch: 0,
  wichtig: 1,
  nice_to_have: 2,
};

export function asKritikWichtigkeit(raw: unknown): RomanKritikWichtigkeit {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (s === "kritisch" || s === "critical" || s === "blocker") return "kritisch";
  if (
    s === "nice_to_have" ||
    s === "nicetohave" ||
    s === "optional" ||
    s === "nice" ||
    s === "kosmetik"
  ) {
    return "nice_to_have";
  }
  return "wichtig";
}

/** True when every prompt is optional polish (no Pflicht-Nacharbeit). */
export function onlyNiceToHavePrompts(
  prompts: RomanAenderungsPrompt[],
): boolean {
  return (
    prompts.length > 0 &&
    prompts.every((p) => p.wichtigkeit === "nice_to_have")
  );
}

/** Pflicht-Aufträge for Co-Autor apply (skips nice_to_have when mixed). */
export function actionableAenderungsPrompts(
  prompts: RomanAenderungsPrompt[],
): RomanAenderungsPrompt[] {
  if (prompts.length === 0) return [];
  if (onlyNiceToHavePrompts(prompts)) return [];
  return prompts.filter((p) => p.wichtigkeit !== "nice_to_have");
}

function sortAenderungsPrompts(
  prompts: RomanAenderungsPrompt[],
): RomanAenderungsPrompt[] {
  return [...prompts].sort(
    (a, b) => WICHTIGKEIT_RANK[a.wichtigkeit] - WICHTIGKEIT_RANK[b.wichtigkeit],
  );
}

/**
 * Machine-actionable Co-Autor instruction produced by Testleser.
 * Drives „Feedback einarbeiten“; separate from human-readable prose.
 */
export type RomanLeserFeedbackAenderungsPrompt = RomanAenderungsPrompt;

/**
 * Pending plan after Reifegrad-dimension analyze (dialog → einarbeiten).
 */
export type RomanReifegradImprovePlan = {
  createdAt: string;
  stage: string;
  dimension: string;
  dimensionLabel: string;
  modelLabel: string;
  /** Prose critique for the dialog. */
  kritik: string;
  /** Actionable prompts for Co-Autor apply. */
  aenderungsPrompts: RomanAenderungsPrompt[];
  appliedAt?: string | null;
};

/**
 * Structured Fanbase / Testleser feedback on Manuskript.
 * Persisted on editorial; shown in Leser-Feedback Dialog.
 *
 * Two layers:
 * - `gesamt` (+ optional checks): Prosa zum Lesen
 * - `aenderungsPrompts`: klare Anweisungen für Co-Autor-Einarbeiten
 */
export type RomanLeserFeedback = {
  createdAt: string;
  modelLabel: string;
  personaName: string;
  /** Would the reader keep reading? */
  weiterlesen: boolean;
  /** Honest overall take in reader voice (Prosa zum Lesen). */
  gesamt: string;
  regelnStatus: RomanLeserFeedbackStatus;
  vernachlaessigtesBeduerfnisStatus: RomanLeserFeedbackStatus;
  erfuelltesBeduerfnisStatus: RomanLeserFeedbackStatus;
  /** Free-text detail for the Regel-/Logik-Check. */
  checkDetail: string;
  /**
   * Legacy human tips (Stelle + Text). Kept for old stored rows;
   * new collects prefer `aenderungsPrompts`.
   */
  vorschlaege: Array<{ text: string; stelle: string }>;
  /** Actionable patch prompts for Feedback einarbeiten (preferred). */
  aenderungsPrompts: RomanAenderungsPrompt[];
  /** Optional genre comparison; empty string if none. */
  genreVergleich: string;
  /** When set, this feedback was already woven into Manuskript once. */
  appliedAt?: string | null;
};

/**
 * Compact continuity memory for Manuskript chapter loop (anti-drift).
 * Kept small so it fits every Co-Autor prompt.
 */
export type RomanStoryState = {
  updatedAt: string;
  /** Last chapter this state reflects (0 = before chapter 1). */
  afterChapter: number;
  location: string;
  presentCharacters: string[];
  openThreads: string[];
  /** Who knows what / secrets revealed. */
  secretsAndKnowledge: string[];
  inventoryAndProps: string[];
  relationshipNotes: string[];
  /** Hard facts that must not be contradicted later. */
  hardFacts: string[];
  mood: string;
};

/** Clock / countdown unit for book-wide logic canon. */
export type RomanCanonClockUnit = "mm:ss" | "hh:mm" | "relative";

/** How a canon clock may change across chapters. */
export type RomanCanonMonotonic = "falling" | "rising" | "none";

/**
 * One clock/countdown in the legacy book-wide logic ledger.
 * Shape kept for stored jsonb rows (Logik-Pass UI removed).
 */
export type RomanCanonClock = {
  id: string;
  label: string;
  /** Canonical source of truth (e.g. Schulsystem-Timer). */
  source: string;
  unit: RomanCanonClockUnit;
  monotonic: RomanCanonMonotonic;
  tStart?: string;
  tEnd?: string;
};

export type RomanCanonThread = {
  id: string;
  label: string;
  status: "open" | "resolved" | "dormant";
  lastKapitel?: number;
  notes?: string;
};

export type RomanCanonChapterBeat = {
  kapitel: number;
  /** clockId → value at chapter start (or primary display). */
  clocks?: Record<string, string>;
  facts?: string[];
  threadsActive?: string[];
};

export type RomanCanonPendingInvariant = {
  titel: string;
  anweisung: string;
  /** leser_feedback | reifegrad_logik | other */
  source: string;
};

export type RomanCanonLastPlan = {
  at: string;
  summary: string;
  modelLabel: string;
  violations: string[];
  appliedAt?: string | null;
};

export type RomanCanon = {
  updatedAt: string;
  clocks: RomanCanonClock[];
  threads: RomanCanonThread[];
  hardFacts: string[];
  perChapter: RomanCanonChapterBeat[];
  /** Book-wide prompts pulled into the last plan. */
  pendingInvariants: RomanCanonPendingInvariant[];
  lastPlan?: RomanCanonLastPlan | null;
};

export type RomanEditorial = {
  buchTyp: RomanBuchTyp;
/** Structured idea dossier from Ideen-Finder Q&A (Mistral fill; UI read-only). */
  ideeKurz: string;
  /** Belletristik: acts, turning points, hard plot bans. */
  handlungsArchitektur: string;
  /** serie_welt: world rules, places, continuity. */
  weltBibel: string;
  /** serie_welt: series arcs across volumes. */
  serienBibel: string;
  /** sachbuch: thesis, reader promise, chapter argument tree. */
  sachbuchStruktur: string;
  /**
   * Continuous manuscript prose (Manuskript tab).
   * Distinct from `manuskriptRaw` on roman_kontext (Szenenplot / beat sheet).
   */
  manuskriptText: string;
  /**
   * Snapshot of `manuskriptText` taken before the first „Vereinfachen“ pass.
   * Empty until Vereinfachen runs; restore copies this back to `manuskriptText`.
   */
  manuskriptOriginalText: string;
  /** ISO timestamp when {@link manuskriptOriginalText} was saved; null if none. */
  manuskriptOriginalSavedAt: string | null;
  /**
   * Amazon / Klappentext: back-cover style product description (Export tab).
   */
  klappentext: string;
  /**
   * Amazon Untertitel / Eyecatcher — one short hook line (Export tab).
   */
  einzeiler: string;
  gates: RomanEditorialGates;
  zielAlterMin: number | null;
  zielAlterMax: number | null;
  lesestufe: string;
  zielWortzahlRoman: number | null;
  zielWortzahlSzeneMin: number | null;
  zielWortzahlSzeneMax: number | null;
  serieTitel: string;
  bandNr: number | null;
  mehrteilerForm: RomanMehrteilerForm;
  mehrteilerNotizen: string;
  /** Last AI Mehrteiler advice (editable). */
  mehrteilerBeratung: string;
  /**
   * Basis-Regeln from Basics (genre/age/length) — UI label „Basis-Regeln“.
   * Auto-filled from field presets; editable afterwards.
   */
  grobRegeln: string;
  /**
   * Optional reader-promise directions (ids from `ROMAN_RICHTUNG_OPTIONS`).
   * Empty = no extra constraint; when set → strong MUSS for the whole book.
   */
  richtungen: string[];
  /** Hard “Verlagsregeln” beyond free-text kiRegelwerk (bullets). */
  harteRegeln: string[];
  /** Legacy editorial sign-off flags (kept in jsonb; UI uses auto validation only). */
  checklist: RomanEditorialChecklist;
  /** Optional competitive market scan from Basics Vorab-Schritt. */
  marktanalyse: RomanMarktanalyse | null;
  /**
   * Last Testleser / Fanbase feedback on Manuskript (structured Dialog).
   * Prefer {@link leserFeedbackByStage}.manuskript; kept for legacy rows.
   * Cleared when Manuskript is wiped downstream.
   */
  leserFeedback: RomanLeserFeedback | null;
  /**
   * Testleser feedback per pipeline stage (expose / szenenplot / manuskript).
   * Keys are PipelineStage strings.
   */
  leserFeedbackByStage: Record<string, RomanLeserFeedback>;
  /**
   * Pending Reifegrad-dimension improve plans per pipeline stage, then dimension.
   * Analyze keeps sibling dimensions; apply clears other open plans on that stage.
   * Keys: PipelineStage → dimension key → plan.
   */
  reifegradImprove: Record<string, Record<string, RomanReifegradImprovePlan>>;
  /**
   * Pending stage-wide Verbessern plan (Entwicklungslektor → dialog → Co-Autor).
   * One plan per PipelineStage; same shape as dimension plans (dimension=`verbessern`).
   */
  stageImprove: Record<string, RomanReifegradImprovePlan>;
  /**
   * Running continuity memory while drafting Manuskript chapter-by-chapter.
   * Updated after each chapter; cleared when Manuskript is wiped / regenerated.
   */
  storyState: RomanStoryState | null;
  /**
   * Book-wide logic ledger (legacy jsonb; Logik-Pass UI removed).
   * Cleared when Manuskript is wiped.
   */
  canon: RomanCanon | null;
  /**
   * Structured Kapitelgerüst scenes (dramaturgy / info flow / continuity).
   * Cleared with Szenenplot. Markdown mirror stays in `manuskriptRaw`.
   * See `src/lib/roman/szenenplot-structured.ts`.
   */
  szenenplotStructured: RomanSzenenplotStructured | null;
  /**
   * Per-pipeline-stage maturity (rules + needs) from Entwicklungslektor
   * after Erzeugen (draft) and after Verbessern weave (Bewerter role).
   * See `src/lib/roman/reifegrad.ts`.
   */
  reifegrade?: RomanReifegrade;
  /**
   * Manual author „Fertig“ toggle per pipeline tab (soft-green tab chrome).
   * Keys: typ | idee | spec | outline | schreiben | cover | export.
   */
  pipelineFertig: RomanPipelineFertig;
};

export const DEFAULT_EDITORIAL_CHECKLIST: RomanEditorialChecklist = {
  ideeKlar: false,
  fundamentVoll: false,
  regelnHart: false,
  umfangGesetzt: false,
  outlineGeprueft: false,
  roadmapGeprueft: false,
  stilStichprobe: false,
  coverOk: false,
  vorsatzOk: false,
  readyToPublish: false,
};

export function emptyGateState(): RomanGateState {
  return { reviewedAt: null, reviewText: "", freigegebenAt: null, chat: [] };
}

export function emptyEditorialGates(): RomanEditorialGates {
  return {
    idee: emptyGateState(),
    fundament: emptyGateState(),
    struktur: emptyGateState(),
    outline: emptyGateState(),
  };
}

export function emptyRomanEditorial(): RomanEditorial {
  return {
    buchTyp: "unbekannt",
    ideeKurz: "",
    handlungsArchitektur: "",
    weltBibel: "",
    serienBibel: "",
    sachbuchStruktur: "",
    manuskriptText: "",
    manuskriptOriginalText: "",
    manuskriptOriginalSavedAt: null,
    klappentext: "",
    einzeiler: "",
    gates: emptyEditorialGates(),
    zielAlterMin: null,
    zielAlterMax: null,
    lesestufe: "",
    zielWortzahlRoman: null,
    zielWortzahlSzeneMin: 1800,
    zielWortzahlSzeneMax: 2500,
    serieTitel: "",
    bandNr: null,
    mehrteilerForm: "unbekannt",
    mehrteilerNotizen: "",
    mehrteilerBeratung: "",
    grobRegeln: "",
    richtungen: [],
    harteRegeln: [],
    checklist: { ...DEFAULT_EDITORIAL_CHECKLIST },
    marktanalyse: null,
    leserFeedback: null,
    leserFeedbackByStage: {},
    reifegradImprove: {},
    stageImprove: {},
    storyState: null,
    canon: null,
    szenenplotStructured: null,
    reifegrade: {},
    pipelineFertig: {},
  };
}

export const BUCHTYP_LABELS: Record<RomanBuchTyp, string> = {
  unbekannt: "Noch wählen",
  belletristik: "Belletristik (Einzelband)",
  serie_welt: "Serie / Weltbau",
  sachbuch: "Sachbuch",
};

export const BUCHTYP_HINTS: Record<Exclude<RomanBuchTyp, "unbekannt">, string> = {
  belletristik:
    "Erzählroman: Handlungsarchitektur → Outline → Szenen. Ideal für einen abgeschlossenen Band.",
  serie_welt:
    "Kinderbuch-/Fantasy-Serie: Welt- und Serien-Bibel steuern Kontinuität — Outline allein reicht nicht.",
  sachbuch:
    "These und Kapitel-Argumentbaum steuern die Roadmap — nicht Dramaturgie-Szenen.",
};

export function isBuchTypSet(typ: RomanBuchTyp): boolean {
  return typ !== "unbekannt";
}

export function isPipelineTabFertig(
  editorial: RomanEditorial | null | undefined,
  tabId: keyof RomanPipelineFertig | string,
): boolean {
  return Boolean(editorial?.pipelineFertig?.[tabId as keyof RomanPipelineFertig]);
}

/** Set / clear one tab’s Fertig flag (immutable). */
export function withPipelineTabFertig(
  editorial: RomanEditorial,
  tabId: keyof RomanPipelineFertig,
  fertig: boolean,
): RomanEditorial {
  const next: RomanPipelineFertig = { ...(editorial.pipelineFertig ?? {}) };
  if (fertig) next[tabId] = true;
  else delete next[tabId];
  return { ...editorial, pipelineFertig: next };
}

function parsePipelineFertig(raw: unknown): RomanPipelineFertig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const allowed = new Set([
    "typ",
    "idee",
    "spec",
    "outline",
    "schreiben",
    "cover",
    "export",
  ]);
  const out: RomanPipelineFertig = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(key)) continue;
    if (value === true) out[key as keyof RomanPipelineFertig] = true;
  }
  return out;
}

export function strukturDocForTyp(editorial: RomanEditorial): string {
  switch (editorial.buchTyp) {
    case "belletristik":
      return editorial.handlungsArchitektur.trim();
    case "serie_welt":
      return [editorial.weltBibel.trim(), editorial.serienBibel.trim()]
        .filter(Boolean)
        .join("\n\n");
    case "sachbuch":
      return editorial.sachbuchStruktur.trim();
    default:
      return "";
  }
}

/**
 * Exposé text for the current book type (same storage as Struktur-docs).
 * Belletristik → handlungsArchitektur; Serie → welt-/serien-Bibel; Sachbuch → sachbuchStruktur.
 */
export function exposeTextFromEditorial(editorial: RomanEditorial): string {
  return strukturDocForTyp(editorial);
}

/**
 * Writes Exposé into the type-specific editorial field.
 * Serie/Welt: full Exposé in `weltBibel` (serienBibel left unchanged).
 */
export function withExposeText(
  editorial: RomanEditorial,
  text: string,
): RomanEditorial {
  const trimmed = text.trim().slice(0, 80_000);
  switch (editorial.buchTyp) {
    case "belletristik":
      return { ...editorial, handlungsArchitektur: trimmed };
    case "serie_welt":
      return { ...editorial, weltBibel: trimmed };
    case "sachbuch":
      return { ...editorial, sachbuchStruktur: trimmed };
    default:
      return { ...editorial, handlungsArchitektur: trimmed };
  }
}

export type RomanPresetKind = "alter" | "genre";

export type RomanEditorialPreset = {
  id: string;
  kind: RomanPresetKind;
  label: string;
  /** Short note shown under the select. */
  hint: string;
  apply: Partial<RomanEditorial>;
};

export const ROMAN_ALTER_PRESETS: RomanEditorialPreset[] = [
  {
    id: "bilderbuch-3-6",
    kind: "alter",
    label: "Bilderbuch / Vorlesen (3–6)",
    hint: "Sehr kurze Kapitel, Vorlesen, einfache Wörter · ca. 1.500–5.000 Wörter.",
    apply: {
      zielAlterMin: 3,
      zielAlterMax: 6,
      lesestufe: "Bilderbuch / Vorlesen",
      zielWortzahlRoman: 3_000,
      zielWortzahlSzeneMin: 200,
      zielWortzahlSzeneMax: 500,
    },
  },
  {
    id: "kinder-6-8",
    kind: "alter",
    label: "Erstleser / Kinderbuch (6–8)",
    hint: "Kurze Sätze, bekannte Wörter · ca. 8.000–18.000 Wörter.",
    apply: {
      zielAlterMin: 6,
      zielAlterMax: 8,
      lesestufe: "Erstleser / einfaches Kinderbuch",
      zielWortzahlRoman: 12_000,
      zielWortzahlSzeneMin: 600,
      zielWortzahlSzeneMax: 1_200,
    },
  },
  {
    id: "kinder-8-10",
    kind: "alter",
    label: "Kinderbuch (8–10)",
    hint: "Vorlesen & erstes Selbstlesen · ca. 20.000–35.000 Wörter.",
    apply: {
      zielAlterMin: 8,
      zielAlterMax: 10,
      lesestufe: "Kinderbuch / Vorlesen & erstes Selbstlesen",
      zielWortzahlRoman: 28_000,
      zielWortzahlSzeneMin: 1_200,
      zielWortzahlSzeneMax: 2_000,
    },
  },
  {
    id: "jugend-11-14",
    kind: "alter",
    label: "Mittelstufe / YA light (11–14)",
    hint: "Mehr Tempo und Konflikt, noch zugänglich · ca. 40.000–70.000 Wörter.",
    apply: {
      zielAlterMin: 11,
      zielAlterMax: 14,
      lesestufe: "Jugendbuch / Mittelstufe",
      zielWortzahlRoman: 55_000,
      zielWortzahlSzeneMin: 1_500,
      zielWortzahlSzeneMax: 2_500,
    },
  },
  {
    id: "ya-14-18",
    kind: "alter",
    label: "Young Adult (14–18)",
    hint: "Vollständige Romanstruktur, starke Stimme · ca. 60.000–90.000 Wörter.",
    apply: {
      zielAlterMin: 14,
      zielAlterMax: 18,
      lesestufe: "Young Adult",
      zielWortzahlRoman: 75_000,
      zielWortzahlSzeneMin: 1_800,
      zielWortzahlSzeneMax: 2_800,
    },
  },
  {
    id: "erwachsen",
    kind: "alter",
    label: "Erwachsene / allgemein",
    hint: "Keine Altersbegrenzung der Sprache · typisch 70.000–110.000 Wörter.",
    apply: {
      zielAlterMin: 18,
      zielAlterMax: null,
      lesestufe: "Erwachsene / allgemeine Belletristik",
      zielWortzahlRoman: 90_000,
      zielWortzahlSzeneMin: 1_800,
      zielWortzahlSzeneMax: 2_800,
    },
  },
];

/** Common genres for Fundament select (Belletristik). */
export const ROMAN_GENRE_OPTIONS_BELLETRISTIK = [
  "Thriller",
  "Psychothriller",
  "Krimi",
  "Fantasy",
  "Urban Fantasy",
  "Science Fiction",
  "Romance",
  "Romantic Comedy",
  "Historischer Roman",
  "Literarische Belletristik",
  "Horror",
  "Abenteuer",
  "Mystery",
  "Humor / Comedy",
  "Kinderbuch-Fantasy",
  "Kinderbuch-Alltag",
  "Jugendbuch / Coming-of-Age",
  "Young-Adult-Fantasy",
  "Young-Adult-Romance",
  "Zeitgenössisch",
] as const;

/** Common genres for Fundament select (Sachbuch). */
export const ROMAN_GENRE_OPTIONS_SACHBUCH = [
  "Ratgeber",
  "Selbsthilfe / Persönlichkeit",
  "Populärwissenschaft",
  "Business / Karriere",
  "Geschichte",
  "Biografie / Memoir",
  "Gesellschaft / Politik",
  "Gesundheit",
  "Erziehung / Familie",
  "Finanzen",
  "Technik / Digitales",
  "Reise / Reportage",
] as const;

/** Book-length choices (Wörter) — aligned with common DE market bands. */
export const ROMAN_BUCHLAENGE_OPTIONS = [
  { words: 3_000, label: "Sehr kurz · ca. 3.000 Wörter" },
  { words: 12_000, label: "Kurz · ca. 12.000 Wörter" },
  { words: 28_000, label: "Kinderbuch · ca. 28.000 Wörter" },
  { words: 40_000, label: "Novelle / schlank · ca. 40.000 Wörter" },
  { words: 55_000, label: "Mittel · ca. 55.000 Wörter" },
  { words: 75_000, label: "Roman · ca. 75.000 Wörter" },
  { words: 90_000, label: "Vollroman · ca. 90.000 Wörter" },
  { words: 110_000, label: "Lang · ca. 110.000 Wörter" },
] as const;

/** Max optional directions selectable on Basics. */
export const ROMAN_RICHTUNG_MAX = 2;

/**
 * Optional reader-promise / tone directions (cross-genre).
 * Ids are stored on `editorial.richtungen`.
 */
export const ROMAN_RICHTUNG_OPTIONS = [
  {
    id: "spannend",
    label: "Spannend",
    hint: "Zug, Cliffhanger, Vorwärtsdrang",
    leitplanken: [
      "Richtung SPANNEND (verbindlich): jedes Kapitel braucht Zug oder eine offene Frage — keine toten Expositionsstrecken.",
      "Spannung über Motivation und Konsequenzen lösen, nicht nur über Zufall oder künstliche Cliffhanger.",
    ],
  },
  {
    id: "lustig",
    label: "Lustig",
    hint: "Humor, Leichtigkeit, Timing",
    leitplanken: [
      "Richtung LUSTIG (verbindlich): Humor ist Kernversprechen — Dialog, Situationskomik oder Stimme müssen tragen, nicht nur Beilagen-Witze.",
      "Ernst darf vorkommen, aber die Gesamtstimmung bleibt leicht und belohnend für Lachen/Schmunzeln.",
    ],
  },
  {
    id: "emotional",
    label: "Emotional",
    hint: "Nähe, Gefühl, Beziehung",
    leitplanken: [
      "Richtung EMOTIONAL (verbindlich): Figurengefühle und Beziehungen sind der Motor — innere Wendungen zählen so viel wie Plot-Beats.",
      "Keine kühle Distanz als Default; Leser:innen müssen mitfühlen können.",
    ],
  },
  {
    id: "motivierend",
    label: "Motivierend",
    hint: "Aufbruch, Zuversicht, Wirkung",
    leitplanken: [
      "Richtung MOTIVIEREND (verbindlich): das Werk muss ein klares Aufbruch-/Wirksamkeitsgefühl hinterlassen — Fortschritt, Hoffnung oder greifbare Handlungsimpulse.",
      "Vermeide lähmenden Zynismus oder endloses Problem-Stacking ohne Perspektive.",
    ],
  },
  {
    id: "duester",
    label: "Düster",
    hint: "Druck, Schatten, Unbehagen",
    leitplanken: [
      "Richtung DÜSTER (verbindlich): Atmosphäre, Risiko und moralische Grauzonen tragen mit — nicht alles weichzeichnen.",
      "Trost oder Hoffnung nur dosiert; der dunkle Grundton bleibt erkennbar.",
    ],
  },
  {
    id: "romantisch",
    label: "Romantisch",
    hint: "Anziehung, Chemie, Beziehungsbogen",
    leitplanken: [
      "Richtung ROMANTISCH (verbindlich): die Beziehungsdynamik ist zentral — Chemie, Nähe/Distanz und emotionale Einsätze pflegen.",
      "Plot darf dienen, darf die Romance aber nicht dauerhaft verdrängen.",
    ],
  },
  {
    id: "abenteuerlich",
    label: "Abenteuerlich",
    hint: "Entdeckung, Bewegung, Mut",
    leitplanken: [
      "Richtung ABENTEUERLICH (verbindlich): Orts-/Aufgabenwechsel und Entdeckungsdrang halten das Tempo — Stillstand nur kurz.",
      "Mut, Risiko und neue Räume (oder Ideenwelten) regelmäßig belohnen.",
    ],
  },
  {
    id: "nachdenklich",
    label: "Nachdenklich",
    hint: "Tiefe, Fragen, Resonanz",
    leitplanken: [
      "Richtung NACHDENKLICH (verbindlich): Themen und Fragen dürfen Raum haben — ohne Predigt, mit greifbarer menschlicher Resonanz.",
      "Vermeide reine Action-Oberfläche; Einsicht oder Irritation soll haften bleiben.",
    ],
  },
  {
    id: "praktisch",
    label: "Praktisch",
    hint: "Anwendbar, klar, umsetzbar",
    leitplanken: [
      "Richtung PRAKTISCH (verbindlich): Leser:innen brauchen greifbare Takeaways, Schritte oder Werkzeuge — nicht nur Theorie oder Story.",
      "Jedes größere Kapitel sollte etwas Anwendbares liefern.",
    ],
  },
  {
    id: "leicht",
    label: "Leicht / entspannt",
    hint: "Wohlfühlton, niedriger Druck",
    leitplanken: [
      "Richtung LEICHT/ENTSPANNT (verbindlich): Lesekomfort vor Härte — Konflikte lösbar, Tempo angenehm, kein Dauer-Stress.",
      "Schwere Themen nur behutsam; der Gesamteindruck bleibt wohltuend.",
    ],
  },
] as const;

export type RomanRichtungId = (typeof ROMAN_RICHTUNG_OPTIONS)[number]["id"];

/** Normalize stored direction ids (unknown ids dropped; max `ROMAN_RICHTUNG_MAX`). */
export function normalizeRichtungen(raw: unknown): string[] {
  const known = new Set(
    ROMAN_RICHTUNG_OPTIONS.map((o) => o.id as string),
  );
  const list = Array.isArray(raw)
    ? raw.map((x) => String(x ?? "").trim()).filter(Boolean)
    : typeof raw === "string" && raw.trim()
      ? raw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of list) {
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= ROMAN_RICHTUNG_MAX) break;
  }
  return out;
}

export function richtungenLabels(ids: string[]): string[] {
  return normalizeRichtungen(ids).map((id) => {
    const opt = ROMAN_RICHTUNG_OPTIONS.find((o) => o.id === id);
    return opt?.label ?? id;
  });
}

/** Compact label for tonalitaet / prompts. */
export function formatRichtungenLabel(ids: string[]): string {
  return richtungenLabels(ids).join(" · ");
}

export function richtungenLeitplanken(ids: string[]): string[] {
  const bullets: string[] = [];
  for (const id of normalizeRichtungen(ids)) {
    const opt = ROMAN_RICHTUNG_OPTIONS.find((o) => o.id === id);
    if (opt) bullets.push(...opt.leitplanken);
  }
  return bullets;
}

/**
 * Free-text tonalitaet derived from optional directions (for pipeline fields).
 * Empty when no directions selected.
 */
export function tonalitaetFromRichtungen(ids: string[]): string {
  const labels = richtungenLabels(ids);
  if (!labels.length) return "";
  return `Leserversprechen / Richtung: ${labels.join(" und ")}. Diese Richtung(en) gelten verbindlich für Ton, Pacing und Belohnung des gesamten Buchs.`;
}

export function genreOptionsForBuchTyp(
  buchTyp: RomanBuchTyp,
): readonly string[] {
  if (buchTyp === "sachbuch") return ROMAN_GENRE_OPTIONS_SACHBUCH;
  return ROMAN_GENRE_OPTIONS_BELLETRISTIK;
}

/** Resolve Alters-Preset id from stored editorial age fields. */
export function findAlterPresetId(editorial: RomanEditorial): string {
  const match = ROMAN_ALTER_PRESETS.find(
    (p) =>
      p.apply.zielAlterMin === editorial.zielAlterMin &&
      (p.apply.zielAlterMax ?? null) === (editorial.zielAlterMax ?? null),
  );
  return match?.id ?? "";
}

/** Closest book-length option to a word count. */
export function nearestBuchlaengeWords(words: number | null): number | "" {
  if (words == null || !Number.isFinite(words) || words <= 0) return "";
  let best: number = ROMAN_BUCHLAENGE_OPTIONS[0]!.words;
  let bestDiff = Math.abs(best - words);
  for (const opt of ROMAN_BUCHLAENGE_OPTIONS) {
    const d = Math.abs(opt.words - words);
    if (d < bestDiff) {
      best = opt.words;
      bestDiff = d;
    }
  }
  return best;
}

/**
 * Apply Alters-Preset + chosen book length + grobRegeln onto editorial.
 * Used by Basics UI and KI-suggest persist.
 */
export function applyAlterPresetToEditorial(
  editorial: RomanEditorial,
  alterPresetId: string,
  zielWortzahlRoman: number | "",
  grobRegeln: string,
  richtungen?: string[],
): RomanEditorial {
  const preset = ROMAN_ALTER_PRESETS.find((p) => p.id === alterPresetId);
  const words =
    typeof zielWortzahlRoman === "number"
      ? zielWortzahlRoman
      : (preset?.apply.zielWortzahlRoman ?? editorial.zielWortzahlRoman);
  return {
    ...editorial,
    ...(preset?.apply ?? {}),
    zielWortzahlRoman: words ?? null,
    grobRegeln: grobRegeln.trim(),
    richtungen:
      richtungen !== undefined
        ? normalizeRichtungen(richtungen)
        : normalizeRichtungen(editorial.richtungen),
  };
}

/** Map Genre-Select → matching genre-rule preset (or null). */
function genreRulePresetForGenre(genre: string): RomanEditorialPreset | null {
  const g = genre.trim().toLowerCase();
  if (!g) return null;
  if (
    g.includes("kinder") ||
    g.includes("bilderbuch") ||
    g.includes("erstleser")
  ) {
    return ROMAN_GENRE_RULE_PRESETS.find((p) => p.id === "regeln-kinderbuch") ?? null;
  }
  if (
    g.includes("young-adult") ||
    g.includes("young adult") ||
    g.includes("jugend") ||
    g.includes("coming-of-age") ||
    g.includes("ya ")
  ) {
    return ROMAN_GENRE_RULE_PRESETS.find((p) => p.id === "regeln-ya") ?? null;
  }
  if (
    g.includes("thriller") ||
    g.includes("krimi") ||
    g.includes("mystery") ||
    g.includes("horror")
  ) {
    return ROMAN_GENRE_RULE_PRESETS.find((p) => p.id === "regeln-thriller") ?? null;
  }
  if (
    g.includes("fantasy") ||
    g.includes("science fiction") ||
    g.includes("sci-fi") ||
    g.includes("spekulativ")
  ) {
    return ROMAN_GENRE_RULE_PRESETS.find((p) => p.id === "regeln-fantasy") ?? null;
  }
  if (g.includes("romance") || g.includes("liebes") || g.includes("romantic")) {
    return ROMAN_GENRE_RULE_PRESETS.find((p) => p.id === "regeln-romance") ?? null;
  }
  if (
    g.includes("literar") ||
    g.includes("zeitgenöss") ||
    g.includes("belletristik")
  ) {
    return ROMAN_GENRE_RULE_PRESETS.find((p) => p.id === "regeln-literary") ?? null;
  }
  return null;
}

function alterLeitplanken(alterPresetId: string): string[] {
  switch (alterPresetId) {
    case "bilderbuch-3-6":
      return [
        "Vorlesen: sehr kurze Sätze, Wiederholung und Rhythmus willkommen.",
        "Keine Angst-, Gewalt- oder Todesdarstellungen; Konflikte weich und lösbar.",
        "Bilder tragen mit — Text bleibt knapp und klar.",
      ];
    case "kinder-6-8":
      return [
        "Erstleser-tauglich: kurze Sätze, bekannte Wörter, klare Handlungsschritte.",
        "Keine explizite Gewalt, kein Zynismus, keine Erwachsenensexualität.",
        "Humor und Spannung kindgerecht dosieren.",
      ];
    case "kinder-8-10":
      return [
        "Sprache an Vorlesen und erstes Selbstlesen anpassen — zugänglich, nicht infantil.",
        "Konflikt und Gefahr erlaubt, aber ohne Grausamkeit und ohne traumatische Detailtiefe.",
        "Kapitel mit klarem dramatischem oder emotionalem Haken beenden.",
      ];
    case "jugend-11-14":
      return [
        "Mehr Tempo und Konflikt als im Kinderbuch, aber noch zugänglich — kein Hard-YA.",
        "Themen ernst nehmen ohne moralischen Vortrag; Identifikation vor Belehrung.",
        "Sprache modern und klar, ohne Kinderton und ohne Erwachsenen-Feuilleton.",
      ];
    case "ya-14-18":
      return [
        "Glaubwürdige YA-Stimme: emotionale Ehrlichkeit, innere Konflikte zeigen.",
        "Intimität und Härte altersangemessen — Consent und Grenzen klar.",
        "Kein belehrender Erwachsenenton; Themen durch Handlung tragen.",
      ];
    case "erwachsen":
      return [
        "Keine künstliche Altersbegrenzung der Sprache — Register dem Genre anpassen.",
        "Komplexität in Figur, Motiv und Struktur ist erlaubt und erwünscht.",
        "Tabus nur, wenn dramaturgisch begründet — nicht schockieren um des Effekts willen.",
      ];
    default:
      return [];
  }
}

function laengeLeitplanken(words: number): string[] {
  if (words <= 5_000) {
    return [
      `Zielumfang ca. ${words.toLocaleString("de-DE")} Wörter: extreme Knappheit — jede Zeile muss tragen.`,
      "Wenige Schauplätze und Figuren; kein Nebenplot-Ballast.",
    ];
  }
  if (words <= 18_000) {
    return [
      `Zielumfang ca. ${words.toLocaleString("de-DE")} Wörter: kurze Kapitel, klarer Fokus auf eine Hauptlinie.`,
      "Nebenfiguren sparsam; Exposition minimal halten.",
    ];
  }
  if (words <= 35_000) {
    return [
      `Zielumfang ca. ${words.toLocaleString("de-DE")} Wörter: klassisches Kinder-/Jugendformat — Tempo vor Weltbau.`,
      "Kapitel überschaubar halten; Cliffhanger dosieren.",
    ];
  }
  if (words <= 50_000) {
    return [
      `Zielumfang ca. ${words.toLocaleString("de-DE")} Wörter: schlanker Roman/Novelle — eine klare Dramaturgie.`,
      "B-Plots nur, wenn sie die A-Linie verschärfen.",
    ];
  }
  if (words <= 80_000) {
    return [
      `Zielumfang ca. ${words.toLocaleString("de-DE")} Wörter: Standardroman — vollständige Aktstruktur möglich.`,
      "Szenenlänge und Kapitelrhythmus auf Lesbarkeit und Spannung trimmen.",
    ];
  }
  return [
    `Zielumfang ca. ${words.toLocaleString("de-DE")} Wörter: langer Roman — Subplots und Welt nur, wenn sie die Kernerzählung stützen.`,
    "Pacing im Blick behalten: Mitte nicht mit Exposition oder Wiederholung füllen.",
  ];
}

function buchTypLeitplanken(buchTyp: RomanBuchTyp): string[] {
  if (buchTyp === "sachbuch") {
    return [
      "Sachbuch: These und Leserversprechen steuern die Kapitel — keine Roman-Dramaturgie erzwingen.",
      "Beispiele und Argumente klar; Fachjargon nur mit Erklärung.",
    ];
  }
  if (buchTyp === "serie_welt") {
    return [
      "Serie/Welt: Kontinuität und Weltregeln über Einzelband-Spannung stellen.",
      "Jeder Band braucht einen eigenen dramatischen Bogen, der die Serie trägt.",
    ];
  }
  if (buchTyp === "belletristik") {
    return [
      "Belletristik (Einzelband): abgeschlossene Dramaturgie — Setup, Escalation, Auflösung im Band.",
    ];
  }
  return [];
}

/**
 * Builds default „Basis-Regeln“ text from Basics selects (genre, age, length, type, optional directions).
 * Empty while nothing relevant is chosen.
 */
export function buildBasisRegeln(input: {
  buchTyp: RomanBuchTyp;
  genre: string;
  alterPresetId: string;
  zielWortzahlRoman: number | "";
  richtungen?: string[];
}): string {
  const alter = ROMAN_ALTER_PRESETS.find((p) => p.id === input.alterPresetId);
  const words =
    typeof input.zielWortzahlRoman === "number"
      ? input.zielWortzahlRoman
      : null;
  const genre = input.genre.trim();
  const richtungen = normalizeRichtungen(input.richtungen);
  const hasAny =
    input.buchTyp !== "unbekannt" ||
    Boolean(genre) ||
    Boolean(alter) ||
    words != null ||
    richtungen.length > 0;
  if (!hasAny) return "";

  const header: string[] = [];
  if (input.buchTyp !== "unbekannt") {
    header.push(`Buchtyp: ${BUCHTYP_LABELS[input.buchTyp]}`);
  }
  if (genre) header.push(`Genre: ${genre}`);
  if (richtungen.length) {
    header.push(`Richtung: ${formatRichtungenLabel(richtungen)}`);
  }
  if (alter) {
    const lese = alter.apply.lesestufe
      ? ` · Lesestufe: ${alter.apply.lesestufe}`
      : "";
    header.push(`Altersgruppe: ${alter.label}${lese}`);
  }
  if (words != null) {
    const opt = ROMAN_BUCHLAENGE_OPTIONS.find((o) => o.words === words);
    header.push(
      `Zielumfang: ${opt?.label ?? `ca. ${words.toLocaleString("de-DE")} Wörter`}`,
    );
  }

  const bullets: string[] = [
    ...buchTypLeitplanken(input.buchTyp),
    ...alterLeitplanken(input.alterPresetId),
    ...richtungenLeitplanken(richtungen),
  ];
  if (words != null) bullets.push(...laengeLeitplanken(words));

  const genrePreset = genreRulePresetForGenre(genre);
  const genreRules = genrePreset?.apply.harteRegeln ?? [];
  if (genreRules.length) {
    bullets.push(...genreRules);
  } else if (genre && input.buchTyp === "sachbuch") {
    bullets.push(
      `Genre „${genre}“: Nutzen und Klarheit vor Anekdoten-Ballast; Kapitel mit greifbarem Takeaway.`,
      "Behauptungen nachvollziehbar machen — Beispiele, Schritte oder Belege einbauen.",
    );
  } else if (genre) {
    bullets.push(
      `Genre „${genre}“: Erwartungen des Genres erfüllen (Ton, Konflikt, Belohnung), ohne Klischee-Pflichtprogramm.`,
    );
  }

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const unique = bullets.filter((b) => {
    const key = b.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const parts = [
    "Basis-Regeln (aus Auswahl — manuell anpassbar)",
    ...header,
  ];
  if (unique.length) {
    parts.push("", "Leitplanken:");
    for (const b of unique) parts.push(`– ${b}`);
  }
  return parts.join("\n");
}

export const ROMAN_GENRE_RULE_PRESETS: RomanEditorialPreset[] = [
  {
    id: "regeln-kinderbuch",
    kind: "genre",
    label: "Kinderbuch",
    hint: "Kindgerechte Sprache, Haken, kein Zynismus.",
    apply: {
      harteRegeln: [
        "Wortwahl und Satzlänge an die gesetzte Lesestufe halten — kurze Sätze, bekannte Wörter.",
        "Kein Erwachsenen-Feuilleton, keine Schachtelsätze, keine Fachsprache.",
        "Humor und Spannung kindgerecht — nie zynisch oder grausam.",
        "Jedes Kapitel endet mit einem klaren dramatischen oder emotionalen Haken.",
      ],
    },
  },
  {
    id: "regeln-ya",
    kind: "genre",
    label: "Young Adult",
    hint: "Stimme, Identifikation, Tempo — ohne Kinderton.",
    apply: {
      harteRegeln: [
        "Protagonist:innen-Stimme glaubwürdig für die Zielaltersgruppe — kein Kinderton, kein belehrender Erwachsenenton.",
        "Emotionale Ehrlichkeit vor Floskeln; innere Konflikte zeigen, nicht erklären.",
        "Tempo halten: jede Szene verändert Beziehung, Wissen oder Risiko.",
        "Keine moralischen Vorträge; Themen durch Handlung und Dialog tragen.",
      ],
    },
  },
  {
    id: "regeln-thriller",
    kind: "genre",
    label: "Thriller / Spannung",
    hint: "Information dosieren, Cliffhanger, Glaubwürdigkeit.",
    apply: {
      harteRegeln: [
        "Information dosieren: Leser:in weiß nie deutlich mehr oder weniger als dramaturgisch nötig.",
        "Jede Szene erhöht Risiko, Druck oder Rätsel — kein Leerlauf.",
        "Kapitelenden mit Haken (Frage, Drohung, Entdeckung), ohne billige Cliffhanger-Wiederholung.",
        "Motive und Logik der Antagonist:innen glaubwürdig halten — kein Plot-Convenience.",
      ],
    },
  },
  {
    id: "regeln-fantasy",
    kind: "genre",
    label: "Fantasy / Spekulativ",
    hint: "Weltregeln konsistent, Exposition sparsam.",
    apply: {
      harteRegeln: [
        "Weltregeln (Magie, Technologie, Gesellschaft) konsistent einhalten — kein Regelbruch ohne Preis.",
        "Exposition sparsam und szenisch: zeigen statt Weltbau-Vortrag.",
        "Eigennamen und Begriffe dosieren; Leser:in nicht mit Glossar erschlagen.",
        "Wunder und Gefahr emotional verankern — nicht nur spekulativ dekorieren.",
      ],
    },
  },
  {
    id: "regeln-romance",
    kind: "genre",
    label: "Romance / Liebesgeschichte",
    hint: "Chemie, Konflikt, Consent, emotionale Beats.",
    apply: {
      harteRegeln: [
        "Romantische Chemie und Konflikt in jeder relevanten Szene spürbar machen.",
        "Consent und emotionale Grenzen klar — kein „Überreden“ als Romantik.",
        "Missverständnisse nur, wenn motiviert; kein künstliches Auseinanderreißen.",
        "Intimität und Nähe zum Ton und zur Altersstufe passend dosieren.",
      ],
    },
  },
  {
    id: "regeln-literary",
    kind: "genre",
    label: "Literarisch / Character-driven",
    hint: "Stimme, Subtext, keine Genre-Pflicht-Plotpunkte.",
    apply: {
      harteRegeln: [
        "Stimme und Subtext vor Plot-Pflichtpunkten — keine Schema-F-Wendungen.",
        "Jedes Bild und jede Metapher muss zur etablierten Tonalität passen.",
        "Dialog trägt Charakter und Machtverhältnis, nicht nur Information.",
        "Emotion unter der Oberfläche lassen — Show, don’t tell, ohne Kälte.",
      ],
    },
  },
];

function asInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function asForm(value: unknown): RomanMehrteilerForm {
  if (
    value === "einzelband" ||
    value === "duologie" ||
    value === "trilogie" ||
    value === "serie" ||
    value === "unbekannt"
  ) {
    return value;
  }
  return "unbekannt";
}

function asBuchTyp(value: unknown): RomanBuchTyp {
  if (
    value === "belletristik" ||
    value === "serie_welt" ||
    value === "sachbuch" ||
    value === "unbekannt"
  ) {
    return value;
  }
  return "unbekannt";
}

function parseGateChat(raw: unknown): RomanGateChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: RomanGateChatMessage[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const role = r.role === "user" || r.role === "assistant" ? r.role : null;
    const content = String(r.content ?? "").trim();
    if (!role || !content) continue;
    out.push({ role, content: content.slice(0, 20_000) });
    if (out.length >= 60) break;
  }
  return out;
}

function parseGateState(raw: unknown): RomanGateState {
  if (!raw || typeof raw !== "object") return emptyGateState();
  const row = raw as Record<string, unknown>;
  const chat = parseGateChat(row.chat);
  const reviewText = String(row.reviewText ?? "").trim();
  // Migrate: if only reviewText exists, seed chat so Idee-Dialog can continue.
  const migratedChat =
    chat.length === 0 && reviewText.length >= 40
      ? ([{ role: "assistant" as const, content: reviewText }] satisfies RomanGateChatMessage[])
      : chat;
  return {
    reviewedAt:
      typeof row.reviewedAt === "string" && row.reviewedAt.trim()
        ? row.reviewedAt.trim()
        : null,
    reviewText,
    freigegebenAt:
      typeof row.freigegebenAt === "string" && row.freigegebenAt.trim()
        ? row.freigegebenAt.trim()
        : null,
    chat: migratedChat,
  };
}

function parseGates(raw: unknown): RomanEditorialGates {
  const base = emptyEditorialGates();
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Record<string, unknown>;
  return {
    idee: parseGateState(row.idee),
    fundament: parseGateState(row.fundament),
    struktur: parseGateState(row.struktur),
    outline: parseGateState(row.outline),
  };
}

function parseMarktanalyseBuch(raw: unknown): RomanMarktanalyseBuch | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const title = String(row.title ?? "").trim();
  if (!title) return null;
  const critiquePoints = Array.isArray(row.critiquePoints)
    ? row.critiquePoints
        .map((x) => String(x ?? "").trim())
        .filter((s) => s.length >= 3)
        .slice(0, 5)
    : [];
  const strengthPoints = Array.isArray(row.strengthPoints)
    ? row.strengthPoints
        .map((x) => String(x ?? "").trim())
        .filter((s) => s.length >= 3)
        .slice(0, 5)
    : [];
  if (critiquePoints.length < 1 && strengthPoints.length < 1) return null;
  const worst = Number(row.worstReviewsConsidered);
  const best = Number(row.bestReviewsConsidered);
  return {
    title: title.slice(0, 200),
    author: String(row.author ?? "unbekannt").trim().slice(0, 120) || "unbekannt",
    whyPopular: String(row.whyPopular ?? "").trim().slice(0, 500),
    critiquePoints: critiquePoints.map((c) => c.slice(0, 400)),
    strengthPoints: strengthPoints.map((c) => c.slice(0, 400)),
    worstReviewsConsidered:
      Number.isFinite(worst) && worst > 0
        ? Math.min(20, Math.round(worst))
        : undefined,
    bestReviewsConsidered:
      Number.isFinite(best) && best > 0
        ? Math.min(20, Math.round(best))
        : undefined,
  };
}

/** Tolerant parse of stored market scan jsonb. */
export function parseRomanMarktanalyse(
  raw: unknown,
): RomanMarktanalyse | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const books = Array.isArray(row.books)
    ? row.books
        .map(parseMarktanalyseBuch)
        .filter((b): b is RomanMarktanalyseBuch => Boolean(b))
        .slice(0, 5)
    : [];
  if (books.length < 1) return null;
  const neglectedNeed = String(row.neglectedNeed ?? "").trim();
  if (neglectedNeed.length < 10) return null;
  const fulfilledNeed = String(row.fulfilledNeed ?? "").trim();
  const sources = Array.isArray(row.sources)
    ? row.sources
        .map((s) => {
          if (!s || typeof s !== "object") return null;
          const o = s as Record<string, unknown>;
          const uri = String(o.uri ?? "").trim();
          if (!uri) return null;
          return {
            title: String(o.title ?? "").trim().slice(0, 200),
            uri: uri.slice(0, 2_000),
          };
        })
        .filter((s): s is { title: string; uri: string } => Boolean(s))
        .slice(0, 24)
    : undefined;
  return {
    genre: String(row.genre ?? "").trim().slice(0, 120),
    zielgruppe: String(row.zielgruppe ?? "").trim().slice(0, 200),
    richtungen: Array.isArray(row.richtungen)
      ? row.richtungen
          .map((x) => String(x ?? "").trim())
          .filter(Boolean)
          .slice(0, ROMAN_RICHTUNG_MAX)
      : [],
    scannedAt: String(row.scannedAt ?? "").trim() || new Date(0).toISOString(),
    books,
    topCritiqueThemes: Array.isArray(row.topCritiqueThemes)
      ? row.topCritiqueThemes
          .map((x) => String(x ?? "").trim())
          .filter((s) => s.length >= 3)
          .slice(0, 5)
          .map((t) => t.slice(0, 400))
      : [],
    neglectedNeed: neglectedNeed.slice(0, 2_000),
    topStrengthThemes: Array.isArray(row.topStrengthThemes)
      ? row.topStrengthThemes
          .map((x) => String(x ?? "").trim())
          .filter((s) => s.length >= 3)
          .slice(0, 5)
          .map((t) => t.slice(0, 400))
      : [],
    fulfilledNeed: fulfilledNeed.slice(0, 2_000),
    modelLabel: String(row.modelLabel ?? "").trim().slice(0, 120),
    sources,
    searchSuggestionsHtml: String(row.searchSuggestionsHtml ?? "")
      .trim()
      .slice(0, 50_000) || undefined,
    webSearchQueries: Array.isArray(row.webSearchQueries)
      ? row.webSearchQueries
          .map((x) => String(x ?? "").trim())
          .filter(Boolean)
          .slice(0, 12)
      : undefined,
  };
}

function asLeserFeedbackStatus(raw: unknown): RomanLeserFeedbackStatus {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (
    s === "erfuellt" ||
    s === "erfullt" ||
    s === "ok" ||
    s === "ja" ||
    s === "fulfilled"
  ) {
    return "erfuellt";
  }
  if (s === "fehlt" || s === "nein" || s === "missing") return "fehlt";
  return "teilweise";
}

/** Tolerant parse of stored Testleser feedback jsonb. */
export function parseRomanLeserFeedback(
  raw: unknown,
): RomanLeserFeedback | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const gesamt = String(row.gesamt ?? row.leserFeedback ?? row.prosa ?? "")
    .trim();
  if (gesamt.length < 20) return null;

  const aenderungsPrompts = parseAenderungsPrompts(row.aenderungsPrompts);

  const vorschlaegeRaw = Array.isArray(row.vorschlaege) ? row.vorschlaege : [];
  let vorschlaege = vorschlaegeRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const text = String(o.text ?? o.vorschlag ?? "").trim();
      if (text.length < 8) return null;
      return {
        text: text.slice(0, 1_200),
        stelle: String(o.stelle ?? "").trim().slice(0, 200),
      };
    })
    .filter((v): v is { text: string; stelle: string } => Boolean(v))
    .slice(0, 10);

  // Prefer actionable prompts; synthesize legacy vorschlaege for UI/compat.
  if (aenderungsPrompts.length > 0 && vorschlaege.length === 0) {
    vorschlaege = aenderungsPrompts.map((p) => ({
      text: p.anweisung.slice(0, 1_200),
      stelle:
        p.scope === "buchweit"
          ? "buchweit"
          : p.kapitel.map((n) => `Kap. ${n}`).join(", "),
    }));
  }

  // Empty change list is valid when the reader only left prose ("passt so").
  const prompts =
    aenderungsPrompts.length > 0
      ? aenderungsPrompts
      : vorschlaege.length > 0
        ? vorschlaegeToAenderungsPrompts(vorschlaege)
        : [];

  const weiterRaw = row.weiterlesen;
  const weiterlesen =
    typeof weiterRaw === "boolean"
      ? weiterRaw
      : /^(ja|true|1|yes)$/i.test(String(weiterRaw ?? "").trim());
  return {
    createdAt:
      String(row.createdAt ?? "").trim() || new Date().toISOString(),
    modelLabel: String(row.modelLabel ?? "").trim().slice(0, 120),
    personaName: String(row.personaName ?? "").trim().slice(0, 120),
    weiterlesen,
    gesamt: gesamt.slice(0, 6_000),
    regelnStatus: asLeserFeedbackStatus(row.regelnStatus),
    vernachlaessigtesBeduerfnisStatus: asLeserFeedbackStatus(
      row.vernachlaessigtesBeduerfnisStatus,
    ),
    erfuelltesBeduerfnisStatus: asLeserFeedbackStatus(
      row.erfuelltesBeduerfnisStatus,
    ),
    checkDetail: String(row.checkDetail ?? "").trim().slice(0, 4_000),
    vorschlaege,
    aenderungsPrompts: prompts,
    genreVergleich: String(row.genreVergleich ?? "").trim().slice(0, 2_000),
    appliedAt: (() => {
      const a = String(row.appliedAt ?? "").trim();
      return a || null;
    })(),
  };
}

/** Stages that support Leser-Feedback collect + apply. */
export const LESER_FEEDBACK_STAGES = [
  "idee",
  "expose",
  "szenenplot",
  "manuskript",
] as const;

export type LeserFeedbackStage = (typeof LESER_FEEDBACK_STAGES)[number];

export function isLeserFeedbackStage(
  value: string,
): value is LeserFeedbackStage {
  return (LESER_FEEDBACK_STAGES as readonly string[]).includes(value);
}

/** Tolerant parse of per-stage Leser-Feedback map. */
export function parseRomanLeserFeedbackByStage(
  raw: unknown,
): Record<string, RomanLeserFeedback> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, RomanLeserFeedback> = {};
  for (const [stage, value] of Object.entries(raw as Record<string, unknown>)) {
    const fb = parseRomanLeserFeedback(value);
    if (fb) out[stage] = fb;
  }
  return out;
}

/**
 * Resolve feedback for a stage (legacy `leserFeedback` = manuskript).
 */
export function leserFeedbackForStage(
  editorial: RomanEditorial,
  stage: string,
): RomanLeserFeedback | null {
  const fromMap = editorial.leserFeedbackByStage?.[stage] ?? null;
  if (fromMap) return fromMap;
  if (stage === "manuskript") return editorial.leserFeedback ?? null;
  return null;
}

/** Persist feedback for a stage; keeps legacy `leserFeedback` in sync for manuskript. */
export function withLeserFeedbackForStage(
  editorial: RomanEditorial,
  stage: string,
  feedback: RomanLeserFeedback | null,
): RomanEditorial {
  const nextMap = { ...(editorial.leserFeedbackByStage ?? {}) };
  if (feedback) nextMap[stage] = feedback;
  else delete nextMap[stage];
  return {
    ...editorial,
    leserFeedbackByStage: nextMap,
    leserFeedback:
      stage === "manuskript"
        ? feedback
        : editorial.leserFeedback,
  };
}

export function parseAenderungsPrompts(
  raw: unknown,
): RomanAenderungsPrompt[] {
  if (!Array.isArray(raw)) return [];
  const out: RomanAenderungsPrompt[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const anweisung = String(
      o.anweisung ?? o.prompt ?? o.text ?? o.auftrag ?? "",
    ).trim();
    if (anweisung.length < 12) continue;
    const titel = String(o.titel ?? o.title ?? o.name ?? "")
      .trim()
      .slice(0, 120) || anweisung.slice(0, 60);
    const scopeRaw = String(o.scope ?? o.umfang ?? "")
      .trim()
      .toLowerCase();
    const kapitelFromArr = Array.isArray(o.kapitel)
      ? o.kapitel
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n > 0 && n <= 40)
          .map((n) => Math.round(n))
      : [];
    const kapitelFromText = extractChapterNumbersFromStelleText(
      `${String(o.stelle ?? "")} ${anweisung} ${titel}`,
    );
    const kapitel = [
      ...new Set([...kapitelFromArr, ...kapitelFromText]),
    ].sort((a, b) => a - b);
    const bookWideHint =
      scopeRaw === "buchweit" ||
      scopeRaw === "global" ||
      LESER_FEEDBACK_BOOK_WIDE_RE.test(`${scopeRaw} ${titel} ${anweisung}`);
    const scope: "lokal" | "buchweit" =
      bookWideHint || kapitel.length === 0 ? "buchweit" : "lokal";
    const wichtigkeit = asKritikWichtigkeit(
      o.wichtigkeit ?? o.severity ?? o.priority ?? o.prio,
    );
    const entscheidungFrage = String(
      o.entscheidungFrage ?? o.entscheidung_frage ?? o.frage ?? "",
    )
      .trim()
      .slice(0, 800);
    const entscheidungFlag = o.entscheidungNoetig ?? o.entscheidung_noetig;
    const entscheidungNoetig =
      entscheidungFlag === true ||
      entscheidungFlag === "true" ||
      entscheidungFlag === 1 ||
      entscheidungFrage.length >= 8;
    const prompt: RomanAenderungsPrompt = {
      titel,
      scope,
      kapitel: scope === "buchweit" ? [] : kapitel,
      anweisung: anweisung.slice(0, 4_000),
      wichtigkeit,
    };
    if (entscheidungNoetig || aenderungsPromptNeedsAuthorDecision(prompt)) {
      prompt.entscheidungNoetig = true;
      prompt.entscheidungFrage =
        entscheidungFrage ||
        "Welche Variante soll verbindlich gelten? (kurz und klar)";
    }
    out.push(prompt);
    if (out.length >= 3) break;
  }
  return sortAenderungsPrompts(out).slice(0, 3);
}

function vorschlaegeToAenderungsPrompts(
  vorschlaege: Array<{ text: string; stelle: string }>,
): RomanAenderungsPrompt[] {
  return vorschlaege.map((v, i) => {
    const chapters = extractChapterNumbersFromStelleText(
      `${v.stelle}\n${v.text}`,
    );
    const bookWide =
      LESER_FEEDBACK_BOOK_WIDE_RE.test(`${v.stelle}\n${v.text}`) ||
      chapters.length === 0;
    return {
      titel: v.stelle.trim() || `Auftrag ${i + 1}`,
      scope: bookWide ? ("buchweit" as const) : ("lokal" as const),
      kapitel: bookWide ? [] : chapters,
      anweisung: v.text,
      wichtigkeit: "wichtig" as const,
    };
  });
}

/**
 * Make dialog prose readable: keep existing paragraphs, otherwise
 * insert blank lines roughly every two sentences.
 */
export function formatDialogProsa(text: string): string {
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return "";
  const newlineCount = (trimmed.match(/\n/g) ?? []).length;
  if (/\n\s*\n/.test(trimmed) || newlineCount >= 2) {
    return trimmed.replace(/\n{3,}/g, "\n\n");
  }
  const singleLine = trimmed.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  const sentences =
    singleLine.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g)?.map((s) => s.trim()) ??
    [singleLine];
  if (sentences.length <= 2) {
    return sentences.join(" ");
  }
  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    paragraphs.push(sentences.slice(i, i + 2).join(" "));
  }
  return paragraphs.join("\n\n");
}

/** True when raw looks like a single plan (legacy stage → plan shape). */
function looksLikeReifegradImprovePlan(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const row = raw as Record<string, unknown>;
  return (
    typeof row.kritik === "string" ||
    typeof row.critique === "string" ||
    Array.isArray(row.aenderungsPrompts) ||
    typeof row.patchBrief === "string"
  );
}

/** Reserved dimension key for stage-wide Verbessern plans in {@link RomanEditorial.stageImprove}. */
export const STAGE_VERBESSERN_DIMENSION = "verbessern";

/** Stored Verbessern plan for one pipeline stage (or null). */
export function stageImproveForStage(
  editorial: RomanEditorial | null | undefined,
  stage: string,
): RomanReifegradImprovePlan | null {
  const plan = editorial?.stageImprove?.[stage] ?? null;
  return plan ?? null;
}

/** Set or clear the Verbessern plan for one stage. */
export function withStageImprove(
  editorial: RomanEditorial,
  stage: string,
  plan: RomanReifegradImprovePlan | null,
): RomanEditorial {
  const nextMap = { ...(editorial.stageImprove ?? {}) };
  if (!plan) {
    delete nextMap[stage];
  } else {
    nextMap[stage] = plan;
  }
  return { ...editorial, stageImprove: nextMap };
}

/** Tolerant parse of stage Verbessern plans keyed by PipelineStage. */
export function parseRomanStageImproveMap(
  raw: unknown,
): Record<string, RomanReifegradImprovePlan> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, RomanReifegradImprovePlan> = {};
  for (const [stage, value] of Object.entries(raw as Record<string, unknown>)) {
    const plan = parseRomanReifegradImprovePlan(value, stage);
    if (!plan) continue;
    out[stage] = {
      ...plan,
      stage,
      dimension: plan.dimension.trim() || STAGE_VERBESSERN_DIMENSION,
      dimensionLabel: plan.dimensionLabel.trim() || "Gesamt",
    };
  }
  return out;
}

/** Plans for one stage, keyed by dimension. */
export function reifegradImprovePlansForStage(
  improve: Record<string, Record<string, RomanReifegradImprovePlan>> | null | undefined,
  stage: string,
): Record<string, RomanReifegradImprovePlan> {
  const bucket = improve?.[stage];
  if (!bucket || typeof bucket !== "object") return {};
  return { ...bucket };
}

/** Upsert one dimension plan without clearing siblings. */
export function upsertReifegradImprovePlan(
  improve: Record<string, Record<string, RomanReifegradImprovePlan>> | null | undefined,
  stage: string,
  plan: RomanReifegradImprovePlan,
): Record<string, Record<string, RomanReifegradImprovePlan>> {
  const dim = plan.dimension.trim();
  if (!dim) return { ...(improve ?? {}) };
  const prev = reifegradImprovePlansForStage(improve, stage);
  return {
    ...(improve ?? {}),
    [stage]: {
      ...prev,
      [dim]: plan,
    },
  };
}

/**
 * After Einarbeiten: keep only the applied plan (with appliedAt); drop siblings
 * so stale open analyses are not compared against a changed artifact.
 */
export function replaceReifegradImproveStageWithApplied(
  improve: Record<string, Record<string, RomanReifegradImprovePlan>> | null | undefined,
  stage: string,
  appliedPlan: RomanReifegradImprovePlan,
): Record<string, Record<string, RomanReifegradImprovePlan>> {
  const dim = appliedPlan.dimension.trim();
  if (!dim) {
    const next = { ...(improve ?? {}) };
    delete next[stage];
    return next;
  }
  return {
    ...(improve ?? {}),
    [stage]: { [dim]: appliedPlan },
  };
}

/** Remove one dimension plan; leave sibling plans on the same stage. */
export function discardReifegradImprovePlan(
  improve: Record<string, Record<string, RomanReifegradImprovePlan>> | null | undefined,
  stage: string,
  dimension: string,
): Record<string, Record<string, RomanReifegradImprovePlan>> {
  const dim = dimension.trim();
  const next = { ...(improve ?? {}) };
  if (!dim) return next;
  const prev = reifegradImprovePlansForStage(improve, stage);
  if (!(dim in prev)) return next;
  const { [dim]: _removed, ...rest } = prev;
  if (Object.keys(rest).length === 0) {
    delete next[stage];
    return next;
  }
  return { ...next, [stage]: rest };
}

/** Tolerant parse of pending Reifegrad-improve plans keyed by stage → dimension. */
export function parseRomanReifegradImproveMap(
  raw: unknown,
): Record<string, Record<string, RomanReifegradImprovePlan>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, Record<string, RomanReifegradImprovePlan>> = {};
  for (const [stage, value] of Object.entries(raw as Record<string, unknown>)) {
    if (looksLikeReifegradImprovePlan(value)) {
      const plan = parseRomanReifegradImprovePlan(value, stage);
      if (plan?.dimension) {
        out[stage] = { [plan.dimension]: plan };
      }
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const byDim: Record<string, RomanReifegradImprovePlan> = {};
    for (const [dimKey, planRaw] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const plan = parseRomanReifegradImprovePlan(planRaw, stage);
      if (!plan) continue;
      const dim = plan.dimension.trim() || dimKey.trim();
      if (!dim) continue;
      byDim[dim] = { ...plan, dimension: dim };
    }
    if (Object.keys(byDim).length > 0) out[stage] = byDim;
  }
  return out;
}

export function parseRomanReifegradImprovePlan(
  raw: unknown,
  fallbackStage = "",
): RomanReifegradImprovePlan | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  let kritik = String(row.kritik ?? row.critique ?? row.gesamt ?? "").trim();
  let prompts = parseAenderungsPrompts(row.aenderungsPrompts);
  if (prompts.length === 0) {
    const brief = String(row.patchBrief ?? "").trim();
    if (brief.length >= 20) {
      prompts = [
        {
          titel: "Nacharbeit",
          scope: "buchweit",
          kapitel: [],
          anweisung: brief.slice(0, 4_000),
          wichtigkeit: "wichtig",
        },
      ];
    }
  }
  // Empty prompts + short/empty kritik is a valid „nichts mehr nötig“ plan.
  if (!kritik) {
    kritik =
      prompts.length === 0
        ? "Keine Pflichtpunkte mehr — diese Dimension wirkt in Ordnung."
        : onlyNiceToHavePrompts(prompts)
          ? "Nur noch Nice-to-have — keine harten Pflichtpunkte."
          : "Kurzanalyse.";
  }
  const dimension = String(row.dimension ?? "").trim();
  const dimensionLabel =
    String(row.dimensionLabel ?? "").trim() || dimension || "Dimension";
  return {
    createdAt:
      String(row.createdAt ?? "").trim() || new Date().toISOString(),
    stage: String(row.stage ?? fallbackStage).trim() || fallbackStage,
    dimension,
    dimensionLabel: dimensionLabel.slice(0, 80),
    modelLabel: String(row.modelLabel ?? "").trim().slice(0, 120),
    kritik: kritik.slice(0, 8_000),
    aenderungsPrompts: prompts,
    appliedAt: (() => {
      const a = String(row.appliedAt ?? "").trim();
      return a || null;
    })(),
  };
}

/**
 * Patch brief for Co-Autor from a Reifegrad-improve plan (optionally per chapter).
 * Skips nice_to_have when harder points exist.
 * Optional `autorEntscheidungen` keyed by index in `plan.aenderungsPrompts`.
 */
export function formatReifegradImprovePatchBrief(
  plan: RomanReifegradImprovePlan,
  opts?: {
    chapterNumber?: number;
    autorEntscheidungen?: Record<number, string>;
  },
): string {
  const chapterNumber = opts?.chapterNumber;
  const decisions = opts?.autorEntscheidungen ?? {};
  const prompts = actionableAenderungsPrompts(plan.aenderungsPrompts);
  const bookWide = prompts.filter(
    (p) => p.scope === "buchweit" || p.kapitel.length === 0,
  );
  const localForChapter =
    chapterNumber != null
      ? prompts.filter(
          (p) =>
            p.scope === "lokal" &&
            p.kapitel.length > 0 &&
            p.kapitel.includes(chapterNumber),
        )
      : prompts.filter((p) => p.scope === "lokal");

  function decisionFor(prompt: RomanAenderungsPrompt): string {
    const idx = plan.aenderungsPrompts.indexOf(prompt);
    if (idx < 0) return "";
    return String(decisions[idx] ?? "").trim();
  }

  function pushPrompt(
    lines: string[],
    i: number,
    p: RomanAenderungsPrompt,
  ) {
    lines.push(
      `### ${i + 1}. [${KRITIK_WICHTIGKEIT_LABEL[p.wichtigkeit]}] ${p.titel}`,
    );
    lines.push(p.anweisung);
    const decision = decisionFor(p);
    if (decision) {
      lines.push("");
      lines.push("#### Autor-Entscheidung (verbindlich)");
      lines.push(decision);
      lines.push(
        "Setze NUR diese Variante um — keine Alternativ-Zweige offen lassen.",
      );
    }
    lines.push("");
  }

  const lines = [
    `ARBEITSAUFTRAG — Reifegrad-Dimension „${plan.dimensionLabel}“:`,
    "Setze die folgenden Änderungsanweisungen SICHTBAR um. Nur diese Dimension.",
    "Keine Meta-Kommentare. Handlung behalten. Kein Nice-to-have / Kosmetik.",
    chapterNumber != null
      ? `Du bearbeitest NUR Kapitel ${chapterNumber}.`
      : "",
    "",
  ];
  if (bookWide.length > 0) {
    lines.push("## Buchweite / Gesamt-Artefakt");
    for (const [i, p] of bookWide.entries()) {
      pushPrompt(lines, i, p);
    }
  }
  if (localForChapter.length > 0) {
    lines.push(
      chapterNumber != null
        ? `## Nur Kapitel ${chapterNumber}`
        : "## Lokal",
    );
    for (const [i, p] of localForChapter.entries()) {
      pushPrompt(lines, i, p);
    }
  }
  lines.push("Mindestens eine klar erkennbare Änderung laut den Anweisungen.");
  return lines.filter(Boolean).join("\n").slice(0, 8_000);
}

/** Validate that every decision-needed actionable prompt has an author answer. */
export function missingAutorEntscheidungen(
  prompts: RomanAenderungsPrompt[],
  autorEntscheidungen?: Record<number, string> | null,
): string[] {
  const decisions = autorEntscheidungen ?? {};
  const missing: string[] = [];
  for (const { index, prompt } of aenderungsPromptsNeedingDecision(prompts)) {
    if (String(decisions[index] ?? "").trim().length < 8) {
      missing.push(prompt.titel || `Auftrag ${index + 1}`);
    }
  }
  return missing;
}

/** Chapters to patch from a Reifegrad-improve plan (manuskript / szenenplot). */
export function resolveReifegradImproveChapters(
  chapterDocText: string,
  plan: RomanReifegradImprovePlan,
): {
  chapterNumbers: number[];
  bookWide: boolean;
  localChapters: number[];
} {
  const available = parsePlotChapters(chapterDocText)
    .map((c) => c.number)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const availableSet = new Set(available);
  const prompts = actionableAenderungsPrompts(plan.aenderungsPrompts);
  const bookWide = prompts.some(
    (p) => p.scope === "buchweit" || p.kapitel.length === 0,
  );
  const localChapters = [
    ...new Set(prompts.flatMap((p) => p.kapitel)),
  ]
    .filter((n) => availableSet.has(n))
    .sort((a, b) => a - b);
  if (bookWide) {
    return { chapterNumbers: available, bookWide: true, localChapters };
  }
  return {
    chapterNumbers: localChapters,
    bookWide: false,
    localChapters,
  };
}

function asStringList(raw: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => String(x ?? "").trim())
    .filter((s) => s.length >= 2)
    .slice(0, maxItems)
    .map((s) => s.slice(0, maxLen));
}

function asCanonClockUnit(raw: unknown): RomanCanonClockUnit {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "hh:mm" || s === "hmm" || s === "hours") return "hh:mm";
  if (s === "relative" || s === "rel") return "relative";
  return "mm:ss";
}

function asCanonMonotonic(raw: unknown): RomanCanonMonotonic {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "rising" || s === "steigend" || s === "up") return "rising";
  if (s === "none" || s === "frei" || s === "any") return "none";
  return "falling";
}

function asCanonThreadStatus(raw: unknown): RomanCanonThread["status"] {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "resolved" || s === "geloest" || s === "gelöst") return "resolved";
  if (s === "dormant" || s === "ruhend") return "dormant";
  return "open";
}

/** Tolerant parse of book-wide logic canon. */
export function parseRomanCanon(raw: unknown): RomanCanon | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const clocksRaw = Array.isArray(row.clocks) ? row.clocks : [];
  const clocks: RomanCanonClock[] = [];
  for (const item of clocksRaw.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const id = String(c.id ?? "")
      .trim()
      .slice(0, 64);
    const label = String(c.label ?? "").trim().slice(0, 120);
    if (!id && !label) continue;
    const clockId =
      id ||
      label
        .toLowerCase()
        .replace(/[^a-z0-9äöüß]+/gi, "_")
        .slice(0, 40) ||
      `clock_${clocks.length + 1}`;
    clocks.push({
      id: clockId,
      label: label || clockId,
      source: String(c.source ?? "").trim().slice(0, 200) || "unbekannt",
      unit: asCanonClockUnit(c.unit),
      monotonic: asCanonMonotonic(c.monotonic),
      tStart: String(c.tStart ?? "").trim().slice(0, 32) || undefined,
      tEnd: String(c.tEnd ?? "").trim().slice(0, 32) || undefined,
    });
  }

  const threads: RomanCanonThread[] = [];
  const threadsRaw = Array.isArray(row.threads) ? row.threads : [];
  for (const item of threadsRaw.slice(0, 16)) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    const id = String(t.id ?? "").trim().slice(0, 64);
    const label = String(t.label ?? "").trim().slice(0, 160);
    if (!id && !label) continue;
    const threadId =
      id ||
      label
        .toLowerCase()
        .replace(/[^a-z0-9äöüß]+/gi, "_")
        .slice(0, 40) ||
      `thread_${threads.length + 1}`;
    const lastK = Number(t.lastKapitel);
    threads.push({
      id: threadId,
      label: label || threadId,
      status: asCanonThreadStatus(t.status),
      lastKapitel:
        Number.isFinite(lastK) && lastK > 0
          ? Math.min(40, Math.round(lastK))
          : undefined,
      notes: String(t.notes ?? "").trim().slice(0, 400) || undefined,
    });
  }

  const perChapter: RomanCanonChapterBeat[] = [];
  const beatsRaw = Array.isArray(row.perChapter) ? row.perChapter : [];
  for (const item of beatsRaw.slice(0, 40)) {
    if (!item || typeof item !== "object") continue;
    const b = item as Record<string, unknown>;
    const kap = Number(b.kapitel ?? b.chapter ?? b.n);
    if (!Number.isFinite(kap) || kap < 1) continue;
    const clocksMap: Record<string, string> = {};
    const clocksObj = b.clocks;
    if (clocksObj && typeof clocksObj === "object" && !Array.isArray(clocksObj)) {
      for (const [k, v] of Object.entries(
        clocksObj as Record<string, unknown>,
      )) {
        const key = String(k).trim().slice(0, 64);
        const val = String(v ?? "").trim().slice(0, 64);
        if (key && val) clocksMap[key] = val;
      }
    }
    perChapter.push({
      kapitel: Math.min(40, Math.round(kap)),
      clocks: Object.keys(clocksMap).length > 0 ? clocksMap : undefined,
      facts: asStringList(b.facts, 8, 240),
      threadsActive: asStringList(b.threadsActive, 8, 64),
    });
  }
  perChapter.sort((a, b) => a.kapitel - b.kapitel);

  const pendingInvariants: RomanCanonPendingInvariant[] = [];
  const invRaw = Array.isArray(row.pendingInvariants)
    ? row.pendingInvariants
    : [];
  for (const item of invRaw.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const titel = String(p.titel ?? p.title ?? "").trim().slice(0, 120);
    const anweisung = String(p.anweisung ?? p.text ?? "")
      .trim()
      .slice(0, 2_000);
    if (anweisung.length < 8) continue;
    pendingInvariants.push({
      titel: titel || "Invariante",
      anweisung,
      source: String(p.source ?? "other").trim().slice(0, 64) || "other",
    });
  }

  const hardFacts = asStringList(row.hardFacts, 20, 240);
  if (
    clocks.length === 0 &&
    threads.length === 0 &&
    perChapter.length === 0 &&
    hardFacts.length === 0 &&
    pendingInvariants.length === 0
  ) {
    return null;
  }

  const lastPlanRaw =
    row.lastPlan && typeof row.lastPlan === "object"
      ? (row.lastPlan as Record<string, unknown>)
      : null;
  const lastPlan: RomanCanonLastPlan | null = lastPlanRaw
    ? {
        at:
          String(lastPlanRaw.at ?? "").trim() || new Date().toISOString(),
        summary: String(lastPlanRaw.summary ?? "").trim().slice(0, 800),
        modelLabel: String(lastPlanRaw.modelLabel ?? "").trim().slice(0, 120),
        violations: asStringList(lastPlanRaw.violations, 20, 240),
        appliedAt: (() => {
          const a = String(lastPlanRaw.appliedAt ?? "").trim();
          return a || null;
        })(),
      }
    : null;

  return {
    updatedAt:
      String(row.updatedAt ?? "").trim() || new Date().toISOString(),
    clocks,
    threads,
    hardFacts,
    perChapter,
    pendingInvariants,
    lastPlan,
  };
}

/** Tolerant parse of Manuskript continuity memory. */
export function parseRomanStoryState(raw: unknown): RomanStoryState | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const afterChapter = Number(row.afterChapter);
  if (!Number.isFinite(afterChapter) || afterChapter < 0) return null;
  const hardFacts = asStringList(row.hardFacts, 16, 240);
  const openThreads = asStringList(row.openThreads, 12, 240);
  // Require at least a little signal so empty junk objects don't stick.
  if (
    hardFacts.length === 0 &&
    openThreads.length === 0 &&
    !String(row.location ?? "").trim() &&
    asStringList(row.presentCharacters, 12, 80).length === 0
  ) {
    return null;
  }
  return {
    updatedAt:
      String(row.updatedAt ?? "").trim() || new Date().toISOString(),
    afterChapter: Math.min(40, Math.round(afterChapter)),
    location: String(row.location ?? "").trim().slice(0, 200),
    presentCharacters: asStringList(row.presentCharacters, 12, 80),
    openThreads,
    secretsAndKnowledge: asStringList(row.secretsAndKnowledge, 12, 240),
    inventoryAndProps: asStringList(row.inventoryAndProps, 12, 160),
    relationshipNotes: asStringList(row.relationshipNotes, 10, 200),
    hardFacts,
    mood: String(row.mood ?? "").trim().slice(0, 160),
  };
}

/** Prompt block for Co-Autor / context assembly. */
export function formatStoryStateForPrompt(
  state: RomanStoryState | null | undefined,
): string {
  if (!state) return "";
  const lines: string[] = [
    `## Continuity-State (nach Kapitel ${state.afterChapter})`,
  ];
  if (state.location) lines.push(`Ort/Setting: ${state.location}`);
  if (state.presentCharacters.length) {
    lines.push(`Anwesend: ${state.presentCharacters.join(", ")}`);
  }
  if (state.mood) lines.push(`Stimmung: ${state.mood}`);
  if (state.hardFacts.length) {
    lines.push("Harte Fakten (nicht widersprechen):");
    for (const f of state.hardFacts) lines.push(`- ${f}`);
  }
  if (state.openThreads.length) {
    lines.push("Offene Fäden:");
    for (const t of state.openThreads) lines.push(`- ${t}`);
  }
  if (state.secretsAndKnowledge.length) {
    lines.push("Wissen/Geheimnisse:");
    for (const s of state.secretsAndKnowledge) lines.push(`- ${s}`);
  }
  if (state.inventoryAndProps.length) {
    lines.push("Gegenstände/Props:");
    for (const i of state.inventoryAndProps) lines.push(`- ${i}`);
  }
  if (state.relationshipNotes.length) {
    lines.push("Beziehungen:");
    for (const r of state.relationshipNotes) lines.push(`- ${r}`);
  }
  return lines.join("\n");
}

/**
 * Compact patch brief from stored Testleser feedback for Co-Autor einarbeiten.
 * Prefer `aenderungsPrompts` (clear instructions); fall back to legacy Vorschläge.
 * Spec (`expose`): artifact-level brief; Kapitelgerüst/Manuskript: chapter briefs.
 * Optional `autorEntscheidungen` keyed by index in `feedback.aenderungsPrompts`.
 */
export function formatLeserFeedbackPatchBrief(
  feedback: RomanLeserFeedback,
  opts?: {
    chapterNumber?: number;
    stage?: LeserFeedbackStage;
    autorEntscheidungen?: Record<number, string>;
  },
): string {
  const sourcePrompts =
    feedback.aenderungsPrompts.length > 0
      ? feedback.aenderungsPrompts
      : vorschlaegeToAenderungsPrompts(feedback.vorschlaege);
  const actionable = actionableAenderungsPrompts(sourcePrompts);
  const decisions = opts?.autorEntscheidungen ?? {};
  const filteredFeedback: RomanLeserFeedback = {
    ...feedback,
    aenderungsPrompts: actionable,
    vorschlaege: [],
  };
  const plan = classifyLeserFeedbackVorschlaege(filteredFeedback);
  const stage = opts?.stage ?? "manuskript";
  const wichtigkeitByTitel = new Map(
    actionable.map((p) => [p.titel, p.wichtigkeit] as const),
  );

  function decisionSuffix(titel: string, text: string): string {
    let idx = sourcePrompts.findIndex((p) => p.anweisung === text);
    if (idx < 0 && titel) {
      idx = sourcePrompts.findIndex((p) => p.titel === titel);
    }
    if (idx < 0) return "";
    const decision = String(decisions[idx] ?? "").trim();
    if (!decision) return "";
    return [
      "",
      "#### Autor-Entscheidung (verbindlich)",
      decision,
      "Setze NUR diese Variante um — keine Alternativ-Zweige offen lassen.",
    ].join("\n");
  }

  if (stage === "expose" || stage === "idee") {
    const lines = [
      stage === "idee"
        ? "ARBEITSAUFTRAG: Setze die folgenden Änderungsanweisungen SICHTBAR in der Ideendokumentation um."
        : "ARBEITSAUFTRAG: Setze die folgenden Änderungsanweisungen SICHTBAR im Spec-Artefakt um (Figuren / Welt / Exposé — je nach deiner Rolle).",
      "Konkrete Inhalte ändern — kein kosmetisches Umformulieren / Nice-to-have.",
      stage === "idee"
        ? "Keine Meta-Kommentare. Keine Kapitel-/Szenenpläne. Tragfähige Prämissen behalten."
        : "Keine Meta-Kommentare. Tragfähige Prämissen behalten.",
      "",
      "## Anweisungen",
    ];
    for (const [i, v] of plan.entries()) {
      const w =
        wichtigkeitByTitel.get(v.titel ?? "") ??
        ("wichtig" as RomanKritikWichtigkeit);
      lines.push(
        `### ${i + 1}. [${KRITIK_WICHTIGKEIT_LABEL[w]}] ${v.titel || v.stelle || "Auftrag"}`,
      );
      lines.push(v.text);
      const suffix = decisionSuffix(v.titel || "", v.text);
      if (suffix) lines.push(suffix);
      lines.push("");
    }
    lines.push(
      "Mindestens eine klar erkennbare Änderung laut den Anweisungen oben.",
    );
    return lines
      .filter((l) => l !== undefined && l !== "")
      .join("\n")
      .slice(0, 8_000);
  }

  const chapterNumber = opts?.chapterNumber;
  const bookWide = plan.filter((p) => p.bookWide);
  const localForChapter =
    chapterNumber != null
      ? plan.filter(
          (p) => !p.bookWide && p.chapters.includes(chapterNumber),
        )
      : plan.filter((p) => !p.bookWide);

  const unit =
    stage === "szenenplot" ? "Kapitelgerüst-Kapitel" : "Manuskript-Kapitel";
  const lines = [
    `ARBEITSAUFTRAG: Setze die folgenden Änderungsanweisungen SICHTBAR in DIESEM ${unit} um.`,
    "Konkrete Handlung/Dialog/Beat ändern — kein kosmetisches Umformulieren.",
    "Keine Meta-Kommentare. Keine Kapitel streichen. Handlung behalten.",
    chapterNumber != null
      ? `Du bearbeitest NUR Kapitel ${chapterNumber}. Andere Kapitel nicht anfassen.`
      : "",
    "Wenn Anweisungen Duplikate/Wiederholungen streichen: Kürzen ist erwünscht — Länge darf unter der Baseline liegen; gelöschte Übergangs-Wiederholungen nicht wieder einfügen.",
    "",
  ];

  if (bookWide.length > 0) {
    lines.push("## Buchweite Anweisungen (in DIESEM Kapitel anwenden)");
    for (const [i, v] of bookWide.entries()) {
      lines.push(`### ${i + 1}. ${v.titel || "Buchweit"}`);
      lines.push(v.text);
      const suffix = decisionSuffix(v.titel || "", v.text);
      if (suffix) lines.push(suffix);
      lines.push("");
    }
  }

  if (localForChapter.length > 0) {
    lines.push(
      chapterNumber != null
        ? `## Anweisungen nur für Kapitel ${chapterNumber}`
        : "## Kapitelbezogene Anweisungen",
    );
    for (const [i, v] of localForChapter.entries()) {
      lines.push(`### ${i + 1}. ${v.titel || v.stelle || "Lokal"}`);
      lines.push(v.text);
      if (chapterNumber != null) {
        const focus = leserFeedbackChapterRoleHint(chapterNumber, v.text);
        if (focus) lines.push(focus);
      }
      const suffix = decisionSuffix(v.titel || "", v.text);
      if (suffix) lines.push(suffix);
      lines.push("");
    }
  } else if (bookWide.length === 0 && chapterNumber != null) {
    lines.push(
      `(Keine Anweisung für Kap. ${chapterNumber} — Kapitel sollte nicht gepatcht werden.)`,
    );
  }

  lines.push(
    "Wenn das Buch schon lang genug ist: umformulieren und verdichten — nicht sinnlos aufblasen.",
    "Mindestens eine klar erkennbare Änderung laut den Anweisungen oben.",
  );
  return lines
    .filter((l) => l !== undefined && l !== "")
    .join("\n")
    .slice(0, 8_000);
}

/**
 * When a multi-chapter Auftrag names a seam/Duplikat, tell THIS chapter its role
 * so Kap. N-1 is not asked to "fix Kap. N" and Kap. N gets a hard anti-repeat.
 */
function leserFeedbackChapterRoleHint(
  chapterNumber: number,
  anweisung: string,
): string {
  const text = anweisung.trim();
  if (!text) return "";
  const seam =
    /dopplung|wiederhol|erneut\s+erzähl|nahezu\s+identisch|am\s+beginn|ersten\s+absätze|organisch\s+(?:dort\s+)?ansetzen|übergang/i.test(
      text,
    );
  if (!seam) return "";

  const mentioned = extractChapterNumbersFromStelleText(text);
  const startOf = [
    ...text.matchAll(
      /(?:beginn|anfang|start)(?:\s+von)?\s+kapitel\s+(\d+)/gi,
    ),
  ].map((m) => Number(m[1]));
  const primaryStart = startOf.find((n) => Number.isFinite(n) && n > 0);

  if (primaryStart === chapterNumber) {
    return `Rolle für Kapitel ${chapterNumber}: doppelten/überlappenden Anfang STREICHEN. Vorgänger-Ende nicht erneut spielen — direkt danach organisch ansetzen.`;
  }
  if (
    primaryStart != null &&
    primaryStart === chapterNumber + 1
  ) {
    return `Rolle für Kapitel ${chapterNumber}: Ende stabil lassen (kein Vorwegnehmen von Kap. ${primaryStart}). Keine Szenen/Dialoge erzeugen, die Kap. ${primaryStart} erneut erzählen müsste.`;
  }
  if (
    mentioned.includes(chapterNumber) &&
    mentioned.some((n) => n === chapterNumber + 1)
  ) {
    return `Rolle für Kapitel ${chapterNumber}: Naht zum Nachfolger sauber halten — keine Überlappung mit dem folgenden Kapitel erzeugen oder belassen.`;
  }
  if (
    mentioned.includes(chapterNumber) &&
    mentioned.some((n) => n === chapterNumber - 1)
  ) {
    return `Rolle für Kapitel ${chapterNumber}: Überlappung mit dem Vorgänger am Anfang entfernen; nicht erneut denselben Beat erzählen.`;
  }
  return "";
}

const LESER_FEEDBACK_BOOK_WIDE_RE =
  /\bbuchweit\b|\büberall\b|\bdurchgehend\b|\balle\s+kapitel\b|\bin\s+jedem\s+kapitel\b|\bgesamte[nm]?\s+(?:roman|buch|manuskript)\b|\büber\s+(?:alle|mehrere)\s+kapitel/i;

/** Extract Kap. N / ranges from free text (Stellen + Vorschlagstext). */
export function extractChapterNumbersFromStelleText(text: string): number[] {
  const found = new Set<number>();
  const blob = text ?? "";
  for (const m of blob.matchAll(
    /(?:kap(?:itel)?\.?\s*)(\d{1,2})\s*[-–—]\s*(\d{1,2})/gi,
  )) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    for (let n = lo; n <= hi && n <= 40; n += 1) {
      if (n > 0) found.add(n);
    }
  }
  for (const m of blob.matchAll(
    /(?:kap(?:itel)?\.?\s*|kapitel\s+)(\d{1,2})\b/gi,
  )) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0 && n <= 40) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}

export type LeserFeedbackVorschlagPlan = {
  text: string;
  stelle: string;
  titel?: string;
  chapters: number[];
  bookWide: boolean;
};

/** Classify actionable prompts (preferred) or legacy Vorschläge. */
export function classifyLeserFeedbackVorschlaege(
  feedback: RomanLeserFeedback,
): LeserFeedbackVorschlagPlan[] {
  const prompts =
    feedback.aenderungsPrompts?.length > 0
      ? feedback.aenderungsPrompts
      : vorschlaegeToAenderungsPrompts(feedback.vorschlaege);

  return prompts.map((p) => ({
    text: p.anweisung,
    stelle:
      p.scope === "buchweit"
        ? "buchweit"
        : p.kapitel.map((n) => `Kap. ${n}`).join(", "),
    titel: p.titel,
    chapters: p.kapitel,
    bookWide: p.scope === "buchweit" || p.kapitel.length === 0,
  }));
}

/**
 * Chapters to patch for Feedback einarbeiten:
 * - local Stellen → exactly those chapters
 * - any book-wide item → all manuscript chapters (batched by caller if needed)
 * No random sample fill.
 */
export function resolveLeserFeedbackApplyChapters(
  manuskriptText: string,
  feedback: RomanLeserFeedback,
): {
  chapterNumbers: number[];
  bookWide: boolean;
  localChapters: number[];
  items: LeserFeedbackVorschlagPlan[];
} {
  const available = parsePlotChapters(manuskriptText)
    .map((c) => c.number)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const availableSet = new Set(available);
  const items = classifyLeserFeedbackVorschlaege(feedback);
  const bookWide = items.some((i) => i.bookWide);
  const localChapters = [
    ...new Set(items.flatMap((i) => i.chapters)),
  ]
    .filter((n) => availableSet.has(n))
    .sort((a, b) => a - b);

  if (bookWide) {
    return {
      chapterNumbers: available,
      bookWide: true,
      localChapters,
      items,
    };
  }

  return {
    chapterNumbers: localChapters,
    bookWide: false,
    localChapters,
    items,
  };
}

/** Chapter numbers mentioned in feedback Stellen (Kap. N / Kapitel N). */
export function chapterNumbersFromLeserFeedback(
  feedback: RomanLeserFeedback,
): number[] {
  return [
    ...new Set(
      classifyLeserFeedbackVorschlaege(feedback).flatMap((i) => i.chapters),
    ),
  ].sort((a, b) => a - b);
}

/** Parse DB jsonb → editorial (tolerant). */
export function parseRomanEditorial(raw: unknown): RomanEditorial {
  const base = emptyRomanEditorial();
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Record<string, unknown>;
  const checklistRaw =
    row.checklist && typeof row.checklist === "object"
      ? (row.checklist as Record<string, unknown>)
      : {};
  const harte =
    Array.isArray(row.harteRegeln)
      ? row.harteRegeln.map((x) => String(x).trim()).filter(Boolean)
      : base.harteRegeln;

  return {
    buchTyp: asBuchTyp(row.buchTyp),
    ideeKurz: (() => {
      const v = row.ideeKurz;
      if (typeof v !== "string") return "";
      const t = v.trim();
      if (!t || t === "[object Object]") return "";
      // Heal previously saved raw/broken Ideen-Redakteur JSON wrappers.
      if (/"ideeKurz"\s*:/i.test(t) || t.startsWith("{")) {
        try {
          const start = t.indexOf("{");
          const end = t.lastIndexOf("}");
          const slice =
            start >= 0 && end > start ? t.slice(start, end + 1) : t;
          const obj = JSON.parse(slice) as Record<string, unknown>;
          const inner = String(
            obj.ideeKurz ?? obj.idee_kurz ?? "",
          ).trim();
          if (inner) return inner.slice(0, 50_000);
        } catch {
          const m = t.match(/"ideeKurz"\s*:\s*"([\s\S]*)"\s*\}?\s*$/i);
          if (m?.[1]?.trim()) {
            return m[1]
              .replace(/\\n/g, "\n")
              .replace(/\\"/g, '"')
              .trim()
              .slice(0, 50_000);
          }
        }
      }
      return t;
    })(),
    handlungsArchitektur: String(row.handlungsArchitektur ?? "").trim(),
    weltBibel: String(row.weltBibel ?? "").trim(),
    serienBibel: String(row.serienBibel ?? "").trim(),
    sachbuchStruktur: String(row.sachbuchStruktur ?? "").trim(),
    manuskriptText: String(row.manuskriptText ?? "").trim().slice(0, 500_000),
    manuskriptOriginalText: String(row.manuskriptOriginalText ?? "")
      .trim()
      .slice(0, 500_000),
    manuskriptOriginalSavedAt: (() => {
      const a = String(row.manuskriptOriginalSavedAt ?? "").trim();
      return a || null;
    })(),
    klappentext: String(row.klappentext ?? "").trim().slice(0, 4_000),
    einzeiler: String(row.einzeiler ?? "").trim().slice(0, 120),
    gates: parseGates(row.gates),
    zielAlterMin: asInt(row.zielAlterMin),
    zielAlterMax: asInt(row.zielAlterMax),
    lesestufe: String(row.lesestufe ?? "").trim(),
    zielWortzahlRoman: asInt(row.zielWortzahlRoman),
    zielWortzahlSzeneMin: asInt(row.zielWortzahlSzeneMin) ?? 1800,
    zielWortzahlSzeneMax: asInt(row.zielWortzahlSzeneMax) ?? 2500,
    serieTitel: String(row.serieTitel ?? "").trim(),
    bandNr: asInt(row.bandNr),
    mehrteilerForm: asForm(row.mehrteilerForm),
    mehrteilerNotizen: String(row.mehrteilerNotizen ?? "").trim(),
    mehrteilerBeratung: String(row.mehrteilerBeratung ?? "").trim(),
    grobRegeln: String(row.grobRegeln ?? "").trim(),
    richtungen: normalizeRichtungen(row.richtungen),
    harteRegeln: harte,
    checklist: {
      ideeKlar: Boolean(checklistRaw.ideeKlar),
      fundamentVoll: Boolean(checklistRaw.fundamentVoll),
      regelnHart: Boolean(checklistRaw.regelnHart),
      umfangGesetzt: Boolean(checklistRaw.umfangGesetzt),
      outlineGeprueft: Boolean(checklistRaw.outlineGeprueft),
      roadmapGeprueft: Boolean(checklistRaw.roadmapGeprueft),
      stilStichprobe: Boolean(checklistRaw.stilStichprobe),
      coverOk: Boolean(checklistRaw.coverOk),
      vorsatzOk: Boolean(checklistRaw.vorsatzOk),
      readyToPublish: Boolean(checklistRaw.readyToPublish),
    },
    marktanalyse: parseRomanMarktanalyse(row.marktanalyse),
    leserFeedback: (() => {
      const byStage = parseRomanLeserFeedbackByStage(row.leserFeedbackByStage);
      return (
        byStage.manuskript ??
        parseRomanLeserFeedback(row.leserFeedback)
      );
    })(),
    leserFeedbackByStage: (() => {
      const byStage = parseRomanLeserFeedbackByStage(row.leserFeedbackByStage);
      const legacy = parseRomanLeserFeedback(row.leserFeedback);
      if (legacy && !byStage.manuskript) {
        return { ...byStage, manuskript: legacy };
      }
      return byStage;
    })(),
    reifegradImprove: parseRomanReifegradImproveMap(row.reifegradImprove),
    stageImprove: parseRomanStageImproveMap(row.stageImprove),
    storyState: parseRomanStoryState(row.storyState),
    canon: parseRomanCanon(row.canon),
    szenenplotStructured: parseRomanSzenenplotStructured(
      row.szenenplotStructured,
    ),
    reifegrade: parseRomanReifegrade(row.reifegrade),
    pipelineFertig: parsePipelineFertig(row.pipelineFertig),
  };
}

/** Approximate German word count (whitespace tokens). */
export function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export function formatWordCount(n: number): string {
  return new Intl.NumberFormat("de-DE").format(n);
}

/**
 * MUST block for prompts: book type, structure docs, age, length, series, hard rules.
 */
export function buildEditorialMustBlock(editorial: RomanEditorial): string {
  const lines: string[] = [];
  if (isBuchTypSet(editorial.buchTyp)) {
    lines.push(`Buchtyp (verbindlich): ${BUCHTYP_LABELS[editorial.buchTyp]}`);
  }
  if (editorial.ideeKurz.trim()) {
    lines.push(
      `Idee (Dokumentation aus Ideen-Finder — Mythos/Plot/Ton; Figurennamen darin IGNORIEREN, nur Steckbriefe gelten):\n${editorial.ideeKurz.trim()}`,
    );
  }
  if (editorial.zielAlterMin != null || editorial.zielAlterMax != null) {
    const a =
      editorial.zielAlterMin != null && editorial.zielAlterMax != null
        ? `${editorial.zielAlterMin}–${editorial.zielAlterMax} Jahre`
        : editorial.zielAlterMin != null
          ? `ab ${editorial.zielAlterMin} Jahre`
          : `bis ${editorial.zielAlterMax} Jahre`;
    lines.push(`Zielalter (verbindlich): ${a}`);
  }
  if (editorial.lesestufe.trim()) {
    lines.push(`Lesestufe (verbindlich): ${editorial.lesestufe.trim()}`);
  }
  if (normalizeRichtungen(editorial.richtungen).length) {
    const ids = normalizeRichtungen(editorial.richtungen);
    lines.push(
      `Richtung / Leserversprechen (verbindlich): ${formatRichtungenLabel(ids)}`,
    );
    for (const b of richtungenLeitplanken(ids)) {
      lines.push(`– ${b}`);
    }
  }
  if (editorial.zielWortzahlSzeneMin != null || editorial.zielWortzahlSzeneMax != null) {
    lines.push(
      `Szenenlänge (Ziel): ${editorial.zielWortzahlSzeneMin ?? "?"}–${editorial.zielWortzahlSzeneMax ?? "?"} Wörter.`,
    );
  }
  if (editorial.zielWortzahlRoman != null) {
    lines.push(
      `Roman-Zielumfang: ca. ${formatWordCount(editorial.zielWortzahlRoman)} Wörter gesamt.`,
    );
  }
  if (editorial.serieTitel.trim() || editorial.mehrteilerForm !== "unbekannt") {
    const band =
      editorial.bandNr != null ? ` · Band ${editorial.bandNr}` : "";
    lines.push(
      `Reihe/Mehrteiler: ${editorial.serieTitel.trim() || "ohne Serientitel"} (${editorial.mehrteilerForm})${band}`,
    );
  }
  if (editorial.mehrteilerNotizen.trim()) {
    lines.push(`Mehrteiler-Notizen:\n${editorial.mehrteilerNotizen.trim()}`);
  }
  if (editorial.grobRegeln.trim()) {
    lines.push(`Basis-Regeln (Basics):\n${editorial.grobRegeln.trim()}`);
  }
  // Marktanalyse-Bedürfnisse bewusst nicht als MUSS — Marktanalyse wird überarbeitet.
  if (editorial.marktanalyse?.books?.length) {
    const m = editorial.marktanalyse;
    const bookLines = m.books
      .map((b) => {
        const crit = b.critiquePoints.slice(0, 5).join("; ");
        const str = (b.strengthPoints ?? []).slice(0, 5).join("; ");
        return `– ${b.title} (${b.author}): Kritik: ${crit || "—"}${
          str ? ` | Stärken: ${str}` : ""
        }`;
      })
      .join("\n");
    lines.push(
      `Marktanalyse / Konkurrenz-Kontext (Deutschland; Schwächen vermeiden, Stärken übertreffen ohne zu klonen):\nGenre: ${m.genre} · ${m.zielgruppe}${
        m.topCritiqueThemes.length
          ? `\nÜbergreifende Kritik: ${m.topCritiqueThemes.join("; ")}`
          : ""
      }${
        (m.topStrengthThemes ?? []).length
          ? `\nÜbergreifende Stärken: ${m.topStrengthThemes.join("; ")}`
          : ""
      }\nTitel:\n${bookLines}`,
    );
  }
  if (editorial.harteRegeln.length) {
    lines.push(
      `Harte Verlagsregeln:\n${editorial.harteRegeln.map((r) => `– ${r}`).join("\n")}`,
    );
  }
  if (!lines.length) return "";
  return `## MUSS — Verlag / Buchtyp / Umfang / Zielgruppe (verbindlich)
${lines.join("\n")}

Bei Konflikt mit „literarischer“ Eleganz gewinnen Buchtyp, Zielalter, Umfang und harte Regeln.`;
}

/**
 * Strong MUST lines from market-scan needs — drafts and Gegenlesen must satisfy both.
 */
export function buildMarktanalyseNeedsMustLines(
  scan: RomanMarktanalyse | null | undefined,
): string[] {
  if (!scan) return [];
  const lines: string[] = [];
  const neglected = scan.neglectedNeed?.trim() ?? "";
  const fulfilled = scan.fulfilledNeed?.trim() ?? "";
  if (neglected.length >= 10) {
    lines.push(
      `MUSS — Vernachlässigtes Leserbedürfnis (verbindlich erfüllen; Gegenlese prüft das):\n${neglected}`,
    );
  }
  if (fulfilled.length >= 10) {
    lines.push(
      `MUSS — Erfülltes Leserbedürfnis (verbindlich bedienen — Leser belohnen das; Gegenlese prüft das):\n${fulfilled}`,
    );
  }
  return lines;
}

/** Compact MUST block for Gegenlesen when full editorial MUST is too heavy. */
export function buildMarktanalyseNeedsMustBlock(
  editorial: RomanEditorial,
): string {
  const lines = buildMarktanalyseNeedsMustLines(editorial.marktanalyse);
  if (!lines.length) return "";
  return `## MUSS — Marktanalyse Leserbedürfnisse (verbindlich)
${lines.join("\n")}

Fehlen Erfüllung oder Belohnung dieser Bedürfnisse: Freigabe nicht empfehlen; konkrete Nacharbeit fordern.`;
}

/**
 * User-prompt block for critique / Gegenlesen / Vorschläge:
 * rules + Richtungen (Bedürfnisse temporarily omitted — Marktanalyse rewrite).
 */
export function buildCritiqueRulesAndNeedsBlock(
  editorial: RomanEditorial | null | undefined,
  maxChars = 6_000,
): string {
  if (!editorial) {
    return `## Regel- & Logik-Prüfung (verbindlich)
Keine Editorial-Daten übergeben — prüfe dennoch streng gegen alles, was im Prompt als Regeln steht.`;
  }

  const parts: string[] = [
    "## Regel- & Logik-Prüfung (verbindlich — knallhart)",
  ];

  const richtungIds = normalizeRichtungen(editorial.richtungen);
  if (richtungIds.length) {
    parts.push(
      `Richtung / Leserversprechen: ${formatRichtungenLabel(richtungIds)}`,
    );
    for (const b of richtungenLeitplanken(richtungIds)) {
      parts.push(`– ${b}`);
    }
  }

  const grob = editorial.grobRegeln?.trim() ?? "";
  if (grob) {
    parts.push(`Basis-Regeln:\n${grob.slice(0, 3_500)}`);
  }

  if (editorial.harteRegeln?.length) {
    parts.push(
      `Harte Verlagsregeln:\n${editorial.harteRegeln
        .slice(0, 12)
        .map((r) => `– ${r}`)
        .join("\n")}`,
    );
  }

  parts.push(
    "Prüfauftrag: Bewerte Regeln und innere Logik/Kontinuität knallhart (erfüllt / teilweise / fehlt) und priorisiere Nacharbeit entsprechend. Keine separate Bedürfnis-MUSS-Prüfung.",
  );

  const text = parts.join("\n\n");
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[…]` : text;
}

/** Structure docs as separate MUST (outline / Phase 0 / scenes). */
export function buildStrukturMustBlock(editorial: RomanEditorial): string {
  const parts: string[] = [];
  if (editorial.handlungsArchitektur.trim()) {
    parts.push(
      `## MUSS — Handlungsarchitektur (verbindlich)\n${editorial.handlungsArchitektur.trim()}`,
    );
  }
  if (editorial.weltBibel.trim()) {
    parts.push(`## MUSS — Welt-Bibel (verbindlich)\n${editorial.weltBibel.trim()}`);
  }
  if (editorial.serienBibel.trim()) {
    parts.push(
      `## MUSS — Serien-Bibel (verbindlich)\n${editorial.serienBibel.trim()}`,
    );
  }
  if (editorial.sachbuchStruktur.trim()) {
    parts.push(
      `## MUSS — Sachbuch-Struktur (verbindlich)\n${editorial.sachbuchStruktur.trim()}`,
    );
  }
  if (!parts.length) return "";
  return `${parts.join("\n\n")}

Struktur-Dokumente schlagen Outline-Details bei Konflikt — Kontinuität und These/Dramaturgie bleiben.`;
}

