/**
 * Parse / normalize Sachbuch JSON from DB rows (phases 1–6).
 */

import { defaultSachbuchAgents } from "@/lib/sachbuch/agent-defaults";
import type {
  SachbuchAbschnitt,
  SachbuchAbschnittRevision,
  SachbuchAbschnittRevisionKind,
  SachbuchAbschnittStatus,
  SachbuchAgentKey,
  SachbuchAgentSlot,
  SachbuchAgents,
  SachbuchContextGraph,
  SachbuchEvidenz,
  SachbuchEvidenzClaim,
  SachbuchGroundingSource,
  SachbuchIdee,
  SachbuchInterviewMessage,
  SachbuchKapitel,
  SachbuchKapitelStatus,
  SachbuchKontext,
  SachbuchMakro,
  SachbuchMakroStage,
  SachbuchMakroStageKey,
  SachbuchMakroTyp,
  SachbuchPhaseStatus,
} from "@/lib/sachbuch/types";
import {
  SACHBUCH_ABSCHNITT_REVISION_KIND_LABELS,
  SACHBUCH_MAKRO_STAGE_KEYS,
  SACHBUCH_MAKRO_STAGE_LABELS,
  emptyMakroStages,
  makroStageKeysForTyp,
} from "@/lib/sachbuch/types";

const AGENT_KEYS: SachbuchAgentKey[] = [
  "interviewer",
  "researcher",
  "architect",
  "writer",
  "critic",
  "stylist",
];

const KAPITEL_STATUS = new Set<SachbuchKapitelStatus>([
  "draft",
  "graph",
  "writing",
  "generating",
  "ready",
  "error",
]);

const PHASE_STATUS = new Set<SachbuchPhaseStatus>([
  "empty",
  "in_progress",
  "ready",
]);

const ABSCHNITT_STATUS = new Set<SachbuchAbschnittStatus>([
  "draft",
  "checkpoint",
  "accepted",
  "revised",
]);

const REVISION_KINDS = new Set<SachbuchAbschnittRevisionKind>([
  "checkpoint",
  "critic",
  "style",
]);

const STAGE_KEY_SET = new Set<string>(SACHBUCH_MAKRO_STAGE_KEYS);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseSlot(
  raw: unknown,
  fallback: SachbuchAgentSlot,
): SachbuchAgentSlot {
  const row = asRecord(raw);
  return {
    modelSlug:
      typeof row.modelSlug === "string" && row.modelSlug.trim()
        ? row.modelSlug.trim()
        : fallback.modelSlug,
    systemPrompt:
      typeof row.systemPrompt === "string"
        ? row.systemPrompt
        : fallback.systemPrompt,
    googleSearch:
      typeof row.googleSearch === "boolean"
        ? row.googleSearch
        : fallback.googleSearch,
  };
}

export function parseSachbuchAgents(raw: unknown): SachbuchAgents {
  const defaults = defaultSachbuchAgents();
  const row = asRecord(raw);
  const out = { ...defaults };
  for (const key of AGENT_KEYS) {
    out[key] = parseSlot(row[key], defaults[key]);
  }
  return out;
}

function parseMessage(raw: unknown): SachbuchInterviewMessage | null {
  const row = asRecord(raw);
  const role =
    row.role === "assistant"
      ? "assistant"
      : row.role === "user"
        ? "user"
        : null;
  if (!role) return null;
  return {
    id:
      typeof row.id === "string" && row.id.trim()
        ? row.id
        : crypto.randomUUID(),
    role,
    content: typeof row.content === "string" ? row.content : "",
    createdAt:
      typeof row.createdAt === "string" && row.createdAt
        ? row.createdAt
        : new Date().toISOString(),
  };
}

function parseMessages(raw: unknown): SachbuchInterviewMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(parseMessage)
    .filter((m): m is SachbuchInterviewMessage => Boolean(m));
}

