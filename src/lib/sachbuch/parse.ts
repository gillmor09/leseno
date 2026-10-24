/**
 * Parse / normalize Sachbuch JSON from DB rows (phases 1–6).
 */

import { defaultSachbuchAgents } from "@/lib/sachbuch/agent-defaults";
import {
  emptyVorsatz,
  parseVorsatzJson,
  ROMAN_DEFAULT_AUTHOR,
} from "@/lib/roman/front-matter";
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
  SachbuchExport,
  SachbuchGroundingSource,
  SachbuchIdee,
  SachbuchInterviewMessage,
  SachbuchKapitel,
  SachbuchKapitelManuscript,
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
  SACHBUCH_GUIDE_STEPS,
  SACHBUCH_KEYWORD_COUNT,
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

function emptyGuide(): SachbuchIdee["guide"] {
  return {
    currentStep: "concept",
    ideaApprovedAt: null,
    writeApprovedAt: null,
  };
}

export function emptySachbuchKapitelManuscript(): SachbuchKapitelManuscript {
  return {
    draftText: "",
    improvedText: "",
    salesScore: null,
    scoreSummary: "",
    strengths: [],
    gaps: [],
    changeOrders: [],
    scoredAt: null,
    improvedAt: null,
    modelSlug: "",
  };
}

function parseKapitelManuscript(raw: unknown): SachbuchKapitelManuscript {
  const row = asRecord(raw);
  const empty = emptySachbuchKapitelManuscript();
  const scoreRaw = row.salesScore;
  const salesScore =
    typeof scoreRaw === "number" && Number.isFinite(scoreRaw)
      ? Math.max(1, Math.min(10, Math.round(scoreRaw)))
      : null;
  return {
    draftText: typeof row.draftText === "string" ? row.draftText : empty.draftText,
    improvedText:
      typeof row.improvedText === "string" ? row.improvedText : empty.improvedText,
    salesScore,
    scoreSummary:
      typeof row.scoreSummary === "string" ? row.scoreSummary : empty.scoreSummary,
    strengths: parseStringList(row.strengths),
    gaps: parseStringList(row.gaps),
    changeOrders: parseStringList(row.changeOrders),
    scoredAt:
      typeof row.scoredAt === "string" && row.scoredAt.trim()
        ? row.scoredAt.trim()
        : null,
    improvedAt:
      typeof row.improvedAt === "string" && row.improvedAt.trim()
        ? row.improvedAt.trim()
        : null,
    modelSlug:
      typeof row.modelSlug === "string" ? row.modelSlug.trim() : empty.modelSlug,
  };
}

export function emptySachbuchIdee(): SachbuchIdee {
  return {
    interviewMessages: [],
    briefing: "",
    unpopularOpinion: "",
    caseStudies: [],
    status: "empty",
    guide: emptyGuide(),
    refineStatus: "idle",
    refineLog: [],
    refinedBriefing: "",
    refinedOpinion: "",
    refinedCaseStudies: [],
  };
}

function parseGuideStep(raw: unknown): SachbuchIdee["guide"]["currentStep"] {
  if (
    typeof raw === "string" &&
    (SACHBUCH_GUIDE_STEPS as readonly string[]).includes(raw)
  ) {
    return raw as SachbuchIdee["guide"]["currentStep"];
  }
  return "concept";
}

export function emptySachbuchExport(): SachbuchExport {
  return {
    suggestedTitle: "",
    subtitle: "",
    summary: "",
    keywords: [],
    autorName: ROMAN_DEFAULT_AUTHOR,
    vorsatz: emptyVorsatz(),
    coverImageDataUrl: "",
    coverPrompt: "",
  };
}

