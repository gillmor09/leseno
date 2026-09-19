/**
 * Stage-specific Reifegrad craft axes (slots A/B/C).
 * No AI imports — safe for model + assess + improve + UI.
 *
 * Storage: stilPct / dramaturgiePct / leseflussPct = slots A / B / C.
 * Core: logik (stored as regelnPct for JSON compat).
 */

import type { PipelineStage } from "@/lib/roman/pipeline/stages";
import type { StageReifegrad } from "@/lib/roman/reifegrad-model";

export const REIFEGRAD_CORE_DIMENSIONS = ["logik"] as const;

/**
 * Wired model for the four dimension „Analysieren“ calls
 * (prompt still from Entwicklungslektor; apply uses Co-Autor).
 */
export const REIFEGRAD_DIMENSION_ANALYZE_MODEL_SLUG = "gemini-3.8-flash";

export type ReifegradCoreDimension =
  (typeof REIFEGRAD_CORE_DIMENSIONS)[number];

export type ReifegradCraftSlot = "a" | "b" | "c";

export type ReifegradCraftKey =
  | "schaerfe"
  | "versprechen"
  | "alleinstellung"
  | "motivation"
  | "konfliktkraft"
  | "altersstimme"
  | "konsistenz"
  | "story_nutzen"
  | "atmosphaere"
  | "figurenkraft"
  | "weltnutzen"
  | "handlungsbogen"
  | "spannungsbogen"
  | "antriebe"
  | "klarheit"
  | "funktion"
  | "abdeckung"
  | "konkretheit"
  | "uebergaenge"
  | "stil"
  | "dramaturgie"
  | "lesefluss";

export type ReifegradDimension = ReifegradCoreDimension | ReifegradCraftKey;

export type ReifegradDimensionDef = {
  key: ReifegradDimension;
  label: string;
  /** Assess + improve focus brief (German, for the model). */
  brief: string;
  /** Short author-facing hover hint (what this axis analyses / improves). */
  hint: string;
  /** Storage slot for craft axes; core dims have none. */
  slot?: ReifegradCraftSlot;
};

export const REIFEGRAD_CORE_DEFS: ReifegradDimensionDef[] = [
  {
    key: "logik",
    label: "Logik",
    hint: "Innere Logik und Kontinuität: Ursache/Wirkung, keine Plotlöcher, keine Widersprüche zu Figuren, Ort oder Fakten.",
    brief: `NUR innere Logik und Kontinuität: Ursache/Wirkung, keine Plotlöcher, keine Widersprüche zu Figuren/Ort/Fakten, glaubwürdige Motivation.
Ignoriere Stil-Feinschliff und Marktanalyse-Bedürfnisse.`,
  },
];

/**
 * Stage-specific craft axes (slots A/B/C → stilPct / dramaturgiePct / leseflussPct).
 */
export const STAGE_CRAFT_DIMENSIONS: Record<
  PipelineStage,
  [ReifegradDimensionDef, ReifegradDimensionDef, ReifegradDimensionDef]
