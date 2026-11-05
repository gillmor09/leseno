/**
 * Parse / normalize Sachbuch JSON from DB rows (phases 1–6).
 */

import { defaultSachbuchAgents } from "@/lib/sachbuch/agent-defaults";
import {
  emptyVorsatz,
  parseVorsatzJson,
} from "@/lib/roman/front-matter";
import {
  emptySachbuchHoerbuchState,
  parseSachbuchHoerbuchState,
  slimSachbuchHoerbuchState,
} from "@/lib/sachbuch/hoerbuch";
import { SACHBUCH_DEFAULT_AUTHOR } from "@/lib/sachbuch/impressum";
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
  SachbuchHerstellungBookReview,
  SachbuchIdee,
  SachbuchInterviewMessage,
  SachbuchKapitel,
  SachbuchKapitelInfografik,
  SachbuchKapitelManuscript,
  SachbuchKapitelStatus,
  SachbuchKontext,
  SachbuchManuscriptBookReview,
  SachbuchMakro,
  SachbuchMakroChapterPlan,
  SachbuchMakroPart,
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
  };
}

export function emptySachbuchManuscriptBookReview(): SachbuchManuscriptBookReview {
  return {
    salesScore: null,
    scoreSummary: "",
    strengths: [],
    gaps: [],
    changeOrders: [],
    scoredAt: null,
    modelSlug: "",
  };
}

export function emptySachbuchHerstellungBookReview(): SachbuchHerstellungBookReview {
  return {
    summary: "",
    decisions: [],
    preparedAt: null,
    modelSlug: "",
  };
}

function parseManuscriptBookReview(raw: unknown): SachbuchManuscriptBookReview {
  const row = asRecord(raw);
  const empty = emptySachbuchManuscriptBookReview();
  const scoreRaw = row.salesScore;
  const salesScore =
    typeof scoreRaw === "number" && Number.isFinite(scoreRaw)
      ? Math.max(1, Math.min(10, Math.round(scoreRaw)))
      : null;
  return {
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
    modelSlug:
      typeof row.modelSlug === "string" ? row.modelSlug.trim() : empty.modelSlug,
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
    herstellungText:
      typeof row.herstellungText === "string"
        ? row.herstellungText
        : empty.herstellungText,
    herstellungNotes: parseStringList(row.herstellungNotes),
    hergestelltAt:
      typeof row.hergestelltAt === "string" && row.hergestelltAt.trim()
        ? row.hergestelltAt.trim()
        : null,
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
    bookPassAppliedScoredAt:
      typeof row.bookPassAppliedScoredAt === "string" &&
      row.bookPassAppliedScoredAt.trim()
        ? row.bookPassAppliedScoredAt.trim()
        : null,
    modelSlug:
      typeof row.modelSlug === "string" ? row.modelSlug.trim() : empty.modelSlug,
  };
}