function parseSources(raw: unknown): SachbuchGroundingSource[] {
  if (!Array.isArray(raw)) return [];
  const out: SachbuchGroundingSource[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const uri = typeof row.uri === "string" ? row.uri.trim() : "";
    if (title || uri) out.push({ title: title || uri, uri });
  }
  return out;
}

function parsePhaseStatus(raw: unknown): SachbuchPhaseStatus {
  return typeof raw === "string" && PHASE_STATUS.has(raw as SachbuchPhaseStatus)
    ? (raw as SachbuchPhaseStatus)
    : "empty";
}

function parseStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function emptySachbuchIdee(): SachbuchIdee {
  return {
    interviewMessages: [],
    briefing: "",
    unpopularOpinion: "",
    caseStudies: [],
    status: "empty",
  };
}

export function parseSachbuchIdee(raw: unknown): SachbuchIdee {
  const row = asRecord(raw);
  const empty = emptySachbuchIdee();
  return {
    interviewMessages: parseMessages(row.interviewMessages),
    briefing: typeof row.briefing === "string" ? row.briefing : empty.briefing,
    unpopularOpinion:
      typeof row.unpopularOpinion === "string"
        ? row.unpopularOpinion
        : empty.unpopularOpinion,
    caseStudies: parseStringList(row.caseStudies),
    status: parsePhaseStatus(row.status),
  };
}

export function emptySachbuchEvidenz(): SachbuchEvidenz {
  return { queries: [], claims: [], status: "empty" };
}

function parseClaim(raw: unknown): SachbuchEvidenzClaim | null {
  const row = asRecord(raw);
  const id =
    typeof row.id === "string" && row.id.trim()
      ? row.id.trim()
      : crypto.randomUUID();
  return {
    id,
    claim: typeof row.claim === "string" ? row.claim : "",
    evidence: typeof row.evidence === "string" ? row.evidence : "",
    counter: typeof row.counter === "string" ? row.counter : "",
    sources: parseSources(row.sources),
  };
}

export function parseSachbuchEvidenz(raw: unknown): SachbuchEvidenz {
  const row = asRecord(raw);
  const claimsRaw = Array.isArray(row.claims) ? row.claims : [];
  return {
    queries: parseStringList(row.queries),
    claims: claimsRaw
      .map(parseClaim)
      .filter((c): c is SachbuchEvidenzClaim => Boolean(c)),
    status: parsePhaseStatus(row.status),
  };
}

export function emptySachbuchMakro(
  typ: SachbuchMakroTyp = "journey",
): SachbuchMakro {
  return {
    typ,
    stages: emptyMakroStages(typ),
    status: "empty",
    kapitelGenerated: false,
  };
}

function parseMakroTyp(raw: unknown): SachbuchMakroTyp {
  if (raw === "erklaerung" || raw === "erzaehlung") return raw;
  return "journey";
}

function parseStage(raw: unknown): SachbuchMakroStage | null {
  const row = asRecord(raw);
  const key =
    typeof row.key === "string" && STAGE_KEY_SET.has(row.key)
      ? (row.key as SachbuchMakroStageKey)
      : null;
  if (!key) return null;
  return {
    key,
    title:
      typeof row.title === "string" && row.title.trim()
        ? row.title
        : SACHBUCH_MAKRO_STAGE_LABELS[key],
    promise: typeof row.promise === "string" ? row.promise : "",
    notes: typeof row.notes === "string" ? row.notes : "",
  };
}

export function parseSachbuchMakro(raw: unknown): SachbuchMakro {
  const row = asRecord(raw);
  const typ = parseMakroTyp(row.typ);
  const keys = makroStageKeysForTyp(typ);
  const stagesRaw = Array.isArray(row.stages) ? row.stages : [];
  const parsed = stagesRaw
    .map(parseStage)
    .filter((s): s is SachbuchMakroStage => Boolean(s));
  const byKey = new Map(parsed.map((s) => [s.key, s]));
  return {
    typ,
    stages: keys.map(
      (key) =>
        byKey.get(key) ?? {
          key,
          title: SACHBUCH_MAKRO_STAGE_LABELS[key],
          promise: "",
          notes: "",
        },
    ),
    status: parsePhaseStatus(row.status),
    kapitelGenerated: Boolean(row.kapitelGenerated),
  };
}

