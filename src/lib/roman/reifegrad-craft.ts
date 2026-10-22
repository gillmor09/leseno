/**
 * Stage-specific Reifegrad craft axes (slots A/B/C).
 * No AI imports — safe for model + assess + improve + UI.
 *
 * Storage: stilPct / dramaturgiePct / leseflussPct = slots A / B / C.
 * Core: logik (stored as regelnPct for JSON compat).
 */

import {
  normalizePipelineStage,
  type PipelineStage,
} from "@/lib/roman/pipeline/stages";
import type {
  ReifegradAssessKey,
  StageReifegrad,
} from "@/lib/roman/reifegrad-model";

export const REIFEGRAD_CORE_DIMENSIONS = ["logik"] as const;

/**
 * Wired model for the four dimension „Analysieren“ calls
 * (prompt still from Entwicklungslektor; apply uses Co-Autor).
 * Structured critique, same class as the Roman assist model (Haiku 5.5), not prose.
 */
export const REIFEGRAD_DIMENSION_ANALYZE_MODEL_SLUG = "claude-haiku-5-5";

export type ReifegradCoreDimension =
  (typeof REIFEGRAD_CORE_DIMENSIONS)[number];

export type ReifegradCraftSlot = "a" | "b" | "c";

export type ReifegradCraftKey =
  | "schaerfe"
  | "kernkonflikt"
  | "tragfaehigkeit"
  /** @deprecated Idee craft B is {@link kernkonflikt}; kept for legacy plans. */
  | "versprechen"
  /** @deprecated Idee craft C is {@link tragfaehigkeit}; kept for legacy plans. */
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
  /** Wissensgraph: edges + hardInvariants as continuity ledger. */
  | "vernetzung"
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
 * Idee-only Logik (Konzept-Ebene) — used by {@link dimensionsForStage} for `idee`.
 */
export const IDEE_LOGIK_DEF: ReifegradDimensionDef = {
  key: "logik",
  label: "Logik",
  hint: "Stimmen Prämisse, Figurenkern und Setting-Skizze zusammen — ohne Widerspruch, ohne magische Lösung ohne Regel?",
  brief: `NUR innere Logik der Idee (Konzept-Ebene): Stimmen Prämisse, Figurenkerne und Setting-Skizze kausal zusammen?
Keine Widersprüche, keine magischen Lösungen ohne Regel, kein „und dann passiert irgendwie …“.
VERBOTEN zu bewerten: Kapitelpläne, Prosa-Stil, Markt-Pitch.
Zu dünn = lose Versatzstücke ohne Ursache/Wirkung.`,
};

/**
 * Weighted Gesamt for Idee (sums to 1).
 * Keys listed in UI/priority order (desc): Spec-Saat first, Schärfe last.
 */
export const IDEE_REIFEGRAD_WEIGHTS = {
  kernkonflikt: 0.3,
  tragfaehigkeit: 0.3,
  logik: 0.25,
  schaerfe: 0.15,
} as const;

/**
 * Idee axes in weight-priority order (same as {@link IDEE_REIFEGRAD_WEIGHTS} keys).
 * Storage slots A/B/C stay Schärfe/Kernkonflikt/Tragfähigkeit — only display/improve order.
 */