> = {
  idee: [
    {
      key: "schaerfe",
      label: "Schärfe",
      slot: "a",
      hint: "Ist der Ideenkern klar, konkret und greifbar — ohne Wischiwaschi und ohne Kapitel-/Szenenplan?",
      brief: `NUR Schärfe der Idee: Ist der Kern klar, konkret und greifbar — ohne Wischiwaschi und ohne Kapitel-/Szenenplan?
Ignoriere Prosa-Stil, Spec-Details und Plot-Feinschliff. Kapitel gehören nicht in die Idee.`,
    },
    {
      key: "versprechen",
      label: "Versprechen",
      slot: "b",
      hint: "Leseversprechen: Warum die Zielgruppe dieses Buch wollen würde — altersgerecht und prinzipiell einlösbar.",
      brief: `NUR das Leseversprechen (Anziehung): Warum würde die Zielgruppe dieses Buch wollen? Ist es altersgerecht und prinzipiell einlösbar?
Ignoriere Thriller-Pacing, Weltbau-Details und Charakter-Steckbriefe.`,
    },
    {
      key: "alleinstellung",
      label: "Alleinstellung",
      slot: "c",
      hint: "Was die Idee im Genre/Altersband unverwechselbar macht — ohne Novelty um jeden Preis.",
      brief: `NUR Alleinstellung: Was macht diese Idee unverwechselbar im Genre/Altersband — ohne Novelty um jeden Preis?
Solide Genre-Ausführung mit klarer Differenz darf hoch scoren. Ignoriere reine Regel-Checklisten.`,
    },
  ],
  charaktere: [
    {
      key: "motivation",
      label: "Motivation",
      slot: "a",
      hint: "Wollen, brauchen und fürchten die Figuren etwas Greifbares — altersgerecht und glaubwürdig?",
      brief: `NUR Motivation: Wollen, brauchen, fürchten die Figuren etwas Greifbares — altersgerecht und glaubwürdig?
Ignoriere Weltregeln und Plot-Struktur.`,
    },
    {
      key: "konfliktkraft",
      label: "Konfliktkraft",
      slot: "b",
      hint: "Reibung und Gegensätze zwischen Figuren — dramatische Potenziale füreinander.",
      brief: `NUR Konfliktkraft: Erzeugen die Figuren Reibung, Gegensätze, dramatische Potenziale füreinander?
Ignoriere reine Stil-/Registerfragen.`,
    },
    {
      key: "altersstimme",
      label: "Altersstimme",
      slot: "c",
      hint: "Sprache, Innenleben und Komplexität der Portraits passend zur Altersklasse.",
      brief: `NUR Altersstimme: Sprache, Innenleben und Komplexität der Portraits passen zur Altersklasse.
Ignoriere Marktbedürfnisse, außer sie stecken in der Stimme.`,
    },
  ],
  welt: [
    {
      key: "konsistenz",
      label: "Konsistenz",
      slot: "a",
      hint: "Schauplätze und Weltregeln widersprechen sich nicht; die Weltlogik hält.",
      brief: `NUR Konsistenz: Schauplätze und Weltregeln widersprechen sich nicht; Logik hält.
Ignoriere Charakterpsychologie und Prosa-Rhythmus.`,
    },
    {
      key: "story_nutzen",
      label: "Story-Nutzen",
      slot: "b",
      hint: "Ermöglicht oder erschwert die Welt konkrete Konflikte und Szenen — oder ist nur Dekoration?",
      brief: `NUR Story-Nutzen: Ermöglicht/erschwert die Welt konkrete Konflikte und Szenen — oder ist Dekoration?
Ignoriere reine Atmosphäre-Lyrik.`,
    },
    {
      key: "atmosphaere",
      label: "Atmosphäre",
      slot: "c",
      hint: "Stimmung, Sinnesdetail und Altersangemessenheit des Settings.",
      brief: `NUR Atmosphäre: Stimmung, Sinnesdetail, Altersangemessenheit des Settings.
Ignoriere Motivations- und Regel-Checklisten.`,
    },
  ],
  expose: [
    {
      key: "figurenkraft",
      label: "Figurenkraft",
      slot: "a",
      hint: "Greifbare Wollen/Brauchen/Fürchten und Reibung — Steckbriefe und ihre Rolle im Exposé.",
      brief: `NUR Figurenkraft im Spec: Greifbare Wollen/Brauchen/Fürchten und Reibung untereinander — altersgerecht.
Steckbriefe und ihre Rolle im Exposé zusammen betrachten. Ignoriere reine Weltkataloge und Prosa-Stil.`,
    },
    {
      key: "weltnutzen",
      label: "Weltnutzen",
      slot: "b",
      hint: "Schauplätze und Regeln ermöglichen oder erschweren Konflikte — Welt und Handlung müssen passen.",
      brief: `NUR Weltnutzen im Spec: Schauplätze/Regeln ermöglichen oder erschweren Konflikte — keine Deko-Kataloge.
Welt und Handlung müssen zusammenpassen. Ignoriere Charakterpsychologie und Feinschliff.`,
    },
    {
      key: "handlungsbogen",
      label: "Handlungsbogen",
      slot: "c",
      hint: "Aufbau, Wendungen und Ziel im Spec/Exposé — klar und altersgerecht einlösbar.",
      brief: `NUR Handlungsbogen im Spec/Exposé: Aufbau, Wendungen, Ziel — klar und altersgerecht einlösbar.
Ignoriere reine Steckbrief-Details und Atmosphäre-Lyrik.`,
    },
  ],
  szenenplot: [
    {
      key: "funktion",
      label: "Funktion",
      slot: "a",
      hint: "Jedes Kapitel bringt den Plot voran oder erfüllt eine klare Story-Aufgabe — keine Füllkapitel.",
      brief: `NUR Kapitel-Nutzen/Funktion: Jedes Kapitel muss den Plot voranbringen oder eine klare Story-Aufgabe erfüllen (kein Füllkapitel, kein dekoratives Gerüst).
Ignoriere Prosa-Stil und Feinschliff — nur die Funktion im Gerüst.`,
    },
    {
      key: "dramaturgie",
      label: "Dramaturgie",
      slot: "b",
      hint: "Reihenfolge, Motivation, Wendungen und Spannungsbogen im Kapitelgerüst.",
      brief: `NUR Dramaturgie des Kapitelgerüsts: Reihenfolge, Motivation, Wendungen, Spannungsbogen — altersgerecht.
Ignoriere reine Formulierungsfragen und Prosa.`,
    },
    {
      key: "abdeckung",
      label: "Abdeckung",
      slot: "c",
      hint: "Deckt das Gerüst die zentralen Bögen, Wendungen und Versprechen aus Spec und Upstream ab?",
      brief: `NUR Abdeckung: Deckt das Kapitelgerüst die zentralen Bögen/Wendungen/Versprechen aus Exposé und Upstream (Idee, Figuren, Welt)? Fehlende oder verwaiste Stränge benennen.
Ignoriere Stil und Detailprosa.`,
    },
  ],
  manuskript: [
    {
      key: "stil",
      label: "Stil",
      slot: "a",
      hint: "Ton, Register, Stimme und Wortwahl im Manuskript — streng altersgerecht.",
      brief: `NUR Stil: Ton, Register, Stimme, Wortwahl im Manuskript — streng altersgerecht.
Ignoriere Plot-Löcher, außer sie sind stilistisch.`,
    },
    {
      key: "dramaturgie",
      label: "Dramaturgie",
      slot: "b",
      hint: "Aufbau, Motivation, Wendungen und Spannungsbogen in der Prosa.",
      brief: `NUR Dramaturgie: Aufbau, Motivation, Wendungen, Spannungsbogen — altersgerecht.
Ignoriere reine Stil-/Registerfragen.`,
    },
    {
      key: "lesefluss",
      label: "Lesefluss",
      slot: "c",
      hint: "Pacing, Klarheit, Übergänge und Satz-/Abschnittsrhythmus.",
      brief: `NUR Lesefluss: Pacing, Klarheit, Übergänge, Satz-/Abschnittsrhythmus — altersgerecht.
Ignoriere Motivations- und Regelthemen, außer sie brechen den Fluss.`,
    },
  ],
};