export function parseSachbuchExport(row: {
  suggested_title?: unknown;
  subtitle?: unknown;
  summary?: unknown;
  keywords?: unknown;
  autor_name?: unknown;
  vorsatz?: unknown;
  cover_image_data_url?: unknown;
  cover_prompt?: unknown;
}): SachbuchExport {
  const base = emptySachbuchExport();
  const keywordsRaw = Array.isArray(row.keywords) ? row.keywords : [];
  const keywords = keywordsRaw
    .map((k) => String(k).trim())
    .filter(Boolean)
    .slice(0, SACHBUCH_KEYWORD_COUNT);
  return {
    suggestedTitle: String(row.suggested_title ?? "").trim(),
    subtitle: String(row.subtitle ?? "").trim(),
    summary: String(row.summary ?? "").trim(),
    keywords,
    autorName:
      String(row.autor_name ?? "").trim() || ROMAN_DEFAULT_AUTHOR,
    vorsatz: parseVorsatzJson(row.vorsatz ?? {}),
    coverImageDataUrl: String(row.cover_image_data_url ?? "").trim(),
    coverPrompt: String(row.cover_prompt ?? "").trim(),
  };
}

function parseRefineStatus(raw: unknown): SachbuchIdee["refineStatus"] {
  if (
    raw === "idle" ||
    raw === "running" ||
    raw === "awaiting_approval" ||
    raw === "approved"
  ) {
    return raw;
  }
  return "idle";
}

function parseRefineRound(raw: unknown): SachbuchIdee["refineLog"][number] | null {
  const row = asRecord(raw);
  const round = typeof row.round === "number" ? row.round : Number(row.round);
  if (!Number.isFinite(round) || round < 1) return null;
  const role = row.role === "luna" ? "luna" : "haiku";
  return {
    round: Math.floor(round),
    role,
    content: typeof row.content === "string" ? row.content : "",
    passed:
      row.passed === true ? true : row.passed === false ? false : null,
    changeOrders: parseStringList(row.changeOrders),
    createdAt:
      typeof row.createdAt === "string" && row.createdAt
        ? row.createdAt
        : new Date().toISOString(),
  };
}