export function ideeDimensionsByPriority(): ReifegradDimensionDef[] {
  const [schaerfe, kernkonflikt, tragfaehigkeit] = STAGE_CRAFT_DIMENSIONS.idee;
  return [kernkonflikt, tragfaehigkeit, IDEE_LOGIK_DEF, schaerfe];
}

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
      hint: "Kern in 1–2 Sätzen greifbar — konkret, ohne Wischiwaschi, ohne Kapitelplan.",
      brief: `NUR Schärfe: Kann man den Ideenkern in 1–2 klaren Sätzen sagen — wer, was auf dem Spiel steht, worum es geht?
Konkret, nicht „irgendwie Thriller mit Geheimnis“ oder Genre-Floskeln.
VERBOTEN in der Idee: Kapitelgliederung, Beat-Sheets, Szenenfolgen, Spec-Steckbriefe.
Ignoriere Prosa-Stil und Markt-Pitch. Zu dünn = unscharfe Lage ohne greifbaren Kern.`,
    },
    {
      key: "kernkonflikt",
      label: "Kernkonflikt",
      slot: "b",
      hint: "Zentrale Spannung: Antrieb vs. Widerstand, warum es zählt — Saat für Spec.",
      brief: `NUR Kernkonflikt: Greifbare zentrale Konfliktspannung oder These — Antrieb vs. Widerstand, persönlicher/dramatischer Einsatz.
Das ist die Saat für Figuren/Welt/Exposé — kein Leseversprechen, kein Genre-Marketing, kein „Leser will X“.
Zu dünn = abstrakte Lage ohne Gegenkraft oder ohne warum-es-zählt.`,
    },
    {
      key: "tragfaehigkeit",
      label: "Tragfähigkeit",
      slot: "c",
      hint: "Reicht der Stoff für einen ganzen Roman (Steigerung/Mitte/Ende) — oder nur eine Episode?",
      brief: `NUR Tragfähigkeit / Romanstoff: Trägt dieser Kern einen ganzen Roman — erkennbare Steigerung, Spielraum für Mitte und Ende — oder nur Kurzgeschichte/Episode?
Downstream darf verdichten, aber nicht den dramatischen Kern erfinden müssen.
Ignoriere Kapitelzahlen und fertige Plotchronologie; bewerte Stoff-Potenzial (Escalation/Midpoint-/Endgame-Seed).
Zu dünn = eine Szene/Idee ohne Raum für Mehrakt-Druck.`,
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
      hint: "Antriebe und Reibung, die mehrere Akte speisen — nicht nur einen Einstieg.",
      brief: `NUR Figurenkraft im Spec: Greifbare Wollen/Brauchen/Fürchten und Reibung — altersgerecht und romanfähig.
Steckbriefe + Rolle im Exposé: Antriebe müssen MEHRERE Akte speisen (Verschärfung möglich), nicht nur den Anfang einer Episode.
Zu dünn = kritisch: Figuren ohne nachhaltigen Konfliktstoff für einen ganzen Roman.
Ignoriere reine Weltkataloge und Prosa-Stil.`,
    },
    {
      key: "weltnutzen",
      label: "Weltnutzen",
      slot: "b",
      hint: "Schauplätze/Regeln erzeugen laufend Konflikte — genug Stoff für ein ganzes Buch.",
      brief: `NUR Weltnutzen im Spec: Schauplätze/Regeln ermöglichen oder erschweren Konflikte — keine Deko-Kataloge.
Welt muss den Handlungsbogen über die Buchlänge mit Druck versorgen (wiederkehrende Reibung, Eskalationsraum), nicht nur eine Szenerie liefern.
Zu dünn = kritisch: Downstream müsste zentrale Welt-Konflikte erfinden.
Ignoriere Charakterpsychologie und Feinschliff.`,
    },
    {
      key: "handlungsbogen",
      label: "Handlungsbogen",
      slot: "c",
      hint: "Anfang → Druck/Wende → Ziel: trägt der Bogen einen ganzen Roman, altersgerecht einlösbar?",
      brief: `NUR Handlungsbogen im Spec/Exposé: Aufbau, Druck/Wende, Ziel/Payoff-Versprechen — klar, altersgerecht und romanfähig.
Prüfe Escalation und Midpoint/Endgame-Seed: Reicht der Bogen für einen ganzen Roman, oder nur für eine Kurzgeschichte/Episode?
Fehlende Steigerung oder unklarer Schluss = kritisch (sonst erfindet Gerüst/Plot später den Kern).
Ignoriere reine Steckbrief-Details und Atmosphäre-Lyrik.`,
    },
  ],
  /** Filled after object — aliases to expose / plot / szenen craft. */
  rahmen: null as unknown as [
    ReifegradDimensionDef,
    ReifegradDimensionDef,
    ReifegradDimensionDef,
  ],
  fundament: null as unknown as [
    ReifegradDimensionDef,
    ReifegradDimensionDef,
    ReifegradDimensionDef,
  ],
  graph: [
    {
      key: "abdeckung",
      label: "Abdeckung",
      slot: "a",
      hint: "Handlungsrelevante Figuren, Orte, Props und Events aus Fundament+Exposé sind als Knoten da.",
      brief: `NUR Abdeckung des Wissensgraphen: Sind handlungsrelevante Personen, Orte, Props und Events aus Fundament/Exposé als Knoten vorhanden?
Fehlende zentrale Entities benennen. Mindestens Personen + Orte + handlungsrelevante Props/Events.
Ignoriere Plot-Kapitel und Prosa — nur den Graph als Canon-Ledger.`,
    },
    {
      key: "konkretheit",
      label: "Konkretheit",
      slot: "b",
      hint: "Identitäts-Attrs gesetzt (Farbe, Kennzeichen, Adresse, Material, Datum/Uhrzeit) — keine dünnen Platzhalter.",
      brief: `NUR Konkretheit der Knoten-attrs: Props/Orte/Events/Personen brauchen greifbare Identitäts-Details (farbe, kennzeichen, adresse/hausnummer, material, name, datum/uhrzeit, standort).
Dünne Knoten ohne konkrete attrs = kritisch (Plot/Manuskript würde sonst neu erfinden).
Bestehende konkrete attrs nicht still ändern — nur fehlende bewerten. Ignoriere Spannungsbögen und Szenenverträge.`,
    },
    {
      key: "vernetzung",
      label: "Vernetzung",
      slot: "c",
      hint: "Kanten und hardInvariants verbinden Entities zu einem belastbaren Canon-Netz.",
      brief: `NUR Vernetzung: Sinnvolle Edges zwischen Personen/Orten/Props/Events und belastbare hardInvariants (Canon-Fakten, die Plot/Manuskript nicht widersprechen dürfen).
Isolierte Knoten ohne Relationen oder leere Invarianten-Liste = zu schwach für Plot-Faktenverträge.
Ignoriere Prosa-Stil und Kapitelreihenfolge.`,
    },
  ],
  plot: null as unknown as [
    ReifegradDimensionDef,
    ReifegradDimensionDef,
    ReifegradDimensionDef,
  ],
  szenen: null as unknown as [
    ReifegradDimensionDef,
    ReifegradDimensionDef,
    ReifegradDimensionDef,
  ],
  grobgeruest: [
    {
      key: "funktion",
      label: "Funktion",
      slot: "a",
      hint: "Jedes Kapitel hat eine klare Story-Aufgabe (Kernsatz) — keine Füllkapitel.",
      brief: `NUR Kapitel-Nutzen im Grobgerüst: Jedes Kapitel braucht einen greifbaren Kernsatz / eine Story-Aufgabe (kein Füllkapitel).
Nur Outline-Ebene — keine Szenen, kein Mini-Manuskript.`,
    },
    {
      key: "spannungsbogen",
      label: "Spannungsbogen",
      slot: "b",
      hint: "Zentrale Arcs mit Setup/Peak/Payoff-Kapiteln sind angelegt.",
      brief: `NUR zentrale Spannungsbögen (centralArcs): Setup/Peak/Payoff-Kapitel plausibel, Parteien klar.
Ignoriere Einzelszenen und detaillierte Lifecycle-Felder.`,
    },
    {
      key: "abdeckung",
      label: "Abdeckung",
      slot: "c",
      hint: "Outline deckt das Spec-Versprechen auf Kapitelebene ab.",
      brief: `NUR Abdeckung der Spec-Versprechen durch Kapitel-Kernsätze/Arcs — Anker reichen.
Ignoriere Feingerüst-Details und Plot.`,
    },
  ],
  feingeruest: [
    {
      key: "funktion",
      label: "Funktion",
      slot: "a",
      hint: "Jedes Kapitel bringt den Plot voran oder erfüllt eine klare Story-Aufgabe — keine Füllkapitel.",
      brief: `NUR Kapitel-Nutzen/Funktion: Jedes Kapitel muss den Plot voranbringen oder eine klare Story-Aufgabe erfüllen (kein Füllkapitel).
Skizzenhafte Kürze und offene Fäden sind OK — kein Mini-Manuskript verlangen.
Ignoriere Einzelszenen, Prosa-Stil und Feinschliff — nur die Funktion im Gerüst.`,
    },
    {
      key: "dramaturgie",
      label: "Dramaturgie",
      slot: "b",
      hint: "Reihenfolge, Tempo, Wendungen und Spannungsbögen auf Kapitelebene (Setup/Peak/Payoff).",
      brief: `NUR Dramaturgie des Gerüsts: Reihenfolge, Tempo, Wendungen, Spannungsbogen — altersgerecht.
Prüfe zentrale Arcs (Setup/Peak/Payoff) und knappe Arc-Beats — fehlen Peak/Payoff oder driftet der Bogen?
Nicht bestrafen: knappe mustShow, offene Threads, Raum für den Plot.
Ignoriere Einzelszenen-Handlungen und Prosa.`,
    },
    {
      key: "abdeckung",
      label: "Abdeckung",
      slot: "c",
      hint: "Deckt das Gerüst den Gesamt-Kanon (Regeln, Figuren, Welt, Exposé, Wissensgraph) ab?",
      brief: `NUR Abdeckung: Deckt das Gerüst die zentralen Bögen, Figuren-Antriebe, Weltregeln, Leitplanken und Knoten aus dem Gesamt-Kanon (Regeln & Grenzen + Fundament + Exposé + Wissensgraph) ab? Fehlende oder verwaiste Stränge (ohne Kapitel-Anker / ohne Arc) benennen.
Wenn das Exposé knapp ist, zählt die konsistente Ausfaltung aus Figuren, Welt, Regeln und Wissensgraph positiv — nicht als „Erfindung gegen das Exposé“ bestrafen.
Nicht verlangen, dass jedes Motiv schon szenisch ausgearbeitet ist — Anker reichen.
Ignoriere Stil und Detailprosa.`,
    },
  ],
  grobplot: [
    {
      key: "konkretheit",
      label: "Konkretheit",
      slot: "a",
      hint: "Pro Kapitel gibt es greifbare Szenen-Köpfe (Heading + kurze Summary).",
      brief: `NUR Grobplot: Jedes Kapitel hat 2–5 Szenen mit scene_id, Heading und knapper Summary — keine leeren Platzhalter.
Volle Verträge/schreibPrompt gehören in den Feinplot — hier nicht verlangen.`,
    },
    {
      key: "uebergaenge",
      label: "Übergänge",
      slot: "b",
      hint: "Szenenfolge pro Kapitel ergibt Ursache→Wirkung auf Outline-Ebene.",
      brief: `NUR grobe Übergänge: Szenenreihenfolge plausibel; Summaries lassen Ursache→Wirkung erahnen.
Fein-Continuity (Etage/Props) ist Feinplot.`,
    },
    {
      key: "abdeckung",
      label: "Abdeckung",
      slot: "c",
      hint: "Jedes Feingerüst-Kapitel hat Szenen; Arc-Anker sind sichtbar.",
      brief: `NUR Abdeckung: Jedes Feingerüst-Kapitel hat Szenen; zentrale Arc-Beats haben mindestens eine Szene als Anker.
schreibPrompt/Full-Contracts nicht verlangen.`,
    },
  ],
  feinplot: [
    {
      key: "konkretheit",
      label: "Konkretheit",
      slot: "a",
      hint: "Jede Szene hat greifbare Handlungen, Ziel/Hindernis/Wende — keine abstrakten Platzhalter.",
      brief: `NUR Konkretheit der Szenen: greifbare Handlungen, Ziel/Hindernis/Wende/Wertewechsel, Info-Fluss.
Keine abstrakten Platzhalter. Ignoriere Prosa-Stil — nur den Szenenplot-Vertrag.`,
    },
    {
      key: "uebergaenge",
      label: "Übergänge",
      slot: "b",
      hint: "Ursache→Wirkung zwischen Szenen; Continuity und Hooks ohne Logiklücken.",
      brief: `NUR Übergänge/Continuity im Plot: Ursache→Wirkung, next_scene_hook, character_states_after (Ort/Etage), prop_placements_after, Intro/Resolve.
Keine Handlungslöcher. Ignoriere Formulierungsstil.`,
    },
    {
      key: "abdeckung",
      label: "Abdeckung",
      slot: "c",
      hint: "Jeder Arc-Beat und jedes Gerüst-Kapitel ist in Szenen abgedeckt; schreibPrompt vorhanden.",
      brief: `NUR Abdeckung: Jeder centralArc-Beat und jedes Gerüst-Kapitel muss in Szenen landen; schreibPrompt pro Szene vorhanden.
Fehlende Arc→Szene-Zuordnung benennen. Ignoriere Prosa.`,
    },
  ],
  /** Filled below — same axes as feingeruest / feinplot. */
  kapitelgeruest: null as unknown as [
    ReifegradDimensionDef,
    ReifegradDimensionDef,
    ReifegradDimensionDef,
  ],
  szenenplot: null as unknown as [
    ReifegradDimensionDef,
    ReifegradDimensionDef,
    ReifegradDimensionDef,
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

// Canonical process stages + legacy aliases share craft axes.
STAGE_CRAFT_DIMENSIONS.rahmen = STAGE_CRAFT_DIMENSIONS.expose;
STAGE_CRAFT_DIMENSIONS.fundament = STAGE_CRAFT_DIMENSIONS.expose;
// graph has own craft axes (Abdeckung / Konkretheit / Vernetzung) — do not alias.
// Plot = Ereignisplan (Feingerüst craft); Szenen = Feinplot craft.
STAGE_CRAFT_DIMENSIONS.plot = STAGE_CRAFT_DIMENSIONS.feingeruest;
STAGE_CRAFT_DIMENSIONS.szenen = STAGE_CRAFT_DIMENSIONS.feinplot;
STAGE_CRAFT_DIMENSIONS.kapitelgeruest = STAGE_CRAFT_DIMENSIONS.plot;
STAGE_CRAFT_DIMENSIONS.grobgeruest = STAGE_CRAFT_DIMENSIONS.plot;
STAGE_CRAFT_DIMENSIONS.szenenplot = STAGE_CRAFT_DIMENSIONS.szenen;
STAGE_CRAFT_DIMENSIONS.grobplot = STAGE_CRAFT_DIMENSIONS.szenen;

/**
 * Craft axes for assess keys — `roman` reuses Manuskript Stil/Dramaturgie/Lesefluss.
 */
export function craftDimensionsForAssessKey(
  key: ReifegradAssessKey,
): [ReifegradDimensionDef, ReifegradDimensionDef, ReifegradDimensionDef] {
  if (key === "roman") return STAGE_CRAFT_DIMENSIONS.manuskript;
  const canonical = normalizePipelineStage(key) ?? key;
  const craft =
    STAGE_CRAFT_DIMENSIONS[canonical] ?? STAGE_CRAFT_DIMENSIONS[key];
  if (!craft) {
    throw new Error(`Keine Reifegrad-Craft-Achsen für Stufe „${key}“.`);
  }
  return craft;
}

/** Resolve PipelineStage craft lookup for assess keys (roman → manuskript axes). */
export function pipelineStageForAssessKey(
  key: ReifegradAssessKey,
): PipelineStage {
  if (key === "roman") return "manuskript";
  return normalizePipelineStage(key) ?? key;
}

/** All four dimension defs for a stage (Logik + craft). Used for assess/UI. */
export function dimensionsForStage(
  stage: PipelineStage,
): ReifegradDimensionDef[] {
  if (stage === "idee") return ideeDimensionsByPriority();
  const canonical = normalizePipelineStage(stage) ?? stage;
  const craft =
    STAGE_CRAFT_DIMENSIONS[canonical] ?? STAGE_CRAFT_DIMENSIONS[stage];
  return [REIFEGRAD_CORE_DEFS[0]!, ...craft];
}

/** Dimension defs for pipeline stages or post-polish `roman`. */
export function dimensionsForAssessKey(
  key: ReifegradAssessKey,
): ReifegradDimensionDef[] {
  if (key === "idee") return ideeDimensionsByPriority();
  return [REIFEGRAD_CORE_DEFS[0]!, ...craftDimensionsForAssessKey(key)];
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
 * Analyze/apply knobs for assess keys.
 * Roman (content-frozen polish): only Stil + Lesefluss — Logik/Dramaturgie
 * belong in the Manuskript draft, not a stil-pass rework.
 * Idee: Kernkonflikt · Tragfähigkeit · Logik · Schärfe (Gewichtungs-Reihenfolge).
 */
export function improveDimensionsForAssessKey(
  key: ReifegradAssessKey,
): ReifegradDimensionDef[] {
  if (key === "roman") {
    const [stil, , lesefluss] = STAGE_CRAFT_DIMENSIONS.manuskript;
    return [stil, lesefluss];
  }
  if (key === "idee") return ideeDimensionsByPriority();
  return improveDimensionsForStage(key);
}

/**
 * How many axes enter Gesamt for a stage (Idee is weighted, still 4 axes).
 */
export function reifegradGesamtDivisor(_stage: PipelineStage): number {
  void _stage;
  return 4;
}

/**
 * Map legacy Idee craft keys onto current axes.
 * „versprechen“ → Kernkonflikt, „alleinstellung“ → Tragfähigkeit.
 */
export function normalizeIdeeCraftDimensionKey(
  key: string,
): ReifegradDimension {
  if (key === "versprechen") return "kernkonflikt";
  if (key === "alleinstellung") return "tragfaehigkeit";
  return key as ReifegradDimension;
}

/** Weighted Idee Gesamt (see {@link IDEE_REIFEGRAD_WEIGHTS}). */
export function computeIdeeGesamtPct(input: {
  logikPct: number;
  schaerfePct: number;
  kernkonfliktPct: number;
  tragfaehigkeitPct: number;
}): number {
  const w = IDEE_REIFEGRAD_WEIGHTS;
  return (
    input.logikPct * w.logik +
    input.schaerfePct * w.schaerfe +
    input.kernkonfliktPct * w.kernkonflikt +
    input.tragfaehigkeitPct * w.tragfaehigkeit
  );
}

export function craftDimensionsForStage(
  stage: PipelineStage,
): [ReifegradDimensionDef, ReifegradDimensionDef, ReifegradDimensionDef] {
  return craftDimensionsForAssessKey(stage);
}

export function formatCraftScoresLineForAssessKey(
  key: ReifegradAssessKey,
  score: Pick<StageReifegrad, "stilPct" | "dramaturgiePct" | "leseflussPct">,
): string {
  if (key === "idee") {
    // Craft only, weight-priority (Logik comes from the caller prefix or
    // {@link formatIdeeScoresLineByPriority}).
    return `Kernkonflikt ${score.dramaturgiePct}% · Tragfähigkeit ${score.leseflussPct}% · Schärfe ${score.stilPct}%`;
  }
  const [a, b, c] = craftDimensionsForAssessKey(key);
  return `${a.label} ${score.stilPct}% · ${b.label} ${score.dramaturgiePct}% · ${c.label} ${score.leseflussPct}%`;
}

/** Full Idee score line in weight-priority order. */
export function formatIdeeScoresLineByPriority(
  score: Pick<
    StageReifegrad,
    "regelnPct" | "stilPct" | "dramaturgiePct" | "leseflussPct"
  >,
): string {
  return `Kernkonflikt ${score.dramaturgiePct}% · Tragfähigkeit ${score.leseflussPct}% · Logik ${score.regelnPct}% · Schärfe ${score.stilPct}%`;
}

export function findDimensionDef(
  stage: PipelineStage,
  key: string,
): ReifegradDimensionDef | null {
  const normalized = key === "regeln" ? "logik" : key;
  return dimensionsForStage(stage).find((d) => d.key === normalized) ?? null;
}

export function findDimensionDefForAssessKey(
  key: ReifegradAssessKey,
  dimKey: string,
): ReifegradDimensionDef | null {
  let normalized = dimKey === "regeln" ? "logik" : dimKey;
  if (key === "idee") {
    normalized = normalizeIdeeCraftDimensionKey(normalized);
  }
  return (
    improveDimensionsForAssessKey(key).find((d) => d.key === normalized) ??
    null
  );
}

export function isReifegradDimensionForStage(
  stage: PipelineStage,
  value: string,
): value is ReifegradDimension {
  const normalized = value === "regeln" ? "logik" : value;
  return improveDimensionsForStage(stage).some((d) => d.key === normalized);
}

export function isReifegradDimensionForAssessKey(
  key: ReifegradAssessKey,
  value: string,
): value is ReifegradDimension {
  const normalized = value === "regeln" ? "logik" : value;
  return improveDimensionsForAssessKey(key).some((d) => d.key === normalized);
}

export const REIFEGRAD_DIMENSION_LABELS: Record<string, string> = {
  logik: "Logik",
  regeln: "Logik", // legacy key
  erfuelltes_beduerfnis: "Erfülltes Bedürfnis",
  vernachlaessigtes_beduerfnis: "Vernachlässigtes Bedürfnis",
  schaerfe: "Schärfe",
  kernkonflikt: "Kernkonflikt",
  tragfaehigkeit: "Tragfähigkeit",
  versprechen: "Kernkonflikt", // legacy Idee craft B
  alleinstellung: "Tragfähigkeit", // legacy Idee craft C
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
  return formatCraftScoresLineForAssessKey(stage, score);
}

/** All craft keys (for Zod enums). */
export const ALL_REIFEGRAD_DIMENSION_KEYS = [
  ...REIFEGRAD_CORE_DIMENSIONS,
  "schaerfe",
  "kernkonflikt",
  "tragfaehigkeit",
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
  "vernetzung",
  "stil",
  "dramaturgie",
  "lesefluss",
] as const satisfies readonly ReifegradDimension[];
