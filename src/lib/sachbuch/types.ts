/**
 * Sachbuch domain types — phases 1–6 workflow.
 */

export type SachbuchAgentKey =
  | "interviewer"
  | "researcher"
  | "architect"
  | "writer"
  | "critic"
  | "stylist";

export type SachbuchAgentSlot = {
  modelSlug: string;
  systemPrompt: string;
  /** Gemini Google Search grounding (researcher / writer). */
  googleSearch: boolean;
};

export type SachbuchAgents = Record<SachbuchAgentKey, SachbuchAgentSlot>;

export type SachbuchInterviewMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type SachbuchGroundingSource = {
  title: string;
  uri: string;
};

export type SachbuchPhaseStatus = "empty" | "in_progress" | "ready";

/** Guided wizard steps (Idee → freigeben → Typ → … → Schreiben → Export). */
export type SachbuchGuideStep =
  | "concept"
  | "refine"
  | "book_type"
  | "evidenz"
  | "makro"
  | "write"
  | "export";

export const SACHBUCH_GUIDE_STEPS: readonly SachbuchGuideStep[] = [
  "concept",
  "refine",
  "book_type",
  "evidenz",
  "makro",
  "write",
  "export",
] as const;

export const SACHBUCH_GUIDE_STEP_LABELS: Record<SachbuchGuideStep, string> = {
  concept: "Rohkonzept",
  refine: "Verfeinern",
  book_type: "Buchtyp",
  evidenz: "Recherche",
  makro: "Makro",
  write: "Schreiben",
  export: "Export",
};

/** Fixed count for Sachbuch marketing keywords (Amazon-style). */
export const SACHBUCH_KEYWORD_COUNT = 6;

/** Marketing / Titelei / Cover package (persisted on sachbuch_kontext). */
export type SachbuchExport = {
  /** KI-Vorschlag; book.title bleibt bis Übernahme unverändert. */
  suggestedTitle: string;
  subtitle: string;
  /** Klappentext / Amazon-Blurb. */
  summary: string;
  keywords: string[];
  autorName: string;
  /** Front matter (Titelseite, Impressum, Motto). */
  vorsatz: {
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
    widmung: string;
    motto: string;
  };
  coverImageDataUrl: string;
  coverPrompt: string;
};

/** Wizard cursor + HITL idea approval (stored inside idee JSON). */
export type SachbuchGuide = {
  currentStep: SachbuchGuideStep;
  /** Set when user freigibt the agentic-refined dossier. Hard gate for later phases. */
  ideaApprovedAt: string | null;
};

export type SachbuchIdeeRefineStatus =
  | "idle"
  | "running"
  | "awaiting_approval"
  | "approved";

/** One Haiku↔Luna collab round during concept refine. */
export type SachbuchIdeeRefineRound = {
  round: number;
  role: "haiku" | "luna";
  content: string;
  passed: boolean | null;
  changeOrders: string[];
  createdAt: string;
};

/** Phase 1 — Mind-Extraction, Agentic refine, UVP. */
export type SachbuchIdee = {
  interviewMessages: SachbuchInterviewMessage[];
  briefing: string;
  unpopularOpinion: string;
  caseStudies: string[];
  status: SachbuchPhaseStatus;
  /** Guided flow cursor + approval timestamp. */
  guide: SachbuchGuide;
  refineStatus: SachbuchIdeeRefineStatus;
  refineLog: SachbuchIdeeRefineRound[];
  /** Pending dossier after agentic refine (before HITL approve). */
  refinedBriefing: string;
  refinedOpinion: string;
  refinedCaseStudies: string[];
};

export type SachbuchEvidenzClaim = {
  id: string;
  claim: string;
  evidence: string;
  counter: string;
  sources: SachbuchGroundingSource[];
};

/** Phase 2 — Google Search evidence map (no RAG). */
export type SachbuchEvidenz = {
  queries: string[];
  claims: SachbuchEvidenzClaim[];
  status: SachbuchPhaseStatus;
};

export type SachbuchMakroTyp = "journey" | "erklaerung" | "erzaehlung";

