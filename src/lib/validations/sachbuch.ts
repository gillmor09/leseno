/**
 * Zod schemas for Sachbuch admin actions (phases 1–6).
 */

import { z } from "zod";
import "@/lib/validations/configure-zod";

/**
 * Rohkonzept briefing may hold a long pasted dossier (Astra etc.).
 * ~1M chars ≈ room for very long drafts; Verfeinerung trims for the model.
 */
export const SACHBUCH_BRIEFING_MAX_CHARS = 1_000_000;
/** These / UVP — shorter by design. */
export const SACHBUCH_OPINION_MAX_CHARS = 50_000;
/** Stored refine-log round payload (truncated dossier, not full briefing). */
export const SACHBUCH_REFINE_LOG_CONTENT_MAX_CHARS = 80_000;

const agentSlotSchema = z.object({
  modelSlug: z.string().trim().min(1).max(200),
  systemPrompt: z.string().max(50_000),
  googleSearch: z.boolean(),
});

export const sachbuchAgentsSchema = z.object({
  interviewer: agentSlotSchema,
  researcher: agentSlotSchema,
  architect: agentSlotSchema,
  writer: agentSlotSchema,
  critic: agentSlotSchema,
  stylist: agentSlotSchema,
});

const interviewMessageSchema = z.object({
  id: z.string().min(1).max(80),
  role: z.enum(["user", "assistant"]),
  content: z.string().max(50_000),
  createdAt: z.string().max(80),
});

const groundingSourceSchema = z.object({
  title: z.string().max(500),
  uri: z.string().max(2000),
});

const phaseStatusSchema = z.enum(["empty", "in_progress", "ready"]);

const makroTypSchema = z.enum(["journey", "erklaerung", "erzaehlung"]);

const makroStageKeySchema = z.enum([
  "status_quo",
  "paradigmenwechsel",
  "framework",
  "implementierung",
  "zukunft",
  "kontext",
  "kernidee",
  "vertiefung",
  "beispiele",
  "einordnung",
  "ausgang",
  "konflikt",
  "verlauf",
  "erkenntnis",
  "bedeutung",
]);

const guideStepSchema = z.enum([
  "concept",
  "refine",
  "book_type",
  "evidenz",
  "makro",
  "write",
  "manuscript",
  "herstellung",
  "export",
]);

const kapitelManuscriptSchema = z
  .object({
    draftText: z.string().max(200_000).default(""),
    improvedText: z.string().max(200_000).default(""),
    herstellungText: z.string().max(220_000).default(""),
    herstellungNotes: z.array(z.string().max(2000)).max(30).default([]),
    hergestelltAt: z.string().max(80).nullable().default(null),
    salesScore: z.number().int().min(1).max(10).nullable().default(null),
    scoreSummary: z.string().max(10_000).default(""),
    strengths: z.array(z.string().max(2000)).max(20).default([]),
    gaps: z.array(z.string().max(2000)).max(20).default([]),
    changeOrders: z.array(z.string().max(5000)).max(20).default([]),
    scoredAt: z.string().max(80).nullable().default(null),
    improvedAt: z.string().max(80).nullable().default(null),
    bookPassAppliedScoredAt: z.string().max(80).nullable().default(null),
    modelSlug: z.string().max(120).default(""),
  })
  .default({
    draftText: "",
    improvedText: "",
    herstellungText: "",
    herstellungNotes: [],
    hergestelltAt: null,
    salesScore: null,
    scoreSummary: "",
    strengths: [],
    gaps: [],
    changeOrders: [],
    scoredAt: null,
    improvedAt: null,
    bookPassAppliedScoredAt: null,
    modelSlug: "",
  });

const refineRoundSchema = z.object({
  round: z.number().int().min(1).max(20),
  role: z.enum(["haiku", "luna"]),
  content: z.string().max(SACHBUCH_REFINE_LOG_CONTENT_MAX_CHARS),
  passed: z.boolean().nullable(),
  changeOrders: z.array(z.string().max(5000)).max(50),
  createdAt: z.string().max(80),
});