export function parseSachbuchIdee(raw: unknown): SachbuchIdee {
  const row = asRecord(raw);
  const empty = emptySachbuchIdee();
  const guideRaw = asRecord(row.guide);
  const logRaw = Array.isArray(row.refineLog) ? row.refineLog : [];
  return {
    interviewMessages: parseMessages(row.interviewMessages),
    briefing: typeof row.briefing === "string" ? row.briefing : empty.briefing,
    unpopularOpinion:
      typeof row.unpopularOpinion === "string"
        ? row.unpopularOpinion
        : empty.unpopularOpinion,
    caseStudies: parseStringList(row.caseStudies),
    status: parsePhaseStatus(row.status),
    guide: {
      currentStep: parseGuideStep(guideRaw.currentStep ?? row.guideStep),
      ideaApprovedAt:
        typeof guideRaw.ideaApprovedAt === "string" &&
        guideRaw.ideaApprovedAt.trim()
          ? guideRaw.ideaApprovedAt.trim()
          : typeof row.ideaApprovedAt === "string" && row.ideaApprovedAt.trim()
            ? row.ideaApprovedAt.trim()
            : null,
      writeApprovedAt:
        typeof guideRaw.writeApprovedAt === "string" &&
        guideRaw.writeApprovedAt.trim()
          ? guideRaw.writeApprovedAt.trim()
          : null,
    },
    refineStatus: parseRefineStatus(row.refineStatus),
    refineLog: logRaw
      .map(parseRefineRound)
      .filter((r): r is SachbuchIdee["refineLog"][number] => Boolean(r)),
    refinedBriefing:
      typeof row.refinedBriefing === "string"
        ? row.refinedBriefing
        : empty.refinedBriefing,
    refinedOpinion:
      typeof row.refinedOpinion === "string"
        ? row.refinedOpinion
        : empty.refinedOpinion,
    refinedCaseStudies: parseStringList(row.refinedCaseStudies),
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
  bookTypeId = "",
): SachbuchMakro {
  return {
    typ,
    stages: emptyMakroStages(typ),
    status: "empty",
    kapitelGenerated: false,
    bookTypeId,
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
    bookTypeId:
      typeof row.bookTypeId === "string" ? row.bookTypeId.trim() : "",
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
    manuscript: parseKapitelManuscript(row.manuscript),
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
    manuscript: partial?.manuscript ?? emptySachbuchKapitelManuscript(),
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

/**
 * Strip Markdown/HTML artifacts so Manuskript/Export is book-ready prose.
 * Removes # ## ###, **, *, backticks, list markers — keeps the words.
 */
export function sanitizeSachbuchBookProse(text: string): string {
  let t = text.replace(/\r\n/g, "\n").trim();
  // Fenced code blocks
  t = t.replace(/```[\s\S]*?```/g, "");
  t = t.replace(/^```(?:markdown|md|text)?\s*$/gim, "");
  // ATX headings (## Title / ##Title / lone ###)
  t = t.replace(/^#{1,6}\s*/gm, "");
  // Bold / italic (repeat until stable for nested **a *b* c**)
  for (let i = 0; i < 4; i++) {
    const prev = t;
    t = t.replace(/\*\*(.+?)\*\*/g, "$1");
    t = t.replace(/__(.+?)__/g, "$1");
    t = t.replace(/\*(.+?)\*/g, "$1");
    t = t.replace(/_(.+?)_/g, "$1");
    if (t === prev) break;
  }
  // Leftover emphasis / heading markers
  t = t.replace(/\*{1,3}/g, "");
  t = t.replace(/_{2,}/g, "");
  t = t.replace(/#{1,6}/g, "");
  // Inline code
  t = t.replace(/`+/g, "");
  // Markdown links → label
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // HTML tags
  t = t.replace(/<\/?[a-zA-Z][^>]*>/g, "");
  // Markdown list markers at line start → keep text
  t = t.replace(/^(\s*)[-*+]\s+/gm, "$1");
  t = t.replace(/^(\s*)\d+\.\s+/gm, "$1");
  // Collapse excess blank lines / spaces
  t = t.replace(/[ \t]+\n/g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/**
 * Best available chapter body for Manuskript/Export:
 * improved lektorat → frozen draft → Abschnitte → legacy finalText.
 * Always sanitized for print/ePub (no Markdown heading markers).
 */
export function sachbuchKapitelBodyText(kapitel: SachbuchKapitel): string {
  const improved = kapitel.manuscript.improvedText.trim();
  if (improved) return sanitizeSachbuchBookProse(improved);
  const draft = kapitel.manuscript.draftText.trim();
  if (draft) return sanitizeSachbuchBookProse(draft);
  const abschnitte = concatAbschnitteText(kapitel.abschnitte).trim();
  if (abschnitte) return sanitizeSachbuchBookProse(abschnitte);
  return sanitizeSachbuchBookProse(kapitel.finalText.trim());
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

/**
 * Mean Verkaufsreife over scored chapters (null if none scored yet).
 * Client-safe; used by Manuskript Gesamt-Score UI.
 */
export function sachbuchManuscriptOverallSalesScore(book: SachbuchKontext): {
  average: number | null;
  scoredCount: number;
  chapterCount: number;
} {
  const scores = book.kapitel
    .map((k) => k.manuscript.salesScore)
    .filter((s): s is number => typeof s === "number" && Number.isFinite(s));
  return {
    average:
      scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) /
          10
        : null,
    scoredCount: scores.length,
    chapterCount: book.kapitel.length,
  };
}

/**
 * Drop bulky revision before-snapshots for API/Action responses.
 * Keeps draftText + afterText + summary; avoids RSC/JSON stream blow-ups
 * once a book has many Abschnitte.
 */
export function slimSachbuchKontextForTransport(
  book: SachbuchKontext,
): SachbuchKontext {
  return {
    ...book,
    export: book.export ?? emptySachbuchExport(),
    kapitel: book.kapitel.map((k) => ({
      ...k,
      abschnitte: k.abschnitte.map((a) => ({
        ...a,
        revisions: (a.revisions ?? []).map((r) => ({
          ...r,
          beforeText: "",
        })),
      })),
    })),
  };
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
  suggested_title?: unknown;
  subtitle?: unknown;
  summary?: unknown;
  keywords?: unknown;
  autor_name?: unknown;
  vorsatz?: unknown;
  cover_image_data_url?: unknown;
  cover_prompt?: unknown;
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
    export: parseSachbuchExport(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