/** All four dimension defs for a stage (Logik + craft). Used for assess. */
export function dimensionsForStage(
  stage: PipelineStage,
): ReifegradDimensionDef[] {
  return [...REIFEGRAD_CORE_DEFS, ...STAGE_CRAFT_DIMENSIONS[stage]];
}

/**
 * Dimensions with Analysieren / Einarbeiten knobs in the Reifegrad card.
 * Default: all stage dimensions (Logik + three craft).
 */
export function improveDimensionsForStage(
  stage: PipelineStage,
): ReifegradDimensionDef[] {
  return dimensionsForStage(stage);
}

/**
 * How Gesamt is averaged for a stage (Logik + craft axes).
 */
export function reifegradGesamtDivisor(_stage: PipelineStage): number {
  return 4;
}

export function craftDimensionsForStage(
  stage: PipelineStage,
): [ReifegradDimensionDef, ReifegradDimensionDef, ReifegradDimensionDef] {
  return STAGE_CRAFT_DIMENSIONS[stage];
}

export function findDimensionDef(
  stage: PipelineStage,
  key: string,
): ReifegradDimensionDef | null {
  const normalized = key === "regeln" ? "logik" : key;
  return dimensionsForStage(stage).find((d) => d.key === normalized) ?? null;
}

export function isReifegradDimensionForStage(
  stage: PipelineStage,
  value: string,
): value is ReifegradDimension {
  const normalized = value === "regeln" ? "logik" : value;
  return improveDimensionsForStage(stage).some((d) => d.key === normalized);
}

