/**
 * Zod schemas for Sachbuch admin actions (phases 1–6).
 */

import { z } from "zod";
import "@/lib/validations/configure-zod";

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

export const sachbuchIdeeSchema = z.object({
  interviewMessages: z.array(interviewMessageSchema).max(500),
  briefing: z.string().max(50_000),
  unpopularOpinion: z.string().max(20_000),
  caseStudies: z.array(z.string().max(5000)).max(50),
  status: phaseStatusSchema,
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
  status: phaseStatusSchema,
  kapitelGenerated: z.boolean(),
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
  makroStageKey: makroStageKeySchema.nullable(),
  contextGraph: contextGraphSchema,
  abschnitte: z.array(abschnittSchema).max(200),
  interviewMessages: z.array(interviewMessageSchema).max(500),
  interviewBriefing: z.string().max(50_000),
  draftPass1: z.string().max(200_000),
  critiquePass2: z.string().max(100_000),
  finalText: z.string().max(200_000),
  groundingSources: z.array(groundingSourceSchema).max(50),
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

export const sachbuchCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  buchArt: makroTypSchema.default("journey"),
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