export function emptyContextGraph(): SachbuchContextGraph {
  return {
    readerKnowledge: "",
    establishedTerms: [],
    claimsToProve: [],
    dependsOnKapitelIds: [],
  };
}

function parseContextGraph(raw: unknown): SachbuchContextGraph {
  const row = asRecord(raw);
  return {
    readerKnowledge:
      typeof row.readerKnowledge === "string" ? row.readerKnowledge : "",
    establishedTerms: parseStringList(row.establishedTerms),
    claimsToProve: parseStringList(row.claimsToProve),
    dependsOnKapitelIds: parseStringList(row.dependsOnKapitelIds),
  };
}

function parseAbschnittRevision(raw: unknown): SachbuchAbschnittRevision | null {
  const row = asRecord(raw);
  const id =
    typeof row.id === "string" && row.id.trim() ? row.id.trim() : null;
  if (!id) return null;
  const kind =
    typeof row.kind === "string" &&
    REVISION_KINDS.has(row.kind as SachbuchAbschnittRevisionKind)
      ? (row.kind as SachbuchAbschnittRevisionKind)
      : null;
  if (!kind) return null;
  return {
    id,
    kind,
    label:
      typeof row.label === "string" && row.label.trim()
        ? row.label.trim()
        : SACHBUCH_ABSCHNITT_REVISION_KIND_LABELS[kind],
    summary: typeof row.summary === "string" ? row.summary : "",
    beforeText: typeof row.beforeText === "string" ? row.beforeText : "",
    afterText: typeof row.afterText === "string" ? row.afterText : "",
    meta: typeof row.meta === "string" ? row.meta : "",
    createdAt:
      typeof row.createdAt === "string" && row.createdAt.trim()
        ? row.createdAt
        : new Date(0).toISOString(),
  };
}

function parseAbschnitt(raw: unknown): SachbuchAbschnitt | null {
  const row = asRecord(raw);
  const id =
    typeof row.id === "string" && row.id.trim() ? row.id.trim() : null;
  if (!id) return null;
  const status =
    typeof row.status === "string" &&
    ABSCHNITT_STATUS.has(row.status as SachbuchAbschnittStatus)
      ? (row.status as SachbuchAbschnittStatus)
      : "draft";
  const revisionsRaw = Array.isArray(row.revisions) ? row.revisions : [];
  return {
    id,
    order: typeof row.order === "number" ? row.order : 0,
    promptBrief: typeof row.promptBrief === "string" ? row.promptBrief : "",
    draftText: typeof row.draftText === "string" ? row.draftText : "",
    authorCheckpoint:
      typeof row.authorCheckpoint === "string" ? row.authorCheckpoint : "",
    authorReply: typeof row.authorReply === "string" ? row.authorReply : "",
    status,
    revisions: revisionsRaw
      .map(parseAbschnittRevision)
      .filter((r): r is SachbuchAbschnittRevision => Boolean(r)),
  };
}

function parseKapitelStatus(raw: unknown): SachbuchKapitelStatus {
  // Migrate legacy "interview" → draft
  if (raw === "interview") return "draft";
  return typeof raw === "string" && KAPITEL_STATUS.has(raw as SachbuchKapitelStatus)
    ? (raw as SachbuchKapitelStatus)
    : "draft";
}