export const REIFEGRAD_DIMENSION_LABELS: Record<string, string> = {
  logik: "Logik",
  regeln: "Logik", // legacy key
  erfuelltes_beduerfnis: "Erfülltes Bedürfnis",
  vernachlaessigtes_beduerfnis: "Vernachlässigtes Bedürfnis",
  schaerfe: "Schärfe",
  versprechen: "Versprechen",
  alleinstellung: "Alleinstellung",
  motivation: "Motivation",
  konfliktkraft: "Konfliktkraft",
  altersstimme: "Altersstimme",
  konsistenz: "Konsistenz",
  story_nutzen: "Story-Nutzen",
  atmosphaere: "Atmosphäre",
  figurenkraft: "Figurenkraft",
  weltnutzen: "Weltnutzen",
  handlungsbogen: "Handlungsbogen",
  spannungsbogen: "Spannungsbogen",
  antriebe: "Motivation",
  klarheit: "Klarheit",
  funktion: "Funktion",
  abdeckung: "Abdeckung",
  konkretheit: "Konkretheit",
  uebergaenge: "Übergänge",
  stil: "Stil",
  dramaturgie: "Dramaturgie",
  lesefluss: "Lesefluss",
};

export function dimensionLabel(
  stage: PipelineStage,
  key: ReifegradDimension | string,
): string {
  return (
    findDimensionDef(stage, key)?.label ??
    REIFEGRAD_DIMENSION_LABELS[key] ??
    key
  );
}

export function pctForDimension(
  value: StageReifegrad,
  def: ReifegradDimensionDef,
): number {
  switch (def.key) {
    case "logik":
      return value.regelnPct;
    default:
      if (def.slot === "a") return value.stilPct;
      if (def.slot === "b") return value.dramaturgiePct;
      return value.leseflussPct;
  }
}

export function statusForDimension(
  value: StageReifegrad,
  def: ReifegradDimensionDef,
): StageReifegrad["regelnStatus"] {
  switch (def.key) {
    case "logik":
      return value.regelnStatus;
    default:
      if (def.slot === "a") return value.stilStatus;
      if (def.slot === "b") return value.dramaturgieStatus;
      return value.leseflussStatus;
  }
}

export function formatCraftScoresLine(
  stage: PipelineStage,
  score: Pick<StageReifegrad, "stilPct" | "dramaturgiePct" | "leseflussPct">,
): string {
  const [a, b, c] = STAGE_CRAFT_DIMENSIONS[stage];
  return `${a.label} ${score.stilPct}% · ${b.label} ${score.dramaturgiePct}% · ${c.label} ${score.leseflussPct}%`;
}

/** All craft keys (for Zod enums). */
export const ALL_REIFEGRAD_DIMENSION_KEYS = [
  ...REIFEGRAD_CORE_DIMENSIONS,
  "schaerfe",
  "versprechen",
  "alleinstellung",
  "motivation",
  "konfliktkraft",
  "altersstimme",
  "konsistenz",
  "story_nutzen",
  "atmosphaere",
  "figurenkraft",
  "weltnutzen",
  "handlungsbogen",
  "spannungsbogen",
  "antriebe",
  "klarheit",
  "funktion",
  "abdeckung",
  "konkretheit",
  "uebergaenge",
  "stil",
  "dramaturgie",
  "lesefluss",
] as const satisfies readonly ReifegradDimension[];