export const sachbuchIdeeSchema = z.object({
  interviewMessages: z.array(interviewMessageSchema).max(500),
  briefing: z.string().max(SACHBUCH_BRIEFING_MAX_CHARS),
  unpopularOpinion: z.string().max(SACHBUCH_OPINION_MAX_CHARS),
  caseStudies: z.array(z.string().max(5000)).max(50),
  status: phaseStatusSchema,
  guide: z
    .object({
      currentStep: guideStepSchema,
      ideaApprovedAt: z.string().max(80).nullable(),
      writeApprovedAt: z.string().max(80).nullable().default(null),
    })
    .default({
      currentStep: "concept",
      ideaApprovedAt: null,
      writeApprovedAt: null,
    }),
  refineStatus: z
    .enum(["idle", "running", "awaiting_approval", "approved"])
    .default("idle"),
  refineLog: z.array(refineRoundSchema).max(40).default([]),
  refinedBriefing: z.string().max(SACHBUCH_BRIEFING_MAX_CHARS).default(""),
  refinedOpinion: z.string().max(SACHBUCH_OPINION_MAX_CHARS).default(""),
  refinedCaseStudies: z.array(z.string().max(5000)).max(50).default([]),
  manuscriptReview: z
    .object({
      salesScore: z.number().int().min(1).max(10).nullable().default(null),
      scoreSummary: z.string().max(20_000).default(""),
      strengths: z.array(z.string().max(2000)).max(20).default([]),
      gaps: z.array(z.string().max(2000)).max(20).default([]),
      changeOrders: z.array(z.string().max(2000)).max(20).default([]),
      scoredAt: z.string().max(80).nullable().default(null),
      modelSlug: z.string().max(120).default(""),
    })
    .default({
      salesScore: null,
      scoreSummary: "",
      strengths: [],
      gaps: [],
      changeOrders: [],
      scoredAt: null,
      modelSlug: "",
    }),
  herstellungReview: z
    .object({
      summary: z.string().max(20_000).default(""),
      decisions: z.array(z.string().max(2000)).max(40).default([]),
      preparedAt: z.string().max(80).nullable().default(null),
      modelSlug: z.string().max(120).default(""),
    })
    .default({
      summary: "",
      decisions: [],
      preparedAt: null,
      modelSlug: "",
    }),
  /** `compact` skips Rohkonzept … Schreiben and condenses a source manuscript. */
  edition: z.enum(["full", "compact", "teaser"]).default("full"),
  sourceBookId: z.string().uuid().nullable().default(null),
  sourceBookTitle: z.string().max(300).default(""),
  /** Hörbuch tracks/prefs — validated lightly; full parse in `parseSachbuchHoerbuchState`. */
  hoerbuch: z
    .object({
      voiceId: z.string().max(120).default("Kore"),
      style: z.string().max(500).default(""),
      tracks: z.array(z.record(z.string(), z.unknown())).max(500).default([]),
      sample: z.record(z.string(), z.unknown()).nullable().default(null),
      tracksBuiltAt: z.string().max(80).nullable().default(null),
    })
    .passthrough()
    .default({
      voiceId: "Kore",
      style: "",
      tracks: [],
      sample: null,
      tracksBuiltAt: null,
    }),
});

export const sachbuchEvidenzSchema = z.object({
  queries: z.array(z.string().max(500)).max(50),
  claims: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        claim: z.string().max(5000),
        evidence: z.string().max(10_000),
        counter: z.string().max(10_000),
        sources: z.array(groundingSourceSchema).max(20),
      }),
    )
    .max(100),
  status: phaseStatusSchema,
});

const makroChapterPlanSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().max(500),
  promise: z.string().max(10_000),
  notes: z.string().max(20_000),
});

const makroPartSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().max(500),
  promise: z.string().max(10_000),
  chapters: z.array(makroChapterPlanSchema).min(1).max(12),
});

export const sachbuchMakroSchema = z.object({
  typ: makroTypSchema.default("journey"),
  stages: z
    .array(
      z.object({
        key: makroStageKeySchema,
        title: z.string().max(500),
        promise: z.string().max(10_000),
        notes: z.string().max(20_000),
      }),
    )
    .max(10),
  /** Flexible Buchteile → Kapitel (preferred). Empty = legacy stages only. */
  parts: z.array(makroPartSchema).max(8).default([]),
  status: phaseStatusSchema,
  kapitelGenerated: z.boolean(),
  bookTypeId: z.string().max(120).default(""),
});

const contextGraphSchema = z.object({
  readerKnowledge: z.string().max(20_000),
  establishedTerms: z.array(z.string().max(200)).max(100),
  claimsToProve: z.array(z.string().max(2000)).max(50),
  dependsOnKapitelIds: z.array(z.string().uuid()).max(50),
});

const abschnittRevisionSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["checkpoint", "critic", "style"]),
  label: z.string().max(80),
  summary: z.string().max(10_000),
  beforeText: z.string().max(50_000),
  afterText: z.string().max(50_000),
  meta: z.string().max(50_000),
  createdAt: z.string().max(80),
});