export type SachbuchMakroStageKey =
  | "status_quo"
  | "paradigmenwechsel"
  | "framework"
  | "implementierung"
  | "zukunft"
  | "kontext"
  | "kernidee"
  | "vertiefung"
  | "beispiele"
  | "einordnung"
  | "ausgang"
  | "konflikt"
  | "verlauf"
  | "erkenntnis"
  | "bedeutung";

export type SachbuchMakroStage = {
  key: SachbuchMakroStageKey;
  title: string;
  promise: string;
  notes: string;
};

/** Phase 3 — Makro (Journey, Erklärung oder Erzählung). */
export type SachbuchMakro = {
  typ: SachbuchMakroTyp;
  stages: SachbuchMakroStage[];
  status: SachbuchPhaseStatus;
  /** True after „Kapitel aus Makro“ at least once. */
  kapitelGenerated: boolean;
  /**
   * Kerngebiet / Sachbuchtyp id (see `book-types.ts`).
   * Stored here until a dedicated column exists.
   */
  bookTypeId: string;
};

/** Phase 4 — per-chapter context graph. */
export type SachbuchContextGraph = {
  readerKnowledge: string;
  establishedTerms: string[];
  claimsToProve: string[];
  dependsOnKapitelIds: string[];
};

export type SachbuchAbschnittStatus =
  | "draft"
  | "checkpoint"
  | "accepted"
  | "revised";

/** Pipeline step that changed an Abschnitt (shown as clickable chips). */
export type SachbuchAbschnittRevisionKind =
  | "checkpoint"
  | "critic"
  | "style";

export type SachbuchAbschnittRevision = {
  id: string;
  kind: SachbuchAbschnittRevisionKind;
  /** Short chip label, e.g. "Checkpoint". */
  label: string;
  /** Bullet list / prose of what changed. */
  summary: string;
  beforeText: string;
  afterText: string;
  /** Extra context (checkpoint question, critic notes, sources). */
  meta: string;
  createdAt: string;
};

/** Phase 5 — section (300–500 words). */
export type SachbuchAbschnitt = {
  id: string;
  order: number;
  promptBrief: string;
  draftText: string;
  authorCheckpoint: string;
  authorReply: string;
  status: SachbuchAbschnittStatus;
  /** Auto pipeline revisions (Checkpoint → Critic → Style). */
  revisions: SachbuchAbschnittRevision[];
};

export const SACHBUCH_ABSCHNITT_REVISION_KIND_LABELS: Record<
  SachbuchAbschnittRevisionKind,
  string
> = {
  checkpoint: "Checkpoint",
  critic: "Critic",
  style: "Style",
};

export type SachbuchKapitelStatus =
  | "draft"
  | "graph"
  | "writing"
  | "generating"
  | "ready"
  | "error";

export type SachbuchKapitel = {
  id: string;
  title: string;
  goals: string;
  /** Links chapter to a makro stage when generated from journey. */
  makroStageKey: SachbuchMakroStageKey | null;
  contextGraph: SachbuchContextGraph;
  abschnitte: SachbuchAbschnitt[];
  /** Legacy chapter interview (unused in phases flow; kept for compat). */
  interviewMessages: SachbuchInterviewMessage[];
  interviewBriefing: string;
  draftPass1: string;
  critiquePass2: string;
  finalText: string;
  groundingSources: SachbuchGroundingSource[];
  status: SachbuchKapitelStatus;
  generationJobId: string | null;
  generationProgress: string | null;
  generationError: string | null;
  updatedAt: string;
};

export type SachbuchKontext = {
  id: string;
  title: string;
  stilbibel: string;
  zielgruppe: string;
  agents: SachbuchAgents;
  idee: SachbuchIdee;
  evidenz: SachbuchEvidenz;
  makro: SachbuchMakro;
  kapitel: SachbuchKapitel[];
  export: SachbuchExport;
  createdAt: string;
  updatedAt: string;
};

export type SachbuchKontextSummary = SachbuchKontext & {
  kapitelCount: number;
};

export type SachbuchUpsertInput = {
  id?: string | null;
  title: string;
  stilbibel: string;
  zielgruppe: string;
  agents: SachbuchAgents;
  idee: SachbuchIdee;
  evidenz: SachbuchEvidenz;
  makro: SachbuchMakro;
  kapitel: SachbuchKapitel[];
};