function parseHerstellungBookReview(raw: unknown): SachbuchHerstellungBookReview {
  const row = asRecord(raw);
  const empty = emptySachbuchHerstellungBookReview();
  return {
    summary: typeof row.summary === "string" ? row.summary : empty.summary,
    decisions: parseStringList(row.decisions),
    preparedAt:
      typeof row.preparedAt === "string" && row.preparedAt.trim()
        ? row.preparedAt.trim()
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
    manuscriptReview: emptySachbuchManuscriptBookReview(),
    herstellungReview: emptySachbuchHerstellungBookReview(),
    edition: "full",
    sourceBookId: null,
    sourceBookTitle: "",
    hoerbuch: emptySachbuchHoerbuchState(),
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
    autorName: SACHBUCH_DEFAULT_AUTHOR,
    vorsatz: emptyVorsatz(),
    coverImageDataUrl: "",
    coverPrompt: "",
    hasCoverImage: false,
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
  const coverRaw = String(row.cover_image_data_url ?? "").trim();
  /** Shell RPC sends a marker instead of multi-MB data URLs. */
  const coverIsMarker = coverRaw === "__has_cover__";
  const coverImageDataUrl = coverIsMarker ? "" : coverRaw;
  return {
    suggestedTitle: String(row.suggested_title ?? "").trim(),
    subtitle: String(row.subtitle ?? "").trim(),
    summary: String(row.summary ?? "").trim(),
    keywords,
    autorName:
      String(row.autor_name ?? "").trim() || SACHBUCH_DEFAULT_AUTHOR,
    vorsatz: parseVorsatzJson(row.vorsatz ?? {}),
    coverImageDataUrl,
    coverPrompt: String(row.cover_prompt ?? "").trim(),
    hasCoverImage:
      coverIsMarker || coverImageDataUrl.startsWith("data:image/"),
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
    manuscriptReview: parseManuscriptBookReview(row.manuscriptReview),
    herstellungReview: parseHerstellungBookReview(row.herstellungReview),
    edition:
      row.edition === "teaser"
        ? "teaser"
        : row.edition === "compact"
          ? "compact"
          : "full",
    sourceBookId:
      typeof row.sourceBookId === "string" && row.sourceBookId.trim()
        ? row.sourceBookId.trim()
        : null,
    sourceBookTitle:
      typeof row.sourceBookTitle === "string" ? row.sourceBookTitle.trim() : "",
    hoerbuch: parseSachbuchHoerbuchState(row.hoerbuch),
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
    parts: [],
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

function slugMakroId(raw: string, fallback: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return s || fallback;
}

function parseChapterPlan(
  raw: unknown,
  index: number,
): SachbuchMakroChapterPlan | null {
  const row = asRecord(raw);
  const title = typeof row.title === "string" ? row.title.trim() : "";
  if (!title) return null;
  const idRaw = typeof row.id === "string" ? row.id.trim() : "";
  return {
    id: slugMakroId(idRaw || `ch_${index + 1}`, `ch_${index + 1}`),
    title,
    promise: typeof row.promise === "string" ? row.promise : "",
    notes: typeof row.notes === "string" ? row.notes : "",
  };
}

function parseMakroPart(raw: unknown, index: number): SachbuchMakroPart | null {
  const row = asRecord(raw);
  const title = typeof row.title === "string" ? row.title.trim() : "";
  if (!title) return null;
  const idRaw = typeof row.id === "string" ? row.id.trim() : "";
  const chaptersRaw = Array.isArray(row.chapters) ? row.chapters : [];
  const chapters = chaptersRaw
    .map((c, i) => parseChapterPlan(c, i))
    .filter((c): c is SachbuchMakroChapterPlan => Boolean(c));
  if (chapters.length === 0) return null;
  return {
    id: slugMakroId(idRaw || `teil_${index + 1}`, `teil_${index + 1}`),
    title,
    promise: typeof row.promise === "string" ? row.promise : "",
    chapters,
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
  const partsRaw = Array.isArray(row.parts) ? row.parts : [];
  const parts = partsRaw
    .map((p, i) => parseMakroPart(p, i))
    .filter((p): p is SachbuchMakroPart => Boolean(p));
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
    parts,
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
    typeof row.makroStageKey === "string" && row.makroStageKey.trim()
      ? row.makroStageKey.trim().slice(0, 120)
      : null;
  const abschnitteRaw = Array.isArray(row.abschnitte) ? row.abschnitte : [];
  return {
    id,
    title: typeof row.title === "string" ? row.title : "",
    goals: typeof row.goals === "string" ? row.goals : "",
    makroStageKey,
    sourceKapitelId:
      typeof row.sourceKapitelId === "string" && row.sourceKapitelId.trim()
        ? row.sourceKapitelId.trim()
        : null,
    sourceKapitelIds: (() => {
      const fromArray = Array.isArray(row.sourceKapitelIds)
        ? row.sourceKapitelIds
            .filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
            .map((x) => x.trim())
        : [];
      if (fromArray.length > 0) return fromArray;
      const one =
        typeof row.sourceKapitelId === "string" && row.sourceKapitelId.trim()
          ? row.sourceKapitelId.trim()
          : null;
      return one ? [one] : [];
    })(),
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
    ...(() => {
      const legacyUrl =
        typeof row.infografikDataUrl === "string"
          ? row.infografikDataUrl.trim()
          : "";
      const legacyTitle =
        typeof row.infografikTitle === "string"
          ? row.infografikTitle.trim()
          : "";
      const legacyPrompt =
        typeof row.infografikPrompt === "string" ? row.infografikPrompt : "";
      const fromArray = Array.isArray(row.infografiken)
        ? row.infografiken
            .map((raw) => {
              if (!raw || typeof raw !== "object") return null;
              const r = raw as Record<string, unknown>;
              const dataUrl =
                typeof r.dataUrl === "string" ? r.dataUrl.trim() : "";
              if (!dataUrl.startsWith("data:image/")) return null;
              return {
                key:
                  typeof r.key === "string" && r.key.trim()
                    ? r.key.trim()
                    : undefined,
                title: typeof r.title === "string" ? r.title.trim() : "",
                dataUrl,
                prompt: typeof r.prompt === "string" ? r.prompt : "",
              };
            })
            .filter((x): x is NonNullable<typeof x> => Boolean(x))
        : [];
      const infografiken =
        fromArray.length > 0
          ? fromArray
          : legacyUrl.startsWith("data:image/")
            ? [
                {
                  title: legacyTitle,
                  dataUrl: legacyUrl,
                  prompt: legacyPrompt,
                },
              ]
            : [];
      const first = infografiken[0];
      return {
        infografiken,
        infografikDataUrl: first?.dataUrl ?? null,
        infografikTitle: first?.title ?? legacyTitle,
        infografikPrompt: first?.prompt ?? legacyPrompt,
      };
    })(),
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
    sourceKapitelId: partial?.sourceKapitelId ?? null,
    sourceKapitelIds: partial?.sourceKapitelIds ??
      (partial?.sourceKapitelId ? [partial.sourceKapitelId] : []),
    contextGraph: partial?.contextGraph ?? emptyContextGraph(),
    abschnitte: partial?.abschnitte ?? [],
    interviewMessages: partial?.interviewMessages ?? [],
    interviewBriefing: partial?.interviewBriefing ?? "",
    draftPass1: partial?.draftPass1 ?? "",
    critiquePass2: partial?.critiquePass2 ?? "",
    finalText: partial?.finalText ?? "",
    groundingSources: partial?.groundingSources ?? [],
    manuscript: partial?.manuscript ?? emptySachbuchKapitelManuscript(),
    infografikDataUrl: partial?.infografikDataUrl ?? null,
    infografikTitle: partial?.infografikTitle ?? "",
    infografikPrompt: partial?.infografikPrompt ?? "",
    infografiken: partial?.infografiken ?? [],
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
 * Best available chapter body for Manuskript UI / Lektorat:
 * improved lektorat → frozen draft → Abschnitte → legacy finalText.
 * Always sanitized (no Markdown). Does not prefer Herstellung markers.
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

/**
 * Chapter body for PDF/ePub: Herstellung (layout markers) → Lektorat → Draft.
 * Layout markers (`<<<H>>>` / `<<<BOX>>>`) are kept for the export engines.
 */
export function sachbuchKapitelExportBody(kapitel: SachbuchKapitel): string {
  const herstellung = kapitel.manuscript.herstellungText.trim();
  if (herstellung) return herstellung;
  return sachbuchKapitelBodyText(kapitel);
}

/** True when Haiku Herstellung has produced layout text for a chapter. */
export function sachbuchKapitelHasHerstellung(kapitel: SachbuchKapitel): boolean {
  // Full text after a hop, or hergestelltAt when slim transport stripped prose
  // (admin page / keepKapitelIds) — otherwise batch status collapses to 0/n.
  if (kapitel.manuscript.herstellungText.trim().length >= 200) return true;
  return Boolean(kapitel.manuscript.hergestelltAt?.trim());
}

/**
 * Resolved Infografik list for export / UI (array preferred, legacy single
 * as fallback). Client-safe — keep out of `infografik.ts` (Node canvas).
 */
export function sachbuchKapitelInfografiken(
  kapitel: SachbuchKapitel,
): SachbuchKapitelInfografik[] {
  const fromArray = (kapitel.infografiken ?? []).filter((i) =>
    i.dataUrl.trim().startsWith("data:image/"),
  );
  if (fromArray.length) return fromArray;
  const u = (kapitel.infografikDataUrl ?? "").trim();
  if (!u.startsWith("data:image/")) return [];
  return [
    {
      title: kapitel.infografikTitle?.trim() || "",
      dataUrl: u,
      prompt: kapitel.infografikPrompt ?? "",
    },
  ];
}

/** True when a chapter has a usable Infografik for export. */
export function sachbuchKapitelHasInfografik(kapitel: SachbuchKapitel): boolean {
  return sachbuchKapitelInfografiken(kapitel).length > 0;
}

/** Slot count for admin chips (includes slim stubs without pixels). */
export function sachbuchKapitelInfografikSlotCount(
  kapitel: SachbuchKapitel,
): number {
  const list = kapitel.infografiken ?? [];
  if (list.length) {
    return list.filter(
      (i) =>
        Boolean(i.key?.trim()) ||
        Boolean(i.title?.trim()) ||
        i.dataUrl?.trim().startsWith("data:image/"),
    ).length;
  }
  return kapitel.infografikDataUrl?.trim().startsWith("data:image/") ? 1 : 0;
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

/** Min words for a chapter to count as already lektoriert. */
export const SACHBUCH_MANUSCRIPT_IMPROVED_MIN_WORDS = 400;

/**
 * Whether a Buch-Change-Order / Lücke likely applies to chapter `index1` (1-based).
 * Client-safe — shared by server improve + UI hop skip.
 */
export function sachbuchBookCritiqueAppliesToChapter(
  text: string,
  chapterIndex1: number,
): boolean {
  const mentions = [
    ...text.matchAll(/\b[Kk]apitel\s*(\d+)\b/g),
    ...text.matchAll(/\bKap\.?\s*(\d+)\b/g),
  ].map((m) => Number(m[1]));
  if (mentions.length === 0) return true;
  return mentions.includes(chapterIndex1);
}

/**
 * True when a critique line demands finished layout/graphics — that belongs to
 * Herstellung (step 8), not Manuskript scoring. Placeholders in prose are intentional.
 */
export function isSachbuchHerstellungLayoutCritique(line: string): boolean {
  return /Platzhalter|Infografik|Buchsatz|Druckbild|Callout|QR-?Code|gesetzte Tabellen|echte Tabellen|finale Grafik|fertigen Grafik|Satzstudio|Nummerierung der Abbildungen|Abbildungen vereinheitlichen|visuelle Artefakte|im Buchsatz|optisch als Anker|Fettdruck oder Versalien|hervorgehobene (Tabelle|Checkliste|Stufen)|Übersichtskasten.{0,60}setzen|Kästen \(Callout|als Callout|WYSIWYG|Napkin/i.test(
    line,
  );
}

/** Drop Herstellung/layout demands from Manuskript gaps & change-orders. */
export function filterSachbuchManuscriptCritiqueLines(lines: string[]): string[] {
  return lines.filter((l) => !isSachbuchHerstellungLayoutCritique(l));
}

/** Book-wide critique lines that this chapter must honor. */
export function sachbuchBookCritiqueForChapter(
  book: SachbuchKontext,
  kapitelId: string,
): { orders: string[]; gaps: string[]; summary: string } {
  const review = book.idee.manuscriptReview;
  const empty = { orders: [] as string[], gaps: [] as string[], summary: "" };
  const hasBookCritique =
    Boolean(review?.changeOrders?.length) || Boolean(review?.gaps?.length);
  if (!hasBookCritique) return empty;
  const idx = book.kapitel.findIndex((k) => k.id === kapitelId);
  if (idx < 0) return empty;
  const n = idx + 1;
  return {
    orders: filterSachbuchManuscriptCritiqueLines(
      (review.changeOrders ?? []).filter((o) =>
        sachbuchBookCritiqueAppliesToChapter(o, n),
      ),
    ),
    gaps: filterSachbuchManuscriptCritiqueLines(
      (review.gaps ?? []).filter((g) =>
        sachbuchBookCritiqueAppliesToChapter(g, n),
      ),
    ),
    summary: (review.scoreSummary ?? "").trim(),
  };
}

/**
 * Whether this chapter still needs an Improve-Hop.
 * First Lektorat if no solid improvedText; Buch-Pass when open book
 * change-orders apply and were not yet applied for the current
 * `manuscriptReview.scoredAt` (manual `improvedAt` bumps must not skip).
 * Client-safe.
 */
export function sachbuchKapitelNeedsManuscriptImprove(
  book: SachbuchKontext,
  kapitelId: string,
): boolean {
  const k = book.kapitel.find((c) => c.id === kapitelId);
  if (!k) return false;
  const already = countSachbuchWords(k.manuscript.improvedText);
  const improvedAt = k.manuscript.improvedAt?.trim() || null;
  const bookScoredAt = book.idee.manuscriptReview?.scoredAt?.trim() || null;
  const critique = sachbuchBookCritiqueForChapter(book, kapitelId);
  const appliedFor =
    k.manuscript.bookPassAppliedScoredAt?.trim() || null;
  // Open book Orders for this chapter force a hop until Argon has applied
  // that exact book-score generation — not merely until improvedAt is fresh.
  const chapterNeedsBookPass =
    Boolean(bookScoredAt) &&
    critique.orders.length > 0 &&
    appliedFor !== bookScoredAt;
  if (
    already >= SACHBUCH_MANUSCRIPT_IMPROVED_MIN_WORDS &&
    improvedAt &&
    !chapterNeedsBookPass
  ) {
    return false;
  }
  return true;
}

/**
 * Gesamt-Verkaufsreife for Manuskript UI.
 * Prefers the holistic book review; falls back to chapter mean only as interim.
 */
export function sachbuchManuscriptOverallSalesScore(book: SachbuchKontext): {
  score: number | null;
  /** How the displayed score was derived. */
  source: "book" | "chapters-mean" | "none";
  scoreSummary: string;
  average: number | null;
  scoredCount: number;
  chapterCount: number;
} {
  const scores = book.kapitel
    .map((k) => k.manuscript.salesScore)
    .filter((s): s is number => typeof s === "number" && Number.isFinite(s));
  const chapterMean =
    scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) /
        10
      : null;
  const bookScore = book.idee.manuscriptReview?.salesScore ?? null;
  const bookSummary = book.idee.manuscriptReview?.scoreSummary?.trim() ?? "";
  if (bookScore != null) {
    return {
      score: bookScore,
      source: "book",
      scoreSummary: bookSummary,
      average: chapterMean,
      scoredCount: scores.length,
      chapterCount: book.kapitel.length,
    };
  }
  if (chapterMean != null) {
    return {
      score: chapterMean,
      source: "chapters-mean",
      scoreSummary: "",
      average: chapterMean,
      scoredCount: scores.length,
      chapterCount: book.kapitel.length,
    };
  }
  return {
    score: null,
    source: "none",
    scoreSummary: "",
    average: null,
    scoredCount: 0,
    chapterCount: book.kapitel.length,
  };
}

export type SlimSachbuchTransportOptions = {
  /**
   * Keep full manuscript / Abschnitt prose for these chapter ids
   * (e.g. the chapter just improved). Others are stripped for payload size.
   */
  keepKapitelIds?: string[];
  /** If true, strip all long prose (admin page hydration). */
  stripAllProse?: boolean;
  /**
   * Keep Abbildung/Tabelle pixels even when prose is stripped
   * (Infografik-API). Default false — too large for RSC hydration.
   */
  keepInfografiken?: boolean;
};

/**
 * Shrink Sachbuch JSON for RSC / API responses.
 * Full books with 9×~10k-word chapters otherwise blow the browser (white screen).
 */
export function slimSachbuchKontextForTransport(
  book: SachbuchKontext,
  options: SlimSachbuchTransportOptions = {},
): SachbuchKontext {
  const keep = new Set(options.keepKapitelIds ?? []);
  const stripAll = Boolean(options.stripAllProse);
  const keepInfos = Boolean(options.keepInfografiken);
  const exp = book.export ?? emptySachbuchExport();
  const hadCover =
    Boolean(exp.hasCoverImage) ||
    exp.coverImageDataUrl.trim().startsWith("data:image/");
  // Cover data URLs are multi-MB; strip from slim admin/API payloads.
  const stripCover = stripAll || keep.size > 0;

  return {
    ...book,
    export: {
      ...exp,
      hasCoverImage: hadCover,
      coverImageDataUrl: stripCover ? "" : exp.coverImageDataUrl,
      coverPrompt: exp.coverPrompt?.slice(0, 2_000) ?? "",
    },
    idee: {
      ...book.idee,
      // Never ship full Hörbuch spoken bodies (duplicate of chapter prose).
      hoerbuch: slimSachbuchHoerbuchState(
        book.idee.hoerbuch ?? emptySachbuchHoerbuchState(),
      ),
      refineLog: stripAll || keep.size > 0 ? [] : book.idee.refineLog,
      interviewMessages:
        stripAll || keep.size > 0
          ? book.idee.interviewMessages.map((m) => ({
              ...m,
              content: m.content.slice(0, 800),
            }))
          : book.idee.interviewMessages,
    },
    kapitel: book.kapitel.map((k) => {
      // stripAll → no prose; keep ids → only those; else keep all (compat).
      const keepProse = stripAll
        ? false
        : keep.size === 0
          ? true
          : keep.has(k.id);
      const keepFig = keepProse || keepInfos;
      return {
        ...k,
        draftPass1: keepProse ? k.draftPass1 : "",
        critiquePass2: keepProse ? k.critiquePass2 : "",
        finalText: keepProse ? k.finalText : "",
        interviewBriefing: keepProse ? k.interviewBriefing : "",
        interviewMessages: keepProse ? k.interviewMessages : [],
        groundingSources: keepProse ? k.groundingSources : [],
        infografikDataUrl: keepFig ? k.infografikDataUrl : null,
        infografikPrompt: keepFig ? k.infografikPrompt : "",
        // Titles/keys without pixels so status chips survive stripAll.
        infografiken: keepFig
          ? (k.infografiken ?? [])
          : (k.infografiken ?? []).map((i) => ({
              key: i.key,
              title: i.title,
              dataUrl: "",
              prompt: "",
            })),
        abschnitte: k.abschnitte.map((a) => ({
          ...a,
          draftText: keepProse ? a.draftText : "",
          authorReply: keepProse ? a.authorReply : "",
          revisions: keepProse
            ? (a.revisions ?? []).map((r) => ({ ...r, beforeText: "" }))
            : [],
        })),
        manuscript: {
          ...k.manuscript,
          draftText: keepProse ? k.manuscript.draftText : "",
          improvedText: keepProse ? k.manuscript.improvedText : "",
          herstellungText: keepProse ? k.manuscript.herstellungText : "",
        },
      };
    }),
  };
}

/** Alias for admin page initial props — strip all long chapter prose. */
export function slimSachbuchKontextForAdminPage(
  book: SachbuchKontext,
): SachbuchKontext {
  return slimSachbuchKontextForTransport(book, { stripAllProse: true });
}

/**
 * Prefer next figure list; fill empty dataUrls from previous by key/title.
 */
function mergeSachbuchInfografiken(
  nextList: SachbuchKapitelInfografik[] | undefined,
  prevList: SachbuchKapitelInfografik[] | undefined,
): SachbuchKapitelInfografik[] {
  const next = nextList ?? [];
  const prev = prevList ?? [];
  if (!next.length) return prev;
  return next.map((n) => {
    if (n.dataUrl?.trim().startsWith("data:image/")) return n;
    const match = prev.find(
      (p) =>
        (n.key && p.key && n.key === p.key) ||
        (n.title.trim() && n.title.trim() === p.title.trim()),
    );
    if (match?.dataUrl?.trim().startsWith("data:image/")) {
      return {
        ...n,
        dataUrl: match.dataUrl,
        prompt: n.prompt || match.prompt,
        key: n.key || match.key,
      };
    }
    return n;
  });
}

/**
 * When an API returns a slim book, keep previously loaded chapter prose
 * in client state unless the response includes replacement text.
 */
export function mergeSachbuchProseFromPrevious(
  previous: SachbuchKontext,
  next: SachbuchKontext,
): SachbuchKontext {
  const prevCover = previous.export?.coverImageDataUrl?.trim() ?? "";
  const nextCover = next.export?.coverImageDataUrl?.trim() ?? "";
  const coverImageDataUrl =
    nextCover.startsWith("data:image/")
      ? nextCover
      : prevCover.startsWith("data:image/")
        ? prevCover
        : "";
  const hasCoverImage =
    Boolean(next.export?.hasCoverImage) ||
    Boolean(previous.export?.hasCoverImage) ||
    coverImageDataUrl.startsWith("data:image/");

  return {
    ...next,
    export: {
      ...next.export,
      coverImageDataUrl,
      coverPrompt: next.export.coverPrompt || previous.export.coverPrompt,
      hasCoverImage,
    },
    kapitel: next.kapitel.map((nk) => {
      const pk = previous.kapitel.find((p) => p.id === nk.id);
      if (!pk) return nk;
      const nextHasProse =
        Boolean(nk.manuscript.improvedText.trim()) ||
        Boolean(nk.manuscript.draftText.trim()) ||
        Boolean(nk.manuscript.herstellungText.trim()) ||
        nk.abschnitte.some((a) => a.draftText.trim());
      if (nextHasProse) return nk;
      return {
        ...nk,
        finalText: nk.finalText || pk.finalText,
        infografikDataUrl: nk.infografikDataUrl || pk.infografikDataUrl,
        infografikPrompt: nk.infografikPrompt || pk.infografikPrompt,
        infografiken: mergeSachbuchInfografiken(
          nk.infografiken,
          pk.infografiken,
        ),
        abschnitte:
          nk.abschnitte.some((a) => a.draftText.trim()) ||
          nk.abschnitte.length !== pk.abschnitte.length
            ? nk.abschnitte
            : pk.abschnitte,
        manuscript: {
          ...nk.manuscript,
          draftText: nk.manuscript.draftText || pk.manuscript.draftText,
          improvedText: nk.manuscript.improvedText || pk.manuscript.improvedText,
          herstellungText:
            nk.manuscript.herstellungText || pk.manuscript.herstellungText,
        },
      };
    }),
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