const abschnittSchema = z.object({
  id: z.string().uuid(),
  order: z.number().int().min(0).max(500),
  promptBrief: z.string().max(10_000),
  draftText: z.string().max(50_000),
  authorCheckpoint: z.string().max(5000),
  authorReply: z.string().max(20_000),
  status: z.enum(["draft", "checkpoint", "accepted", "revised"]),
  revisions: z.array(abschnittRevisionSchema).max(50).default([]),
});

export const sachbuchKapitelSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(500),
  goals: z.string().max(20_000),
  /** Legacy stage key or `partId__chapterId` from flexible parts. */
  makroStageKey: z.string().max(120).nullable(),
  /** Primary source chapter when this book is a compact edition. */
  sourceKapitelId: z.string().uuid().nullable().optional().default(null),
  /** Bundled Hauptband chapters (compact); empty → fall back to sourceKapitelId. */
  sourceKapitelIds: z.array(z.string().uuid()).max(40).optional().default([]),
  contextGraph: contextGraphSchema,
  abschnitte: z.array(abschnittSchema).max(200),
  interviewMessages: z.array(interviewMessageSchema).max(500),
  interviewBriefing: z.string().max(50_000),
  draftPass1: z.string().max(200_000),
  critiquePass2: z.string().max(100_000),
  finalText: z.string().max(200_000),
  groundingSources: z.array(groundingSourceSchema).max(50),
  manuscript: kapitelManuscriptSchema,
  infografikDataUrl: z
    .string()
    .max(12_000_000)
    .nullable()
    .optional()
    .default(null),
  infografikTitle: z.string().max(300).optional().default(""),
  infografikPrompt: z.string().max(20_000).optional().default(""),
  infografiken: z
    .array(
      z.object({
        key: z.string().max(80).optional(),
        title: z.string().max(300),
        dataUrl: z.string().max(12_000_000),
        prompt: z.string().max(20_000).optional().default(""),
      }),
    )
    .max(20)
    .optional()
    .default([]),
  status: z.enum([
    "draft",
    "graph",
    "writing",
    "generating",
    "ready",
    "error",
  ]),
  generationJobId: z.string().uuid().nullable(),
  generationProgress: z.string().max(500).nullable(),
  generationError: z.string().max(2000).nullable(),
  updatedAt: z.string().max(80),
});

export const sachbuchUpsertSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(300),
  stilbibel: z.string().max(100_000),
  zielgruppe: z.string().max(5000),
  agents: sachbuchAgentsSchema,
  idee: sachbuchIdeeSchema,
  evidenz: sachbuchEvidenzSchema,
  makro: sachbuchMakroSchema,
  kapitel: z.array(sachbuchKapitelSchema).max(200),
});

export const sachbuchIdSchema = z.object({
  id: z.string().uuid(),
});

/** Greenfield create: ready idea (paste) or interview (develop on dashboard). */
export const sachbuchCreateSchema = z.object({
  title: z.string().trim().max(300).optional(),
  ideaMode: z.enum(["ready", "interview"]).default("ready"),
  highConceptIdea: z.string().max(100_000).optional(),
  /**
   * Optional override — normally empty; typ is suggested from Idee later.
   * @deprecated prefer empty at create
   */
  bookTypeId: z.string().trim().max(120).optional(),
  /** Optional book shape; usually follows confirmed book type. */
  buchArt: makroTypSchema.optional(),
});

export const sachbuchApplyBookTypeSchema = z.object({
  sachbuchId: z.string().uuid(),
  bookTypeId: z.string().trim().min(1).max(120),
});

export const sachbuchIdeeTurnSchema = z.object({
  sachbuchId: z.string().uuid(),
  userText: z.string().trim().min(1).max(20_000),
});

export const sachbuchKapitelRefSchema = z.object({
  sachbuchId: z.string().uuid(),
  kapitelId: z.string().uuid(),
});

export const sachbuchAbschnittReplySchema = z.object({
  sachbuchId: z.string().uuid(),
  kapitelId: z.string().uuid(),
  abschnittId: z.string().uuid(),
  reply: z.string().trim().min(1).max(20_000),
  /** When true, rewrite section with author reply; else accept as-is. */
  revise: z.boolean().optional().default(false),
});

export const sachbuchGenerateSchema = z.object({
  sachbuchId: z.string().uuid(),
  kapitelId: z.string().uuid(),
  fromPass: z.enum(["1", "2", "3"]).optional().default("2"),
});

export function firstSachbuchZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Ungültige Eingabe.";
}