export const SACHBUCH_MAKRO_TYP_OPTIONS: SachbuchMakroTyp[] = [
  "journey",
  "erklaerung",
  "erzaehlung",
];

export const SACHBUCH_MAKRO_TYP_LABELS: Record<SachbuchMakroTyp, string> = {
  journey: "Transformation-Journey",
  erklaerung: "Erklärung",
  erzaehlung: "Erzählung / Fall",
};

export const SACHBUCH_MAKRO_TYP_HINTS: Record<SachbuchMakroTyp, string> = {
  journey:
    "These / Methode / Umsetzen — Interview & Makro auf Transformation abgestimmt.",
  erklaerung:
    "Thema verständlich machen — Interview & Makro auf Verständnis abgestimmt.",
  erzaehlung:
    "Fall / Geschichte erzählen — Interview & Makro auf Erzählbogen abgestimmt.",
};

export const SACHBUCH_MAKRO_JOURNEY_KEYS: SachbuchMakroStageKey[] = [
  "status_quo",
  "paradigmenwechsel",
  "framework",
  "implementierung",
  "zukunft",
];

export const SACHBUCH_MAKRO_ERKLAERUNG_KEYS: SachbuchMakroStageKey[] = [
  "kontext",
  "kernidee",
  "vertiefung",
  "beispiele",
  "einordnung",
];

export const SACHBUCH_MAKRO_ERZAEHLUNG_KEYS: SachbuchMakroStageKey[] = [
  "ausgang",
  "konflikt",
  "verlauf",
  "erkenntnis",
  "bedeutung",
];

/** All valid stage keys (all makro types). */
export const SACHBUCH_MAKRO_STAGE_KEYS: SachbuchMakroStageKey[] = [
  ...SACHBUCH_MAKRO_JOURNEY_KEYS,
  ...SACHBUCH_MAKRO_ERKLAERUNG_KEYS,
  ...SACHBUCH_MAKRO_ERZAEHLUNG_KEYS,
];

export const SACHBUCH_MAKRO_STAGE_LABELS: Record<
  SachbuchMakroStageKey,
  string
> = {
  status_quo: "Status Quo / Ungelöstes Problem",
  paradigmenwechsel: "Paradigmenwechsel / Neue These",
  framework: "Framework / Methode",
  implementierung: "Implementierung & Hindernisse",
  zukunft: "Zukunft / Ausblick",
  kontext: "Kontext / Ausgangslage",
  kernidee: "Kernidee",
  vertiefung: "Vertiefung",
  beispiele: "Beispiele / Anschauung",
  einordnung: "Einordnung / Fazit",
  ausgang: "Ausgangssituation / Szene",
  konflikt: "Zentrale Frage / Konflikt",
  verlauf: "Verlauf / Zuspitzung",
  erkenntnis: "Wendepunkt / Erkenntnis",
  bedeutung: "Bedeutung für den Leser",
};

/** Stage keys belonging to a makro type. */
export function makroStageKeysForTyp(
  typ: SachbuchMakroTyp,
): SachbuchMakroStageKey[] {
  if (typ === "erklaerung") return SACHBUCH_MAKRO_ERKLAERUNG_KEYS;
  if (typ === "erzaehlung") return SACHBUCH_MAKRO_ERZAEHLUNG_KEYS;
  return SACHBUCH_MAKRO_JOURNEY_KEYS;
}

/** Empty stage shells for a makro type. */
export function emptyMakroStages(
  typ: SachbuchMakroTyp,
): SachbuchMakroStage[] {
  return makroStageKeysForTyp(typ).map((key) => ({
    key,
    title: SACHBUCH_MAKRO_STAGE_LABELS[key],
    promise: "",
    notes: "",
  }));
}

/** One-line stage path for UI copy. */
export function makroStagePathLabel(typ: SachbuchMakroTyp): string {
  if (typ === "erklaerung") {
    return "Kontext → Kernidee → Vertiefung → Beispiele → Einordnung";
  }
  if (typ === "erzaehlung") {
    return "Ausgang → Konflikt → Verlauf → Erkenntnis → Bedeutung";
  }
  return "Status Quo → Paradigmenwechsel → Framework → Implementierung → Zukunft";
}
