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

/** Guided wizard steps (Idee → … → Manuskript → Herstellung → Export). */
export type SachbuchGuideStep =
  | "concept"
  | "refine"
  | "book_type"
  | "evidenz"
  | "makro"
  | "write"
  | "manuscript"
  | "herstellung"
  | "export";

export const SACHBUCH_GUIDE_STEPS: readonly SachbuchGuideStep[] = [
  "concept",
  "refine",
  "book_type",
  "evidenz",
  "makro",
  "write",
  "manuscript",
  "herstellung",
  "export",
] as const;

export const SACHBUCH_GUIDE_STEP_LABELS: Record<SachbuchGuideStep, string> = {
  concept: "Rohkonzept",
  refine: "Verfeinern",
  book_type: "Buchtyp",
  evidenz: "Recherche",
  makro: "Makro",
  write: "Schreiben",
  manuscript: "Manuskript",
  herstellung: "Herstellung",
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
    /** Preface before chapters (expectation-setting); empty = omit. */
    vorwort: string;
  };
  coverImageDataUrl: string;
  coverPrompt: string;
};

/** Wizard cursor + HITL gates (stored inside idee JSON). */
export type SachbuchGuide = {
  currentStep: SachbuchGuideStep;
  /** Set when user freigibt the agentic-refined dossier. Hard gate for later phases. */
  ideaApprovedAt: string | null;
  /**
   * Set when user freezes Phase 5 (Schreiben). Locks Abschnitte/Graph edits;
   * unlocks Manuskript-Lektorat (+ Herstellung / Export).
   */
  writeApprovedAt: string | null;
};

/** Phase 7 — per-chapter manuscript lektorat (sales readiness + rewrite). */
export type SachbuchKapitelManuscript = {
  /** Frozen Rohentwurf at write-approve (Abschnitte concat). */
  draftText: string;
  /** Lektorat-Rewrite; empty until improved. */
  improvedText: string;
  /**
   * Herstellung (Haiku): same prose + layout markers
   * (`<<<H>>>`, `<<<BOX …>>>`) for PDF/ePub. Empty until prepared.
   */
  herstellungText: string;
  /** Short notes from the last Herstellung pass (Unterkapitel / Kästen). */
  herstellungNotes: string[];
  hergestelltAt: string | null;
  /** Verkaufsreife 1–10; null until scored. */
  salesScore: number | null;
  scoreSummary: string;
  strengths: string[];
  gaps: string[];
  changeOrders: string[];
  scoredAt: string | null;
  improvedAt: string | null;
  modelSlug: string;
};

/**
 * Phase 7 — book-level Verkaufsreife (whole manuscript as one product).
 * Not a mean of chapter scores; scored holistically by Argon.
 */
export type SachbuchManuscriptBookReview = {
  salesScore: number | null;
  scoreSummary: string;
  strengths: string[];
  gaps: string[];
  changeOrders: string[];
  scoredAt: string | null;
  modelSlug: string;
};

/** Phase 8 — book-level Herstellung summary (layout readiness). */
export type SachbuchHerstellungBookReview = {
  summary: string;
  decisions: string[];
  preparedAt: string | null;
  modelSlug: string;
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
  /** Whole-book Verkaufsreife after Manuskript-Lektorat (null until scored). */
  manuscriptReview: SachbuchManuscriptBookReview;
  /** Whole-book Herstellung notes after Haiku layout pass. */
  herstellungReview: SachbuchHerstellungBookReview;
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

/**
 * One planned chapter inside a Buchteil (flexible makro).
 * `id` is stable within the part (e.g. `ch_01`); combined with part id → kapitel.makroStageKey.
 */
export type SachbuchMakroChapterPlan = {
  id: string;
  title: string;
  promise: string;
  notes: string;
};

/** Book part (e.g. Teil A Fundament) with one or more chapters. */
export type SachbuchMakroPart = {
  id: string;
  title: string;
  promise: string;
  chapters: SachbuchMakroChapterPlan[];
};

/** Phase 3 — Makro (Journey, Erklärung oder Erzählung). */
export type SachbuchMakro = {
  typ: SachbuchMakroTyp;
  /**
   * Legacy 5-stage spine (typ template). Still filled for older books;
   * when `parts` has chapters, parts drive Kapitel-Erzeugung.
   */
  stages: SachbuchMakroStage[];
  /**
   * Flexible structure: Buchteile → Kapitel.
   * Preferred for new makro generation (idea-fit, not fixed 5).
   */
  parts: SachbuchMakroPart[];
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
  /**
   * Links chapter to makro outline.
   * Flexible: `partId__chapterId` from parts, or legacy stage key.
   */
  makroStageKey: string | null;
  contextGraph: SachbuchContextGraph;
  abschnitte: SachbuchAbschnitt[];
  /** Legacy chapter interview (unused in phases flow; kept for compat). */
  interviewMessages: SachbuchInterviewMessage[];
  interviewBriefing: string;
  draftPass1: string;
  critiquePass2: string;
  finalText: string;
  groundingSources: SachbuchGroundingSource[];
  /** Phase 7 lektorat (score + improved prose). */
  manuscript: SachbuchKapitelManuscript;
  /**
   * Optional full-page Infografik after chapter prose (PDF/ePub).
   * data:image/…; set in Herstellung via Gemini Pro Image.
   */
  infografikDataUrl: string | null;
  /** Short German title shown in admin / used in the image brief. */
  infografikTitle: string;
  /** Last image prompt (debug / regenerate). */
  infografikPrompt: string;
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

/** One-line stage path for UI copy (typ as narrative hint; structure is flexible parts). */
export function makroStagePathLabel(typ: SachbuchMakroTyp): string {
  const flex =
    "Flexibel: Buchteile mit je 1+ Kapiteln (an Idee anpassen, typisch 2–4 Teile / 6–12 Kapitel)";
  if (typ === "erklaerung") {
    return `${flex}. Erzählhint: Kontext → Kernidee → Vertiefung → Beispiele → Einordnung`;
  }
  if (typ === "erzaehlung") {
    return `${flex}. Erzählhint: Ausgang → Konflikt → Verlauf → Erkenntnis → Bedeutung`;
  }
  return `${flex}. Erzählhint: Status Quo → Paradigmenwechsel → Framework → Implementierung → Zukunft`;
}

/** Stable kapitel key from part + chapter plan ids. */
export function makroChapterLinkKey(partId: string, chapterId: string): string {
  return `${partId}__${chapterId}`;
}

/** Flatten parts (or legacy stages) into ordered chapter plans for Kapitel-Erzeugung. */
export function flattenMakroChapterPlans(makro: SachbuchMakro): Array<{
  key: string;
  partId: string;
  partTitle: string;
  title: string;
  promise: string;
  notes: string;
}> {
  const fromParts = makro.parts.flatMap((part) =>
    part.chapters.map((ch) => ({
      key: makroChapterLinkKey(part.id, ch.id),
      partId: part.id,
      partTitle: part.title,
      title: ch.title,
      promise: ch.promise,
      notes: ch.notes,
    })),
  );
  if (fromParts.length > 0) return fromParts;

  return makro.stages.map((stage) => ({
    key: stage.key,
    partId: stage.key,
    partTitle: SACHBUCH_MAKRO_STAGE_LABELS[stage.key] ?? stage.key,
    title: stage.title,
    promise: stage.promise,
    notes: stage.notes,
  }));
}

/** Total planned chapters (parts preferred). */
export function makroPlannedKapitelCount(makro: SachbuchMakro): number {
  return flattenMakroChapterPlans(makro).length;
}