export function parseSachbuchKapitel(raw: unknown): SachbuchKapitel | null {
  const row = asRecord(raw);
  const id =
    typeof row.id === "string" && row.id.trim() ? row.id.trim() : null;
  if (!id) return null;
  const makroStageKey =
    typeof row.makroStageKey === "string" &&
    STAGE_KEY_SET.has(row.makroStageKey)
      ? (row.makroStageKey as SachbuchMakroStageKey)
      : null;
  const abschnitteRaw = Array.isArray(row.abschnitte) ? row.abschnitte : [];
  return {
    id,
    title: typeof row.title === "string" ? row.title : "",
    goals: typeof row.goals === "string" ? row.goals : "",
    makroStageKey,
    contextGraph: parseContextGraph(row.contextGraph),
    abschnitte: abschnitteRaw
      .map(parseAbschnitt)
      .filter((a): a is SachbuchAbschnitt => Boolean(a))
      .sort((a, b) => a.order - b.order),
    interviewMessages: parseMessages(row.interviewMessages),
    interviewBriefing:
      typeof row.interviewBriefing === "string" ? row.interviewBriefing : "",
    draftPass1: typeof row.draftPass1 === "string" ? row.draftPass1 : "",
    critiquePass2:
      typeof row.critiquePass2 === "string" ? row.critiquePass2 : "",
    finalText: typeof row.finalText === "string" ? row.finalText : "",
    groundingSources: parseSources(row.groundingSources),
    status: parseKapitelStatus(row.status),
    generationJobId:
      typeof row.generationJobId === "string" && row.generationJobId
        ? row.generationJobId
        : null,
    generationProgress:
      typeof row.generationProgress === "string"
        ? row.generationProgress
        : null,
    generationError:
      typeof row.generationError === "string" ? row.generationError : null,
    updatedAt:
      typeof row.updatedAt === "string" && row.updatedAt
        ? row.updatedAt
        : new Date().toISOString(),
  };
}

export function parseSachbuchKapitelList(raw: unknown): SachbuchKapitel[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(parseSachbuchKapitel)
    .filter((k): k is SachbuchKapitel => Boolean(k));
}

export function emptySachbuchKapitel(
  partial?: Partial<SachbuchKapitel>,
): SachbuchKapitel {
  return {
    id: partial?.id ?? crypto.randomUUID(),
    title: partial?.title ?? "Neues Kapitel",
    goals: partial?.goals ?? "",
    makroStageKey: partial?.makroStageKey ?? null,
    contextGraph: partial?.contextGraph ?? emptyContextGraph(),
    abschnitte: partial?.abschnitte ?? [],
    interviewMessages: partial?.interviewMessages ?? [],
    interviewBriefing: partial?.interviewBriefing ?? "",
    draftPass1: partial?.draftPass1 ?? "",
    critiquePass2: partial?.critiquePass2 ?? "",
    finalText: partial?.finalText ?? "",
    groundingSources: partial?.groundingSources ?? [],
    status: partial?.status ?? "draft",
    generationJobId: partial?.generationJobId ?? null,
    generationProgress: partial?.generationProgress ?? null,
    generationError: partial?.generationError ?? null,
    updatedAt: partial?.updatedAt ?? new Date().toISOString(),
  };
}

/** Concat accepted/revised section drafts into chapter finalText. */
export function concatAbschnitteText(abschnitte: SachbuchAbschnitt[]): string {
  return abschnitte
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((a) => a.draftText.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Whitespace-separated word count (German prose). */
export function countSachbuchWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

/** Sum of Abschnitt draft word counts for one chapter. */
export function countKapitelAbschnitteWords(
  abschnitte: SachbuchAbschnitt[],
): number {
  return abschnitte.reduce(
    (sum, a) => sum + countSachbuchWords(a.draftText),
    0,
  );
}

export function mapSachbuchRow(row: {
  id: string;
  title: string;
  stilbibel: string;
  zielgruppe?: string;
  agents: unknown;
  kapitel: unknown;
  idee?: unknown;
  evidenz?: unknown;
  makro?: unknown;
  created_at: string;
  updated_at: string;
}): SachbuchKontext {
  return {
    id: row.id,
    title: row.title ?? "",
    stilbibel: row.stilbibel ?? "",
    zielgruppe: row.zielgruppe ?? "",
    agents: parseSachbuchAgents(row.agents),
    idee: parseSachbuchIdee(row.idee),
    evidenz: parseSachbuchEvidenz(row.evidenz),
    makro: parseSachbuchMakro(row.makro),
    kapitel: parseSachbuchKapitelList(row.kapitel),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
