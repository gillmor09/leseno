/**
 * Top-Down Roman pipeline hops:
 * Architect (acts → chapters → manifests) → per scene:
 * draft → logic_audit → style_polish → tic → state_commit → chapter_audit.
 * Pyramid: Contract/Beat/Ledger flow into Draft+Audit; chapter gate closes dramaturgy.
 */

import { parseModelJsonObjectWithRepair } from "@/lib/ai/repair-model-json";
import {
  formatBeatChainMandate,
  formatContractForAuthor,
  formatContractForEditor,
  formatContractForSceneLogicAudit,
  formatEndingGestureBudget,
  formatJobTaxonomyForOutline,
  formatRegisterForStylist,
  formatSceneBeatTaxonomy,
  formatSceneBeatsForEditor,
  formatScenePlanForAuthor,
  getSceneBeatRegister,
  normalizeChapterContract,
  NOVEL_CHAPTER_JOB_LABELS,
  NOVEL_SCENE_BEAT_LABELS,
  pickBeatChain,
} from "@/lib/novel/chapter-contract";
import {
  formatKnowledgeGraphBlock,
  formatWorldBlock,
} from "@/lib/novel/context";
import {
  emptyLogicLedger,
  entityStatesWithLedger,
  formatLogicLedgerForAuthor,
  formatLogicLedgerForEditor,
  getLogicLedger,
  LOGIC_LEDGER_KEY,
  mergeLogicLedgerPatch,
} from "@/lib/novel/logic-ledger";
import { countNovelWords } from "@/lib/novel/manuscript-stats";
import {
  NOVEL_AUTHOR_DRAFT_CRAFT,
  NOVEL_MANDATORY_PROSE_DOS,
} from "@/lib/novel/prose-guardrails";
import { detectNovelProseTics } from "@/lib/novel/prose-tic-detect";
import {
  generateAsAuthor,
  generateAsEditorJson,
  generateAsStylist,
  NOVEL_EDITOR_MODEL_SLUG,
} from "@/lib/novel/roles";
import {
  deleteChaptersAboveNumber,
  deleteNovelScenes,
  getNovelBundle,
  updateNovel,
  upsertChapter,
  upsertKnowledgeGraph,
  upsertScene,
  upsertSceneState,
  upsertStyleGuide,
} from "@/lib/novel/repository";
import { voiceCardExtractSchema } from "@/lib/novel/schemas";
import {
  architectActsSchema,
  architectSceneManifestsSchema,
  chapterAuditSchema,
  coerceArchitectActsResult,
  coerceArchitectChaptersList,
  coerceArchitectChaptersResult,
  coerceArchitectSceneManifests,
  isThinSceneManifest,
  structureNoteToString,
  logicAuditSchema,
  normalizeArchitectActsList,
  novelSkeletonSchema,
  sceneManifestSchema,
  skeletonStructureAuditSchema,
  stateDiffSchema,
  type SkeletonChapter,
  TREE_MAX_ACTS_STRUCTURE_REWRITES,
  TREE_MAX_CHAPTERS_STRUCTURE_REWRITES,
  TREE_MAX_MANIFESTS_STRUCTURE_REWRITES,
  TREE_MAX_LOGIC_REWRITES,
  TREE_MAX_TIC_SCRUBS,
  TREE_SCENE_MIN_WORDS,
  TREE_SCENE_TARGET_WORDS,
  TREE_STRUCTURE_COLLAB_ROUNDS_ACTS,
  TREE_STRUCTURE_COLLAB_ROUNDS_CHAPTERS,
  TREE_STRUCTURE_COLLAB_ROUNDS_MANIFESTS,
  type NovelSkeleton,
  type SceneManifest,
  type SkeletonStructureLevel,
} from "@/lib/novel/tree-schemas";
import {
  consultArchitectOnStructureGaps,
  extractChapterNumbersFromStructureNotes,
  filterBogusManifestInventoryNotes,
  filterBogusStructureNotes,
  formatIdeaForStructureAudit,
  repairChaptersFromCollab,
  repairManifestsFromCollab,
  structureAuditIdeaBanBlock,
  type ManifestInventorySnapshot,
} from "@/lib/novel/structure-collab";
import type {
  NovelBundle,
  NovelChapter,
  NovelChapterContract,
  NovelJobHop,
  NovelScene,
  NovelSceneBeat,
  OrchestratorStatus,
  ScenePlanBeat,
} from "@/lib/novel/types";
import {
  ARCHITECT_PYRAMID_EXTRAS_HINT,
  coercePyramidPlanPair,
  emptyStateDelta,
  formatNextPlanMandate,
  formatPyramidStateForArchitect,
  getNextPlanFor,
  getPyramidBookState,
  mergePyramidDeltaIntoBookState,
  parsePyramidBookState,
  PYRAMID_STATE_KEY,
  stateMatrixWithPyramidLevel,
  type PyramidLevel,
  type PyramidNextPlan,
  type PyramidStateDelta,
} from "@/lib/novel/pyramid-state";
import {
  markEntityProvenance,
  markStateProvenance,
} from "@/lib/novel/provenance";
import {
  stateMatrixWithStructureReport,
  type StructureLevelReport,
} from "@/lib/novel/structure-reports";
import {
  detectToneModeFromBundle,
  detectToneModeFromTexts,
  enrichVoiceCardForToneMode,
  formatToneContractForArchitect,
  formatToneContractForAuditor,
  formatToneContractForAuthor,
  toneModeStyleLabels,
} from "@/lib/novel/tone-contract";
import { formatVoiceCardForAuthor, getVoiceCard } from "@/lib/novel/voice-card";
import { resolveRomanSchreibModel } from "@/lib/roman/model";
import { type z } from "zod";

/** Pipeline craft score after logic pass (feeds Abnahme floor). */
function scoreAfterLogicPass(iteration: number): number {
  if (iteration <= 0) return 8;
  if (iteration === 1) return 7;
  return 6;
}

function priorChapterTexts(
  bundle: NovelBundle,
  beforeChapterNumber: number,
): string[] {
  return bundle.chapters
    .filter(
      (c) =>
        c.chapterNumber < beforeChapterNumber &&
        (c.finalText || c.rawDraft).trim().length > 40,
    )
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .map((c) => (c.finalText || c.rawDraft).trim());
}

function chapterPlotBeatsHint(
  skeleton: NovelSkeleton,
  chapterNumber: number,
): string {
  const ch = skeleton.chapters.find((c) => c.chapterNumber === chapterNumber);
  if (!ch?.beats?.length) return "";
  return `Kapitel-Plot-Beats (müssen in sceneGoal/turningBeat/mustShow dieser Kapitel-Szenen gespiegelt sein):\n${ch.beats.map((b, i) => `${i + 1}. ${b}`).join("\n")}`;
}

/**
 * Running plan-canon from already stored scene manifests (chapters &lt; N).
 * Used at outline time before prose fills knowledge_graph / embeddings.
 */
function formatPriorManifestCanon(
  bundle: NovelBundle,
  beforeChapterNumber: number,
): string {
  const prior = bundle.scenes
    .map((s) => {
      const ch =
        bundle.chapters.find((c) => c.id === s.chapterId)?.chapterNumber ?? 0;
      return { s, ch };
    })
    .filter(({ ch }) => ch > 0 && ch < beforeChapterNumber)
    .sort((a, b) =>
      a.ch !== b.ch ? a.ch - b.ch : a.s.sceneIndex - b.s.sceneIndex,
    );

  if (prior.length === 0) {
    return `# Geplante Manifest-Kette
(noch keine Vorgänger-Kapitel — Kapitel ${beforeChapterNumber} ist der Start)`;
  }

  const allowed = new Set<string>();
  const forbidden = new Set<string>();
  const lines: string[] = [];
  for (const { s, ch } of prior) {
    const m = parseManifest(s.manifest ?? {});
    for (const k of m?.knowledgeAllowed ?? []) {
      const t = String(k).trim();
      if (t) allowed.add(t);
    }
    for (const k of m?.knowledgeForbidden ?? []) {
      const t = String(k).trim();
      if (t) forbidden.add(t);
    }
    lines.push(
      `${ch}.${s.sceneIndex} ${m?.beat ?? "?"} | ${String(m?.sceneGoal ?? s.planSummary).slice(0, 90)} | loc=${String(m?.location ?? "").slice(0, 32)} | t=${String(m?.timeAnchor ?? "").slice(0, 24)} | +${(m?.knowledgeAllowed ?? []).slice(0, 2).join(";")} | -${(m?.knowledgeForbidden ?? []).slice(0, 2).join(";")}`,
    );
  }

  // Facts once allowed in an earlier scene are no longer globally forbidden.
  for (const a of allowed) forbidden.delete(a);

  return `# Geplante Manifest-Kette (Kapitel 1…${beforeChapterNumber - 1}, verbindlich)
HARD: knowledgeAllowed darf nur Wissen enthalten, das hier schon freigegeben wurde ODER in DIESEM Kapitel erstmals sichtbar wird.
knowledgeForbidden = noch nicht gezeigte Fakten (Depotfreigaben, spätere Ergebnisse, Bestellprotokolle o.ä. — konsistent zur Kette).
Keine Orts-/Zeit-/Figuren-Widersprüche zu den Zeilen unten.

## Szenen-Kurzform
${lines.join("\n").slice(0, 7_000)}

## Kumuliertes Wissen (allowed bisher)
${[...allowed].slice(0, 40).map((x) => `- ${x}`).join("\n") || "- (noch dünn)"}

## Noch gesperrt / nicht geöffnet
${[...forbidden].slice(0, 40).map((x) => `- ${x}`).join("\n") || "- (keine expliziten Sperren)"}`;
}

const STRUCTURE_AUDIT_KEY = "__structureAudit";

type StructureAuditMemo = {
  level: SkeletonStructureLevel;
  notes: string;
  updatedAt: string;
  score?: number;
  passed?: boolean;
};

function readStructureAuditMemo(
  matrix: Record<string, unknown> | null | undefined,
): StructureAuditMemo | null {
  const raw = matrix?.[STRUCTURE_AUDIT_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const level = o.level;
  if (level !== "acts" && level !== "chapters" && level !== "manifests") {
    return null;
  }
  return {
    level,
    notes: String(o.notes ?? "").trim(),
    updatedAt: String(o.updatedAt ?? ""),
    score: typeof o.score === "number" ? o.score : undefined,
    passed: typeof o.passed === "boolean" ? o.passed : undefined,
  };
}

async function writeStructureAuditMemo(
  novelId: string,
  matrix: Record<string, unknown>,
  memo: StructureAuditMemo | null,
): Promise<void> {
  const next = { ...matrix };
  if (!memo) {
    delete next[STRUCTURE_AUDIT_KEY];
  } else {
    next[STRUCTURE_AUDIT_KEY] = memo;
  }
  await updateNovel({ id: novelId, stateMatrix: next });
}

async function persistStructureLevelReport(
  novelId: string,
  matrix: Record<string, unknown>,
  level: SkeletonStructureLevel,
  report: StructureLevelReport,
  /** Keep last-fail memo for rewrite prompts; clear on pass. */
  failMemo: StructureAuditMemo | null,
): Promise<void> {
  let next = stateMatrixWithStructureReport(matrix, level, report);
  if (!failMemo) {
    delete next[STRUCTURE_AUDIT_KEY];
  } else {
    next = { ...next, [STRUCTURE_AUDIT_KEY]: failMemo };
  }
  await updateNovel({ id: novelId, stateMatrix: next });
}

function structureFixBlock(
  bundle: NovelBundle,
  level: SkeletonStructureLevel,
): string {
  const memo = readStructureAuditMemo(bundle.novel.stateMatrix);
  if (!memo || memo.level !== level || !memo.notes) return "";
  return `\n## Struktur-Audit Nachbesserung (verbindlich umsetzen)\n${memo.notes}\n`;
}

function normalizeNextPlan(
  plan: PyramidNextPlan | undefined,
  fallback: PyramidNextPlan,
): PyramidNextPlan {
  if (!plan) return fallback;
  const countMin = Math.min(plan.countMin, plan.countMax);
  const countMax = Math.max(plan.countMin, plan.countMax);
  return { ...plan, countMin, countMax };
}

async function commitPyramidLevel(input: {
  novelId: string;
  matrix: Record<string, unknown>;
  level: PyramidLevel;
  stateDelta: PyramidStateDelta;
  nextPlan: PyramidNextPlan;
}): Promise<Record<string, unknown>> {
  const withPyramid = stateMatrixWithPyramidLevel(input.matrix, input.level, {
    state: input.stateDelta,
    nextPlan: input.nextPlan,
    updatedAt: new Date().toISOString(),
  });
  let merged = mergePyramidDeltaIntoBookState(
    withPyramid,
    input.stateDelta,
  );
  merged = markStateProvenance(
    merged,
    ["characters", "knowledge", "notes", "stakes", "toneNotes"],
    input.level,
  );
  await updateNovel({ id: input.novelId, stateMatrix: merged });
  return merged;
}

/**
 * Idea → acts plan: seed pyramid without an extra LLM hop.
 * (A dedicated Idee-Pyramid JSON call was aborting start on Zod/parse noise;
 * acts generation still refines state + chapters plan.)
 */
async function ensureIdeaPyramidPlan(input: {
  novelId: string;
  bundle: NovelBundle;
  toneArchitect: string;
}): Promise<void> {
  const existing = getPyramidBookState(input.bundle);
  if (existing.idea?.nextPlan?.target === "acts") return;

  const idea = input.bundle.novel.highConceptIdea.trim();
  const satire =
    input.toneArchitect.includes("Satire") ||
    input.toneArchitect.includes("Humor");
  const pair = coercePyramidPlanPair(
    {
      stateDelta: emptyStateDelta(
        idea.slice(0, 200) || "Idee übernommen — Pyramid-State.",
      ),
      nextPlan: {
        target: "acts",
        countMin: 3,
        countMax: 3,
        structure:
          "Drei Akte: Setup → Konfrontation → Auflösung; jeder Akt stoffreich genug für 5–7 Kapitel",
        plot: idea.slice(0, 400) || "Handlungskette laut High Concept",
        functions: [
          "Akt1: Setup und Welt etablieren (5–7 Kapitel-Raum)",
          "Akt2: Konfrontation und Eskalation (5–7 Kapitel-Raum)",
          "Akt3: Auflösung und Wendung (5–7 Kapitel-Raum)",
        ],
        mustCover: [
          "Jeder Akt trägt locker 5–7 Kapitel",
          ...(satire
            ? ["Humorvolle Satire als HARD-Ton in allen Akten"]
            : []),
        ],
        mustNot: [
          "Akt als einzelne Episode ohne Kapitel-Raum",
          ...(satire
            ? ["Ton glätten zu ernst/literarisch ohne Komik"]
            : []),
        ],
      },
    },
    "acts",
  );

  await commitPyramidLevel({
    novelId: input.novelId,
    matrix: input.bundle.novel.stateMatrix ?? {},
    level: "idea",
    stateDelta: pair.stateDelta,
    nextPlan: normalizeNextPlan(pair.nextPlan, pair.nextPlan),
  });
}

export type TreeHopOutcome =
  | { outcome: "ok" }
  | { outcome: "continue"; hop: NovelJobHop }
  | { outcome: "error"; message: string };

type StatusFn = (
  novelId: string,
  patch: OrchestratorStatus,
  novelStatus?: string,
) => Promise<void>;

function continueHop(hop: NovelJobHop): TreeHopOutcome {
  return { outcome: "continue", hop };
}

async function parseJsonObject(
  raw: string,
  label: string,
  hint: string,
): Promise<Record<string, unknown>> {
  const model = await resolveRomanSchreibModel(NOVEL_EDITOR_MODEL_SLUG);
  const obj = await parseModelJsonObjectWithRepair({
    raw,
    model,
    schemaHint: hint,
    errorLabel: label,
  });
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    return obj as Record<string, unknown>;
  }
  return {};
}

async function parseJson<T>(
  raw: string,
  schema: z.ZodType<T>,
  label: string,
  hint: string,
): Promise<T> {
  const obj = await parseJsonObject(raw, label, hint);
  const parsed = schema.safeParse(obj);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 4)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    const keys = Object.keys(obj).slice(0, 12).join(",");
    const actsLen = Array.isArray(obj.acts) ? obj.acts.length : -1;
    console.warn(
      `[novel/parseJson] ${label} Zod:`,
      detail,
      `| keys=${keys} actsLen=${actsLen}`,
    );
    throw new Error(`${label}: JSON ungültig (${detail || "Schema"}).`);
  }
  return parsed.data;
}

function sortScenes(bundle: NovelBundle): NovelScene[] {
  const chOrder = new Map(
    bundle.chapters.map((c) => [c.id, c.chapterNumber]),
  );
  return [...bundle.scenes].sort((a, b) => {
    const ca = chOrder.get(a.chapterId) ?? 0;
    const cb = chOrder.get(b.chapterId) ?? 0;
    if (ca !== cb) return ca - cb;
    return a.sceneIndex - b.sceneIndex;
  });
}

function parseSkeleton(raw: Record<string, unknown>): NovelSkeleton {
  const p = novelSkeletonSchema.safeParse(raw);
  if (!p.success) return { premise: "", acts: [], chapters: [] };
  // Repair duplicate/extra actNumbers from older LLM outputs.
  const acts = normalizeArchitectActsList(p.data.acts).map((a) => {
    const o = a as { actNumber: number; title: string; summary: string };
    return {
      actNumber: o.actNumber,
      title: o.title,
      summary: o.summary.length >= 8 ? o.summary : `${o.summary || "Akt"} — Zusammenfassung.`,
    };
  });
  return { ...p.data, acts };
}

/** Parse a stored scene manifest JSON; null if schema fails. */
export function parseManifest(
  raw: Record<string, unknown>,
): SceneManifest | null {
  const p = sceneManifestSchema.safeParse(raw);
  return p.success ? p.data : null;
}

/** Point slice from state matrix — only keys useful for this scene. */
export function buildStateSlice(
  state: Record<string, unknown>,
  manifest: SceneManifest,
): Record<string, unknown> {
  const chars = Array.isArray(state.characters)
    ? state.characters
    : state.characters && typeof state.characters === "object"
      ? state.characters
      : {};
  const knowledge = state.knowledge ?? {};
  const items = state.items ?? {};
  const names = new Set(manifest.characters.map((n) => n.toLowerCase()));
  const charSlice: Record<string, unknown> = {};
  if (chars && typeof chars === "object" && !Array.isArray(chars)) {
    for (const [k, v] of Object.entries(chars as Record<string, unknown>)) {
      if (names.has(k.toLowerCase()) || names.size === 0) charSlice[k] = v;
    }
  }
  const pyramid = parsePyramidFromMatrix(state);
  return {
    location: manifest.location,
    timeAnchor: manifest.timeAnchor,
    characters: Object.keys(charSlice).length ? charSlice : chars,
    knowledgeAllowed: manifest.knowledgeAllowed,
    knowledgeForbidden: manifest.knowledgeForbidden,
    knowledge,
    items,
    notes: state.notes ?? [],
    stakes: state.stakes ?? "",
    toneNotes: state.toneNotes ?? "",
    pyramidSummary: pyramid,
  };
}

function parsePyramidFromMatrix(state: Record<string, unknown>): string {
  const pyramid = parsePyramidBookState(state[PYRAMID_STATE_KEY]);
  const parts: string[] = [];
  for (const level of ["idea", "acts", "chapters", "scenes"] as const) {
    const rec = pyramid[level];
    if (rec?.state.summary) {
      parts.push(`${level}: ${rec.state.summary}`);
    }
  }
  return parts.join(" | ").slice(0, 600);
}

export async function runArchitectActs(input: {
  novelId: string;
  status: StatusFn;
  iteration?: number;
}): Promise<TreeHopOutcome> {
  const bundle = await getNovelBundle(input.novelId);
  if (!bundle) throw new Error("Roman nicht gefunden.");
  const iteration = Math.max(0, input.iteration ?? 0);
  await input.status(input.novelId, {
    phase: "architect_acts",
    label:
      iteration > 0
        ? "Architekt: Akte nach Struktur-Audit nachbessern…"
        : "Architekt: Akte & Prämisse…",
    step: "architect_acts",
    iteration,
  });

  const toneMode = detectToneModeFromTexts(bundle.novel.highConceptIdea);
  const toneArchitect = formatToneContractForArchitect(toneMode);
  await ensureIdeaPyramidPlan({
    novelId: input.novelId,
    bundle,
    toneArchitect,
  });
  const freshForActs = await getNovelBundle(input.novelId);
  if (!freshForActs) throw new Error("Roman nicht gefunden.");
  const pyramid = getPyramidBookState(freshForActs);
  const actsMandate = formatNextPlanMandate(
    getNextPlanFor(pyramid, "idea"),
    "acts",
  );
  const pyramidStateBlock = formatPyramidStateForArchitect(pyramid);
  const fixBlock = structureFixBlock(freshForActs, "acts");
  const stateExpandHint = `
State erweitern (HARD — Idee bleibt unverändert):
- Die High-Concept-Idee ist vorgegeben und darf NICHT umgeschrieben/ersetzt werden.
- Stoff für kausale Akte und 5–7 Kapitel pro Akt kommt in stateDelta: worldFacts, characterSeeds, stakes, openThreads, toneNotes (Phasen, Schauplätze, Konfliktschrauben, Teilziele, Wendungen).
- Bei Nachbesserung: State ergänzen/ändern, Akte-Summaries stoffreicher machen — Idee unangetastet lassen.
`;
  const raw = await generateAsEditorJson({
    role: "architect",
    userText: `Erzeuge das Makro-Skelett (Prämisse + Akte) laut Plan der Idee-Ebene.
Ziel: Akte müssen Struktur-Audit mit Score 10/10 bestehen (kausale Kette, Eskalation, Idee-Treue, Kapitel-Tragfähigkeit).
HARD: Jeder Akt-Summary muss so stoffreich sein, dass daraus sehr wahrscheinlich 5–7 Kapitel entstehen können (nicht nur eine Episode/ein Beat). nextPlan.countMin/countMax typisch 15–21 (≈5–7 pro Akt).
Zusätzlich: stateDelta (Buch-State erweitern) + nextPlan für KAPITEL.

Antwort NUR JSON — acts MUSS ein Array mit genau 3 Objekten sein:
{"premise":"…","acts":[{"actNumber":1,"title":"…","summary":"…"},{"actNumber":2,"title":"…","summary":"…"},{"actNumber":3,"title":"…","summary":"…"}],"stateDelta":{…},"nextPlan":{…}}
Extras-Schema: {${ARCHITECT_PYRAMID_EXTRAS_HINT}}
nextPlan.target MUSS "chapters" sein; countMin≥15, countMax≤21 (5–7 Kapitel pro Akt).
${stateExpandHint}
${toneArchitect ? `${toneArchitect}\n` : ""}
${pyramidStateBlock ? `${pyramidStateBlock}\n` : ""}
${actsMandate ? `${actsMandate}\n` : ""}${fixBlock}
Idee (FIX — nicht ändern):
${bundle.novel.highConceptIdea.slice(0, 8_000)}`,
  });
  let data: ReturnType<typeof coerceArchitectActsResult>;
  let rawObj: Record<string, unknown> = {};
  try {
    rawObj = await parseJsonObject(
      raw,
      "Architekt-Akte",
      '{"premise":"","acts":[{"actNumber":1,"title":"","summary":""},{"actNumber":2,"title":"","summary":""},{"actNumber":3,"title":"","summary":""}]}',
    );
    data = coerceArchitectActsResult(rawObj, bundle.novel.highConceptIdea);
    if (!architectActsSchema.safeParse(rawObj).success) {
      console.warn(
        "[novel/architect_acts] Zod weich korrigiert; acts=",
        data.acts.length,
      );
    }
  } catch (err) {
    console.warn(
      "[novel/architect_acts] Parse-Fallback:",
      err instanceof Error ? err.message : err,
    );
    data = coerceArchitectActsResult({}, bundle.novel.highConceptIdea);
  }

  const skeleton: NovelSkeleton = {
    premise: data.premise,
    acts: data.acts,
    chapters: [],
  };
  await updateNovel({
    id: input.novelId,
    skeleton: skeleton as unknown as Record<string, unknown>,
    skeletonFrozen: false,
    status: "outlining",
  });

  const actsPair = coercePyramidPlanPair(
    {
      stateDelta:
        data.stateDelta ??
        emptyStateDelta(
          `Akte: ${data.acts.map((a) => a.title).join(" → ")}`.slice(0, 400),
        ),
      nextPlan: data.nextPlan ?? {
        target: "chapters",
        countMin: 15,
        countMax: 21,
        structure:
          "Pro Akt 5–7 Kapitel; Jobs gemischt; jeder Akt mit eigenem Bogenstoff",
        plot: data.premise.slice(0, 400) || "Kapitel tragen die Akt-Bögen",
        functions: data.acts.map(
          (a) =>
            `Akt ${a.actNumber}: 5–7 Kapitel tragen „${a.title}“ (kein Ein-Kapitel-Akt)`,
        ),
        mustCover: [
          "Jeder Akt hat genug Phasen/Schauplätze/Konfliktschrauben für 5–7 Kapitel",
        ],
        mustNot: ["Ein Akt als einzelne Episode ohne Kapitel-Raum"],
      },
    },
    "chapters",
  );

  await commitPyramidLevel({
    novelId: input.novelId,
    matrix: freshForActs.novel.stateMatrix ?? {},
    level: "acts",
    stateDelta: actsPair.stateDelta,
    nextPlan: normalizeNextPlan(actsPair.nextPlan, actsPair.nextPlan),
  });

  try {
    const { graphDeltaFromActs } = await import("@/lib/novel/pyramid-graph");
    const { persistPyramidGraphDelta } = await import(
      "@/lib/novel/pyramid-graph-sync"
    );
    await persistPyramidGraphDelta({
      novelId: input.novelId,
      layer: "acts",
      replaceLayerEmbeddings: true,
      delta: graphDeltaFromActs({
        premise: data.premise,
        acts: data.acts,
      }),
    });
  } catch (err) {
    console.warn("[novel/architect_acts] pyramid graph sync:", err);
  }

  // Lightweight voice card from idea → stylist/draft (no full sequential styleguide hop).
  try {
    const satireHint =
      toneMode === "satire_humor"
        ? `\nHARD: Die Idee verlangt humorvolle Satire. toneLabel muss Satire/Humor nennen; traits und doWrite müssen komische/satirische Haltung festschreiben (nicht nur „literarisch“). sampleLines mit Ironie/Timing.`
        : "";
    const voiceRaw = await generateAsEditorJson({
      role: "editor",
      userText: `Extrahiere eine Stimmkarte aus der High-Concept-Idee (positiv, keine Verbotslisten).
Antwort NUR JSON:
{"toneLabel":"…","traits":["…","…","…","…"],"doWrite":["…","…","…"],"sampleLines":["…","…"],"endingRotation":["Handlung","Dialog","sinnlich"]}
${satireHint}

Idee:
${bundle.novel.highConceptIdea.slice(0, 6_000)}
Prämisse: ${data.premise}`,
    });
    const voiceObj = await parseModelJsonObjectWithRepair({
      raw: voiceRaw,
      model: await resolveRomanSchreibModel(NOVEL_EDITOR_MODEL_SLUG),
      schemaHint:
        '{"toneLabel":"","traits":[],"doWrite":[],"sampleLines":[],"endingRotation":[]}',
      errorLabel: "Stimmkarte",
    });
    const voice = voiceCardExtractSchema.safeParse(voiceObj);
    if (voice.success) {
      const enriched = enrichVoiceCardForToneMode(voice.data, toneMode);
      const labels = toneModeStyleLabels(toneMode);
      const now = new Date().toISOString();
      await upsertStyleGuide({
        novelId: input.novelId,
        genre: labels.genre,
        subgenre: labels.subgenre,
        primaryTone: enriched.toneLabel,
        narrativePerspective: "flexibel",
        styleRules: {
          dos: NOVEL_MANDATORY_PROSE_DOS.slice(0, 6),
          donts: [],
          notes:
            toneMode === "satire_humor"
              ? "Top-Down: Stimmkarte + Ton-Vertrag humorvolle Satire (HARD)."
              : "Top-Down: Stimmkarte aus Architekt-Akte.",
          voiceCard: enriched,
        },
        createdAt: bundle.styleGuide?.createdAt ?? now,
        updatedAt: now,
      });
    }
  } catch (err) {
    console.warn("[novel/architect_acts] Stimmkarte übersprungen:", err);
  }

  return continueHop({
    novelId: input.novelId,
    step: "skeleton_audit_acts",
    // Keep rewrite budget across architect → audit hops.
    iteration,
  });
}

/**
 * Keep `leseno.chapters` in lockstep with skeleton.chapters.
 * Surplus rows (and cascaded scenes) are deleted via admin_delete_chapters_above.
 */
async function syncDbChaptersToSkeletonCount(
  novelId: string,
  chapters: SkeletonChapter[],
): Promise<number> {
  const maxN = chapters.reduce(
    (m, c) => Math.max(m, c.chapterNumber),
    0,
  );
  return deleteChaptersAboveNumber(novelId, maxN);
}

async function persistSkeletonChapters(input: {
  novelId: string;
  skeleton: NovelSkeleton;
  existingChapters: NovelBundle["chapters"];
  stateDelta?: unknown;
  nextPlan?: unknown;
  matrix: Record<string, unknown>;
}): Promise<void> {
  // Contiguous 1..n — avoids holes that leave orphan DB rows.
  const chapters = input.skeleton.chapters
    .slice()
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .map((c, i) => ({ ...c, chapterNumber: i + 1 }));
  const skeleton: NovelSkeleton = { ...input.skeleton, chapters };

  await updateNovel({
    id: input.novelId,
    skeleton: skeleton as unknown as Record<string, unknown>,
  });

  const chaptersPair = coercePyramidPlanPair(
    {
      stateDelta:
        input.stateDelta ??
        emptyStateDelta(
          `Kapitel ${chapters.length}: ${chapters
            .slice(0, 6)
            .map((c) => c.title)
            .join(", ")}`.slice(0, 400),
        ),
      nextPlan: input.nextPlan ?? {
        target: "scenes",
        countMin: Math.max(chapters.length * 2, 6),
        countMax: Math.max(chapters.length * 4, 12),
        structure: "Pro Kapitel die vorgeschriebene Beat-Kette",
        plot: "Szenen decken Kapitel-Jobs und Beats ab",
        functions: chapters.map(
          (c) =>
            `Kap.${c.chapterNumber} (${c.job}): Szenen erfüllen Job „${c.goal.slice(0, 80)}“`,
        ),
        mustCover: [],
        mustNot: [],
      },
    },
    "scenes",
  );
  await commitPyramidLevel({
    novelId: input.novelId,
    matrix: input.matrix,
    level: "chapters",
    stateDelta: chaptersPair.stateDelta,
    nextPlan: normalizeNextPlan(chaptersPair.nextPlan, chaptersPair.nextPlan),
  });

  for (const ch of chapters) {
    const existing = input.existingChapters.find(
      (c) => c.chapterNumber === ch.chapterNumber,
    );
    const contract = normalizeChapterContract(
      {
        job: ch.job,
        must: ch.must,
        mustNot: ch.mustNot,
        endingFunction: ch.endingFunction,
        mood: ch.mood,
      },
      ch.chapterNumber,
    );
    const jobLabel = contract
      ? NOVEL_CHAPTER_JOB_LABELS[contract.job]
      : ch.job;
    await upsertChapter({
      id: existing?.id,
      novelId: input.novelId,
      chapterNumber: ch.chapterNumber,
      title: ch.title,
      outline: `[Job: ${jobLabel}]\n${ch.goal}\n${ch.beats.map((b) => `• ${b}`).join("\n")}`,
      rawDraft: existing?.rawDraft ?? "",
      finalText: existing?.finalText ?? "",
      status: "planned",
      scenePlan: [],
      contract,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  // Drop DB chapters (and cascaded scenes) beyond the skeleton — fixes 19 vs 18.
  const trimmed = await syncDbChaptersToSkeletonCount(
    input.novelId,
    chapters,
  );
  if (trimmed > 0) {
    console.warn(
      `[novel/persistSkeletonChapters] ${trimmed} überzählige Kapitel-Zeile(n) gelöscht.`,
    );
  }
}

/**
 * Chapters are generated per act (5–7 each) so 10/10 is realistic —
 * one giant 18-chapter JSON call routinely under-delivers.
 */
export async function runArchitectChapters(input: {
  novelId: string;
  status: StatusFn;
  iteration?: number;
}): Promise<TreeHopOutcome> {
  const bundle = await getNovelBundle(input.novelId);
  if (!bundle) throw new Error("Roman nicht gefunden.");
  const sk = parseSkeleton(bundle.novel.skeleton ?? {});
  const iteration = Math.max(0, input.iteration ?? 0);
  await input.status(input.novelId, {
    phase: "architect_chapters",
    label:
      iteration > 0
        ? "Architekt: Kapitel nach Struktur-Audit nachbessern…"
        : "Architekt: Kapitel aktweise…",
    step: "architect_chapters",
    iteration,
  });

  // Clean slate: old chapter/scene rows must not outlive a shorter outline.
  await deleteNovelScenes(input.novelId);
  await deleteChaptersAboveNumber(input.novelId, 0);

  const toneMode = detectToneModeFromBundle(bundle);
  const toneArchitect = formatToneContractForArchitect(toneMode);
  const pyramid = getPyramidBookState(bundle);
  const chaptersMandate = formatNextPlanMandate(
    getNextPlanFor(pyramid, "acts"),
    "chapters",
  );
  const pyramidStateBlock = formatPyramidStateForArchitect(pyramid);
  const fixBlock = structureFixBlock(bundle, "chapters");
  const acts = [...sk.acts].sort((a, b) => a.actNumber - b.actNumber);
  if (acts.length < 2) {
    throw new Error("Kapitel brauchen mindestens 2 Akte im Skelett.");
  }

  const plan = getNextPlanFor(pyramid, "acts");
  const totalTarget = plan
    ? Math.round((plan.countMin + plan.countMax) / 2)
    : 18;
  const perActTarget = Math.max(
    5,
    Math.min(7, Math.round(totalTarget / Math.max(acts.length, 1))),
  );

  const allChapters: SkeletonChapter[] = [];
  let nextNum = 1;
  let lastExtras: { stateDelta?: unknown; nextPlan?: unknown } = {};

  for (const act of acts) {
    await input.status(input.novelId, {
      phase: "architect_chapters",
      label: `Architekt: Kapitel für Akt ${act.actNumber} (${perActTarget})…`,
      step: "architect_chapters",
      iteration,
    });

    const priorGoals = allChapters
      .slice(-4)
      .map((c) => `Kap.${c.chapterNumber}: ${c.goal}`)
      .join("\n");

    try {
      const raw = await generateAsEditorJson({
        role: "architect",
        userText: `Plane GENAU die Kapitel für AKT ${act.actNumber} (nicht das ganze Buch).
Zielanzahl: ${perActTarget} Kapitel (min 5, max 7). actNumber MUSS ${act.actNumber} sein.
Jedes Kapitel: job (Enum) + goal + 2–5 Plot-beats + kurzes must/mustNot + endingFunction + mood.
Jobs mischen (nicht alles escalate). Kausal an vorherige Kapitel anschließen.

## Job-Taxonomie
${formatJobTaxonomyForOutline()}

${toneArchitect ? `${toneArchitect}\n` : ""}
${pyramidStateBlock ? `${pyramidStateBlock}\n` : ""}
${chaptersMandate ? `${chaptersMandate}\n` : ""}${fixBlock}
Antwort NUR JSON:
{"chapters":[{"chapterNumber":${nextNum},"title":"…","actNumber":${act.actNumber},"job":"setup","goal":"…","beats":["…","…"],"must":["…"],"mustNot":["…"],"endingFunction":"…","mood":"…"}],"stateDelta":{…},"nextPlan":{"target":"scenes","countMin":2,"countMax":4,"structure":"…","plot":"…","functions":[]}}

Akt ${act.actNumber} — ${act.title}:
${act.summary}

Prämisse: ${sk.premise}
Alle Akte: ${JSON.stringify(sk.acts)}
Bisherige Kapitelziele (Anschluss):
${priorGoals || "(noch keine)"}
Idee (FIX):
${bundle.novel.highConceptIdea.slice(0, 4_000)}`,
      });
      const obj = await parseJsonObject(
        raw,
        `Architekt-Kapitel-Akt${act.actNumber}`,
        '{"chapters":[]}',
      );
      const batch = coerceArchitectChaptersList(obj, {
        forceActNumber: act.actNumber,
        startChapterNumber: nextNum,
      });
      const coerced = coerceArchitectChaptersResult(obj);
      lastExtras = {
        stateDelta: coerced.stateDelta ?? lastExtras.stateDelta,
        nextPlan: coerced.nextPlan ?? lastExtras.nextPlan,
      };

      let use = batch;
      if (use.length < 5) {
        console.warn(
          `[novel/architect_chapters] Akt ${act.actNumber}: nur ${use.length} Kapitel — Audit wird nachbessern.`,
        );
      }
      if (use.length > 7) use = use.slice(0, 7);
      for (const ch of use) {
        allChapters.push({
          ...ch,
          chapterNumber: nextNum++,
          actNumber: act.actNumber,
        });
      }
    } catch (err) {
      console.warn(
        `[novel/architect_chapters] Akt ${act.actNumber} Parse-Fallback:`,
        err instanceof Error ? err.message : err,
      );
      // Minimal scaffold so pipeline continues; collab repair fills substance.
      for (let i = 0; i < perActTarget; i++) {
        allChapters.push({
          chapterNumber: nextNum++,
          title: `Akt ${act.actNumber} · Station ${i + 1}`,
          actNumber: act.actNumber,
          job: i === 0 ? "setup" : i === perActTarget - 1 ? "decision" : "escalate",
          goal: `${act.title}: Phase ${i + 1} — ${act.summary.slice(0, 120)}`,
          beats: [
            "Ausgangslage dieser Phase",
            "Konflikt-/Statusbruch",
            "Überleitung zur nächsten Phase",
          ],
          must: [`Akt ${act.actNumber} vorantreiben`],
          mustNot: ["Handlung anderer Akte vorwegnehmen"],
          endingFunction: "weiterdrehen",
          mood: toneMode === "satire_humor" ? "satirisch" : "gespannt",
        });
      }
    }
  }

  if (allChapters.length < 10) {
    throw new Error(
      `Kapitel-Erzeugung zu dünn (${allChapters.length}). Bitte „Kapitel neu erzeugen“.`,
    );
  }

  const skeleton: NovelSkeleton = {
    ...sk,
    chapters: allChapters,
  };
  await persistSkeletonChapters({
    novelId: input.novelId,
    skeleton,
    existingChapters: [],
    stateDelta: lastExtras.stateDelta,
    nextPlan: lastExtras.nextPlan,
    matrix: bundle.novel.stateMatrix ?? {},
  });

  try {
    const { graphDeltaFromChapters } = await import("@/lib/novel/pyramid-graph");
    const { persistPyramidGraphDelta } = await import(
      "@/lib/novel/pyramid-graph-sync"
    );
    await persistPyramidGraphDelta({
      novelId: input.novelId,
      layer: "chapters",
      replaceLayerEmbeddings: true,
      delta: graphDeltaFromChapters({
        chapters: allChapters.map((c) => ({
          chapterNumber: c.chapterNumber,
          actNumber: c.actNumber,
          title: c.title,
          goal: c.goal,
          job: c.job,
          beats: c.beats,
          must: c.must,
          mustNot: c.mustNot,
          endingFunction: c.endingFunction,
        })),
      }),
    });
  } catch (err) {
    console.warn("[novel/architect_chapters] pyramid graph sync:", err);
  }

  return continueHop({
    novelId: input.novelId,
    step: "skeleton_audit_chapters",
    iteration,
  });
}

/**
 * Scene manifests: one chapter per hop (fresh maxDuration + self-kick).
 * Soft-coerce LLM JSON so Zod never aborts the whole outlining run.
 */
export async function runArchitectManifests(input: {
  novelId: string;
  status: StatusFn;
  iteration?: number;
  /** When set, generate only this chapter then continue to the next. */
  chapterNumber?: number;
}): Promise<TreeHopOutcome> {
  const bundle = await getNovelBundle(input.novelId);
  if (!bundle) throw new Error("Roman nicht gefunden.");
  const sk = parseSkeleton(bundle.novel.skeleton ?? {});
  const iteration = Math.max(0, input.iteration ?? 0);

  if (sk.chapters.length < 1) {
    throw new Error("Keine Skelett-Kapitel — Manifeste abgebrochen.");
  }

  const skeletonNums = new Set(sk.chapters.map((c) => c.chapterNumber));
  let live = bundle;
  let planChapters = live.chapters
    .filter((c) => skeletonNums.has(c.chapterNumber))
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  if (planChapters.length < 1) {
    await syncDbChaptersToSkeletonCount(input.novelId, sk.chapters);
    await persistSkeletonChapters({
      novelId: input.novelId,
      skeleton: sk,
      existingChapters: [],
      matrix: bundle.novel.stateMatrix ?? {},
    });
    live = (await getNovelBundle(input.novelId)) ?? bundle;
    planChapters = live.chapters
      .filter((c) => skeletonNums.has(c.chapterNumber))
      .sort((a, b) => a.chapterNumber - b.chapterNumber);
  }

  if (planChapters.length < 1) {
    throw new Error("Keine DB-Kapitel für Manifeste.");
  }

  const firstNum = planChapters[0]!.chapterNumber;
  const requested = input.chapterNumber ?? firstNum;
  const chapter =
    planChapters.find((c) => c.chapterNumber === requested) ??
    planChapters[0]!;
  const chapterIdx = planChapters.findIndex(
    (c) => c.chapterNumber === chapter.chapterNumber,
  );

  // Sync chapter rows; only wipe scenes on a true greenfield pass.
  // Score-rewrites (iteration>0) must NOT delete existing manifests — they
  // overwrite chapter-by-chapter so the UI does not flash empty.
  await syncDbChaptersToSkeletonCount(input.novelId, sk.chapters);
  const greenfieldWipe =
    chapter.chapterNumber === firstNum && live.scenes.length === 0;
  if (greenfieldWipe) {
    await input.status(input.novelId, {
      phase: "architect_manifests",
      label: "Architekt: Manifeste kapitelweise (Neustart)…",
      step: "architect_manifests",
      iteration,
      chapterNumber: firstNum,
    });
    await deleteNovelScenes(input.novelId);
    await persistSkeletonChapters({
      novelId: input.novelId,
      skeleton: sk,
      existingChapters: [],
      matrix: live.novel.stateMatrix ?? {},
    });
  } else if (chapter.chapterNumber === firstNum && iteration > 0) {
    await input.status(input.novelId, {
      phase: "architect_manifests",
      label: `Architekt: Manifeste nachbessern (Kapitelweise, behalte Bestand)…`,
      step: "architect_manifests",
      iteration,
      chapterNumber: firstNum,
    });
  }
  live = (await getNovelBundle(input.novelId)) ?? live;
  planChapters = live.chapters
    .filter((c) => skeletonNums.has(c.chapterNumber))
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  const chapterLive =
    planChapters.find((c) => c.chapterNumber === chapter.chapterNumber) ??
    planChapters[Math.max(0, chapterIdx)]!;
  const liveIdx = planChapters.findIndex(
    (c) => c.chapterNumber === chapterLive.chapterNumber,
  );

  // On score-rewrite: skip chapters whose existing scenes are already dense.
  if (iteration > 0 && live.scenes.length > 0) {
    const job = chapterLive.contract?.job ?? "escalate";
    const chain = pickBeatChain(job, chapterLive.chapterNumber);
    const existing = live.scenes
      .filter((s) => s.chapterId === chapterLive.id)
      .sort((a, b) => a.sceneIndex - b.sceneIndex);
    const denseEnough =
      existing.length >= chain.length &&
      chain.every((_, i) => {
        const s = existing[i];
        if (!s) return false;
        return !isThinSceneManifest(parseManifest(s.manifest ?? {}));
      });
    if (denseEnough) {
      const nextChapter = planChapters[liveIdx + 1];
      if (nextChapter) {
        return continueHop({
          novelId: input.novelId,
          step: "architect_manifests",
          chapterNumber: nextChapter.chapterNumber,
          iteration,
        });
      }
      // All remaining dense → audit again.
      return continueHop({
        novelId: input.novelId,
        step: "skeleton_audit_manifests",
        iteration,
      });
    }
  }

  await input.status(input.novelId, {
    phase: "architect_manifests",
    label: `Architekt: Manifeste Kap. ${chapterLive.chapterNumber}/${planChapters.length}…`,
    step: "architect_manifests",
    iteration,
    chapterNumber: chapterLive.chapterNumber,
  });

  const toneMode = detectToneModeFromBundle(live);
  const toneArchitect = formatToneContractForArchitect(toneMode);
  const pyramidStateBlock = formatPyramidStateForArchitect(
    getPyramidBookState(live),
  );
  const manifestFixBlock = structureFixBlock(live, "manifests");

  type ManifestRow = ReturnType<
    typeof coerceArchitectSceneManifests
  >["scenes"][number];

  function chapterIsThin(
    ch: (typeof planChapters)[number],
    rows: ManifestRow[],
  ): boolean {
    const job = ch.contract?.job ?? "escalate";
    const chain = pickBeatChain(job, ch.chapterNumber);
    const sorted = rows
      .filter((r) => r.chapterNumber === ch.chapterNumber)
      .sort((a, b) => a.sceneIndex - b.sceneIndex);
    for (let i = 0; i < chain.length; i++) {
      const src = sorted[i];
      if (!src?.manifest) return true;
      const m = { ...src.manifest, beat: chain[i]! };
      if (isThinSceneManifest(m as SceneManifest)) return true;
    }
    return false;
  }

  async function requestManifestsForChapter(
    ch: (typeof planChapters)[number],
    extraHint: string,
  ): Promise<ReturnType<typeof coerceArchitectSceneManifests>> {
    const job = ch.contract?.job ?? "escalate";
    const chain = pickBeatChain(job, ch.chapterNumber);
    const skCh = sk.chapters.find((c) => c.chapterNumber === ch.chapterNumber);
    const actNumber = skCh?.actNumber ?? 1;
    const skSlice = {
      premise: sk.premise,
      acts: sk.acts.filter((a) => a.actNumber === actNumber),
      chapter: skCh ?? {
        chapterNumber: ch.chapterNumber,
        title: ch.title,
        actNumber,
        job,
        goal: ch.outline.slice(0, 200),
        beats: [],
      },
    };
    const plotHint = chapterPlotBeatsHint(sk, ch.chapterNumber);
    // Fresh bundle each call so prior hops' manifests feed the plan-canon.
    const liveForCanon = (await getNovelBundle(input.novelId)) ?? live;
    const priorCanon = formatPriorManifestCanon(
      liveForCanon,
      ch.chapterNumber,
    );
    const kgBlock = formatKnowledgeGraphBlock(liveForCanon);
    const worldBlock = formatWorldBlock(liveForCanon);
    const ledgerBlock = formatLogicLedgerForAuthor(
      getLogicLedger(liveForCanon),
    );
    try {
      const raw = await generateAsEditorJson({
        role: "architect",
        maxTokens: 4_096,
        userText: `Erzeuge Szenen-Manifeste NUR für Kapitel ${ch.chapterNumber} „${ch.title}“ (Akt ${actNumber}).
Keine Prosa. GENAU ${chain.length} Szenen — Beat-Kette: ${chain.join("→")}.
sceneIndex 1..${chain.length}; beat exakt in Kettenreihenfolge; chapterNumber=${ch.chapterNumber}.

Pflicht pro Manifest (sonst dünn / kein Freeze):
- sceneGoal, conflict, turningBeat: je ein vollständiger Satz
- mustShow: 3–5 konkrete Beats (min. 2)
- mustNot: 1–3 Verbote
- characters: ≥1 Name; location + timeAnchor konkret (nie „offen“)
- situations: 3–5 geordnete Einzelhandlungen
- knowledgeAllowed / knowledgeForbidden: EXPLIZIT, konsistent zu Wissensgraph + geplanter Manifest-Kette (siehe unten)
${toneMode === "satire_humor" ? "- mustShow + situations: mind. ein satirischer Beat\n" : ""}
${toneArchitect ? `\n${toneArchitect}\n` : ""}
${pyramidStateBlock ? `${pyramidStateBlock}\n` : ""}
${kgBlock}
${ledgerBlock ? `${ledgerBlock}\n` : ""}
${worldBlock}
${priorCanon}

## Szenen-Beat-Taxonomie
${formatSceneBeatTaxonomy()}

Job: ${job}
${plotHint ? `## Kapitel-Plot-Beats\n${plotHint}\n` : ""}
## Nachbarkapitel (Dramaturgie / Kausalität)
${(() => {
  const prev = sk.chapters.find(
    (c) => c.chapterNumber === ch.chapterNumber - 1,
  );
  const next = sk.chapters.find(
    (c) => c.chapterNumber === ch.chapterNumber + 1,
  );
  return [
    prev
      ? `Vorher Kap.${prev.chapterNumber} „${prev.title}“: ${prev.goal.slice(0, 180)}`
      : "Vorher: (Buchstart)",
    next
      ? `Nachher Kap.${next.chapterNumber} „${next.title}“: ${next.goal.slice(0, 180)}`
      : "Nachher: (Buchende / Akt-Ende)",
  ].join("\n");
})()}
Kapitel-Outline:
${ch.outline.slice(0, 1_200)}
${manifestFixBlock}
${extraHint}

Antwort NUR JSON:
{"scenes":[{"chapterNumber":${ch.chapterNumber},"sceneIndex":1,"planSummary":"…","beat":"${chain[0] ?? "advance"}","manifest":{…}}],"stateDelta":{…},"nextPlan":{…}}
Extras: {${ARCHITECT_PYRAMID_EXTRAS_HINT}}
nextPlan.target MUSS "situations" sein.

Kontext:
${JSON.stringify(skSlice).slice(0, 4_000)}`,
      });
      const obj = await parseJsonObject(
        raw,
        `Architekt-Manifeste-Kap${ch.chapterNumber}`,
        '{"scenes":[]}',
      );
      return coerceArchitectSceneManifests(obj);
    } catch (err) {
      console.warn(
        `[novel/architect_manifests] Kap. ${ch.chapterNumber}:`,
        err instanceof Error ? err.message : err,
      );
      return { scenes: [] };
    }
  }

  let batch = await requestManifestsForChapter(chapterLive, "");
  let rows = batch.scenes.filter(
    (s) => s.chapterNumber === chapterLive.chapterNumber,
  );
  if (chapterIsThin(chapterLive, rows)) {
    batch = await requestManifestsForChapter(
      chapterLive,
      `NACHBESSERUNG Kap. ${chapterLive.chapterNumber}: Manifeste dünn/fehlend. Liefere erneut GENAU die Beat-Kette, dicht (mustShow≥3, situations≥3, Ort, Figuren).`,
    );
    rows = batch.scenes.filter(
      (s) => s.chapterNumber === chapterLive.chapterNumber,
    );
  }

  const job = chapterLive.contract?.job ?? "escalate";
  const chain = pickBeatChain(job, chapterLive.chapterNumber);
  const sortedRows = rows
    .slice()
    .sort((a, b) => a.sceneIndex - b.sceneIndex);

  const aligned: Array<{
    sceneIndex: number;
    planSummary: string;
    beat: NovelSceneBeat;
    manifest: SceneManifest;
    thin: boolean;
  }> = [];

  for (let i = 0; i < chain.length; i++) {
    const beat = chain[i]!;
    const src = sortedRows[i];
    if (!src?.manifest) {
      aligned.push({
        sceneIndex: i + 1,
        planSummary: `Kap. ${chapterLive.chapterNumber}: ${NOVEL_SCENE_BEAT_LABELS[beat]} (fehlt)`,
        beat,
        manifest: {
          sceneGoal: `FEHLT: Szene ${i + 1} Beat ${beat} — nachbessern.`,
          conflict: "FEHLT — Konflikt nachbessern.",
          turningBeat: "FEHLT — Wendung nachbessern.",
          beat,
          characters: [],
          knowledgeAllowed: [],
          knowledgeForbidden: [],
          emotionStart: "ok",
          emotionEnd: "ok",
          mustShow: [],
          mustNot: [],
          situations: [],
          location: "offen",
          timeAnchor: "",
          prevSummary3: "",
        },
        thin: true,
      });
      continue;
    }
    const baseManifest = { ...src.manifest, beat };
    const parsed = sceneManifestSchema.safeParse(baseManifest);
    const manifest = parsed.success
      ? { ...parsed.data, beat }
      : ({ ...baseManifest, beat } as SceneManifest);
    aligned.push({
      sceneIndex: i + 1,
      planSummary:
        src.planSummary?.trim() ||
        `Kap. ${chapterLive.chapterNumber}: ${NOVEL_SCENE_BEAT_LABELS[beat]}`,
      beat,
      manifest,
      thin: isThinSceneManifest(manifest),
    });
  }

  const scenePlan: ScenePlanBeat[] = aligned.map((a) => ({
    summary: a.planSummary,
    location: a.manifest.location,
    characters: a.manifest.characters,
    beat: a.beat,
  }));

  await upsertChapter({
    ...chapterLive,
    scenePlan,
    status: "scene_planning",
  });

  // Drop prior scenes for this chapter (re-run / repair), then upsert.
  const prior = live.scenes.filter((s) => s.chapterId === chapterLive.id);
  if (prior.length > 0) {
    // Soft: overwrite via upsert on same sceneIndex; extras beyond chain stay until full wipe.
  }

  for (const a of aligned) {
    const existing = live.scenes.find(
      (s) =>
        s.chapterId === chapterLive.id && s.sceneIndex === a.sceneIndex,
    );
    await upsertScene({
      id: existing?.id,
      novelId: input.novelId,
      chapterId: chapterLive.id,
      sceneIndex: a.sceneIndex,
      status: "pending",
      planSummary: a.planSummary,
      location: a.manifest.location,
      characters: a.manifest.characters,
      briefing: "",
      manifest: a.manifest as unknown as Record<string, unknown>,
      rawText: "",
      finalText: "",
      summary: "",
      score: 0,
      feedback: a.thin ? ["Dünnes Manifest — vor Freeze nachbessern."] : [],
      logicNotes: "",
      iteration: 0,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  const nextChapter = planChapters[liveIdx + 1];
  if (nextChapter) {
    return continueHop({
      novelId: input.novelId,
      step: "architect_manifests",
      chapterNumber: nextChapter.chapterNumber,
      iteration,
    });
  }

  const afterManifests = await getNovelBundle(input.novelId);
  const sceneCount = afterManifests?.scenes.length ?? 0;
  const scenesPair = coercePyramidPlanPair(
    {
      stateDelta:
        batch.stateDelta ??
        emptyStateDelta(
          `${sceneCount} Szenen-Manifeste über ${planChapters.length} Kapitel`.slice(
            0,
            400,
          ),
        ),
      nextPlan: batch.nextPlan ?? {
        target: "situations",
        countMin: 3,
        countMax: 5,
        structure: "Pro Szene 3–5 geordnete Einzelhandlungen",
        plot: "Draft spielt situations der Reihe nach",
        functions: [
          "Jede Situation = greifbare Handlung/Statusbruch",
          "Reihenfolge = Spannungsbogen der Szene",
        ],
        mustCover: [],
        mustNot: ["Keine abstrakten Absichten ohne sichtbare Aktion"],
      },
    },
    "situations",
  );
  await commitPyramidLevel({
    novelId: input.novelId,
    matrix: afterManifests?.novel.stateMatrix ?? live.novel.stateMatrix ?? {},
    level: "scenes",
    stateDelta: scenesPair.stateDelta,
    nextPlan: normalizeNextPlan(scenesPair.nextPlan, scenesPair.nextPlan),
  });

  try {
    const { graphDeltaFromManifests } = await import(
      "@/lib/novel/pyramid-graph"
    );
    const { persistPyramidGraphDelta } = await import(
      "@/lib/novel/pyramid-graph-sync"
    );
    const sceneRows = (afterManifests?.scenes ?? []).map((s) => {
      const ch =
        afterManifests?.chapters.find((c) => c.id === s.chapterId)
          ?.chapterNumber ?? 0;
      const m = parseManifest(s.manifest ?? {});
      return {
        chapterNumber: ch,
        sceneIndex: s.sceneIndex,
        beat: m?.beat,
        sceneGoal: m?.sceneGoal ?? s.planSummary,
        location: m?.location ?? s.location,
        characters: m?.characters ?? s.characters,
        mustShow: m?.mustShow,
        situations: m?.situations,
        knowledgeAllowed: m?.knowledgeAllowed,
        knowledgeForbidden: m?.knowledgeForbidden,
      };
    });
    await persistPyramidGraphDelta({
      novelId: input.novelId,
      layer: "scenes",
      replaceLayerEmbeddings: true,
      delta: graphDeltaFromManifests({ scenes: sceneRows }),
    });
  } catch (err) {
    console.warn("[novel/architect_manifests] pyramid graph sync:", err);
  }

  return continueHop({
    novelId: input.novelId,
    step: "skeleton_audit_manifests",
    iteration,
  });
}


function structureAuditUserPrompt(
  level: SkeletonStructureLevel,
  bundle: NovelBundle,
  collabTranscript?: string,
): string {
  const sk = parseSkeleton(bundle.novel.skeleton ?? {});
  const toneAudit = formatToneContractForAuditor(
    detectToneModeFromBundle(bundle),
  );
  const ideaBlock = formatIdeaForStructureAudit(bundle.novel.highConceptIdea);
  const ban = structureAuditIdeaBanBlock();
  const collab =
    collabTranscript?.trim()
      ? `\n## Architekt-Antworten (Zusammenarbeit — bei Neubewertung einbeziehen)\n${collabTranscript.trim()}\n`
      : "";
  const questionsHint = `Wenn etwas offen/fehlt: questions[] an den Architekten stellen (klare, lösbare Fragen). Nicht spekulieren und nicht die Idee angreifen.`;

  if (level === "acts") {
    return `Struktur-Audit AKTE (Logik + Dramaturgie, keine Prosa).
HARD-Gate: passed=true NUR bei score=10. Jeder Score unter 10 → passed=false.
score=10 nur wenn ALLES gilt:
1) Prämisse trägt die Idee (Treue — ohne die Idee als „unvollständig“ zu brandmarken)
2) 3 Akte kausal verkettet (Ursache→Wirkung); klare Eskalation Akt1→2→3; kein toter Faden
3) Ton-Vertrag (falls gesetzt) in den Summaries greifbar; dramaturgisch „wasserdicht“
4) KAPITEL-TRAGFÄHIGKEIT: JEDER Akt kann locker 5–7 Kapitel tragen (Phasen/Schauplätze/Konfliktschrauben in Summary und/oder Pyramid-State)

${ban}
${questionsHint}
High-Concept-Idee ist FIX — changeOrders/questions dürfen sie nicht umschreiben. Stofflücken → State/Akte.

Antwort NUR JSON:
{"passed":false,"score":7,"issues":[],"changeOrders":[],"questions":["…"]}

${toneAudit ? `${toneAudit}\n` : ""}${collab}
${ideaBlock}

Skelett (Akte):
${JSON.stringify({ premise: sk.premise, acts: sk.acts }).slice(0, 8_000)}`;
  }

  if (level === "chapters") {
    return `Struktur-Audit KAPITEL (Logik + Dramaturgie, keine Prosa).
HARD-Gate: passed=true NUR bei score=10. Score unter 10 → passed=false.
score=10 = „bereit für Szenen-Manifeste“ (Handwerks-Checkliste), kein Literaturpreis.

Checkliste für score=10 (alle Punkte):
1) Pro Akt 5–7 Kapitel (Gesamt ~15–21); kein Akt mit ≤3 Kapiteln
2) Jedes Kapitel hat greifbares goal + ≥2 Plot-beats
3) Jobs gemischt (nicht ≥70% escalate); Job-Sequenz dramaturgisch lesbar
4) Ziele bilden kausale Kette; jedes Kapitel bringt erkennbare Neuheit
5) must/mustNot kurz und nicht offensichtlich widersprüchlich (dürfen knapp sein)
6) Ton-Vertrag greifbar in mood/must wo gesetzt (Satire: mind. einige Kapitel mit komischem Einsatz)

Wenn Lücken: questions[] an den Architekten — konkrete, lösbare Fragen (welcher Akt zu dünn, welche Jobs kippen, wo Kausalität bricht). Nicht die Idee angreifen.

${ban}
${questionsHint}

Antwort NUR JSON:
{"passed":false,"score":7,"issues":[],"changeOrders":[],"questions":["…"]}

${toneAudit ? `${toneAudit}\n` : ""}${collab}
Akte:
${JSON.stringify(sk.acts).slice(0, 3_000)}

Kapitel (${sk.chapters.length}):
${JSON.stringify(
  sk.chapters.map((c) => ({
    n: c.chapterNumber,
    act: c.actNumber,
    job: c.job,
    title: c.title,
    goal: c.goal,
    beats: c.beats?.length ?? 0,
  })),
).slice(0, 8_000)}

${ideaBlock}`;
  }

  // Compact line format — full JSON was sliced at 12k chars and the auditor
  // falsely scored ~3/10 ("only Kap. 1–2 present") while all scenes existed in DB.
  const sortedScenes = bundle.scenes.slice().sort((a, b) => {
    const ca =
      bundle.chapters.find((c) => c.id === a.chapterId)?.chapterNumber ?? 0;
    const cb =
      bundle.chapters.find((c) => c.id === b.chapterId)?.chapterNumber ?? 0;
    if (ca !== cb) return ca - cb;
    return a.sceneIndex - b.sceneIndex;
  });
  const inventory = buildManifestInventory(bundle);
  const thinCount = inventory.thin;
  const manifestLines = sortedScenes.map((s) => {
    const ch =
      bundle.chapters.find((c) => c.id === s.chapterId)?.chapterNumber ?? "?";
    const m = parseManifest(s.manifest ?? {});
    const sits = (m?.situations ?? [])
      .map((x, i) => `${i + 1}:${String(x).slice(0, 48)}`)
      .join(" · ");
    const ka = (m?.knowledgeAllowed ?? []).slice(0, 3).join(";");
    const kf = (m?.knowledgeForbidden ?? []).slice(0, 3).join(";");
    return (
      `${ch}.${s.sceneIndex} beat=${m?.beat ?? "?"} thin=${isThinSceneManifest(m) ? 1 : 0}` +
      ` | ${String(m?.sceneGoal ?? s.planSummary).slice(0, 70)}` +
      ` | loc=${String(m?.location ?? "").slice(0, 28)}` +
      ` | chars=${(m?.characters ?? []).slice(0, 3).join(",")}` +
      ` | must=${(m?.mustShow ?? []).slice(0, 2).map((x) => String(x).slice(0, 36)).join(";")}` +
      ` | sit=${sits || "—"}` +
      ` | know+=${ka || "—"} know-=${kf || "—"}`
    );
  });
  const manifestBlock = manifestLines.join("\n");

  const perChapterInv = Object.entries(inventory.byChapter)
    .map(([n, c]) => `Kap.${n}=${c}`)
    .join(", ");

  const chapterBundleBlock = bundle.chapters
    .slice()
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .map((c) => {
      const scenes = bundle.scenes
        .filter((s) => s.chapterId === c.id)
        .sort((a, b) => a.sceneIndex - b.sceneIndex);
      const beats = scenes
        .map((s) => parseManifest(s.manifest ?? {})?.beat ?? "?")
        .join("→");
      const must = (c.contract?.must ?? []).join(" · ") || "—";
      const ending = c.contract?.endingFunction ?? "—";
      return `Kap.${c.chapterNumber} job=${c.contract?.job ?? "?"} ending=${String(ending).slice(0, 80)}
  must(Kapitel): ${must}
  Szenen-Beats: ${beats || "—"}
  goals: ${scenes.map((s) => `${s.sceneIndex}:${String(parseManifest(s.manifest ?? {})?.sceneGoal ?? s.planSummary).slice(0, 50)}`).join(" | ")}`;
    })
    .join("\n");

  return `Struktur-Audit SZENEN-MANIFESTE inkl. Situationen + KAPITEL-VERBUND (Logik + Dramaturgie, KEINE Prosa).
HARD-Gate: passed=true NUR bei score=10. Jeder Score unter 10 → passed=false.
score=10 nur wenn ALLES gilt:
1) Pro Szene: mustShow konkret; situations ≥3; Wissen/Ort stimmig; thin=false
2) KAPITEL-VERBUND (hart): Die Manifeste EINES Kapitels decken ZUSAMMEN job, Beat-Kette, Kapitel-must und endingFunction — nicht jede Einzelszene allein, aber die Summe muss wasserdicht sein
3) Kausalität Szenenfolge innerhalb jedes Kapitels; Ton-Vertrag greifbar in mustShow/situations
Dünne/fehlende situations oder Verbund-Lücken → stark abwerten und questions an den Architekten.

## MASCHINEN-INVENTAR (Quelle der Wahrheit — NICHT nachzählen, NICHT widersprechen)
- Gesamt: ${inventory.total} Szenen-Manifeste, thin=${thinCount}, complete=${inventory.complete ? "ja" : "nein"}
- Pro Kapitel: ${perChapterInv || "—"}
- IDs existieren alle in der DB; die Kurzliste ist nur eine kompakte Ansicht derselben Menge.
VERBOTEN (score davon nicht senken, nicht als Issue/ChangeOrder/Question):
- „Szenenregister rechnerisch widersprüchlich / Summe stimmt nicht“
- „Manifeste fehlen / Liste abgebrochen / Kapitel X–Y nicht prüfbar“ wenn complete=ja
- Nachzählen der Kurzliste gegen erfundene Gesamtsummen
- „Prosa bereitstellen / Tonprüfung erst mit Prosa“ — diese Ebene sind NUR Verträge/Manifeste

${ban}
${questionsHint}

Antwort NUR JSON:
{"passed":false,"score":7,"issues":[],"changeOrders":[],"questions":["…"]}

${toneAudit ? `${toneAudit}\n` : ""}${collab}
## Kapitel-Verbund (Contract vs. Szenen-Summe)
${chapterBundleBlock.slice(0, 10_000)}

Manifest-Kurzliste (${inventory.total} Szenen, Felder: beat/goal/loc/chars/must/sit/know+/know-):
${manifestBlock.slice(0, 24_000)}

${ideaBlock}`;
}

/**
 * Deterministic chapter-bundle check: each chapter contract.must / endingFunction
 * must be greifbar across that chapter's manifests (not in every scene).
 */
function chapterBundleManifestGaps(bundle: NovelBundle): string[] {
  const gaps: string[] = [];
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[„“"']/g, "")
      .replace(/\s+/g, " ")
      .trim();
  for (const ch of bundle.chapters) {
    const scenes = bundle.scenes
      .filter((s) => s.chapterId === ch.id)
      .sort((a, b) => a.sceneIndex - b.sceneIndex);
    if (scenes.length === 0) continue;
    const chapterBlob = norm(
      scenes
        .map((s) => {
          const m = parseManifest(s.manifest ?? {});
          return [
            m?.sceneGoal ?? s.planSummary,
            ...(m?.mustShow ?? []),
            ...(m?.situations ?? []),
          ].join(" ");
        })
        .join(" "),
    );
    for (const must of ch.contract?.must ?? []) {
      const tokens = norm(must)
        .split(/[^a-zäöüß0-9]+/i)
        .filter((t) => t.length >= 5)
        .slice(0, 4);
      if (tokens.length < 2) continue;
      const hits = tokens.filter((t) => chapterBlob.includes(t)).length;
      if (hits < Math.min(2, tokens.length)) {
        gaps.push(
          `Kap.${ch.chapterNumber}: Kapitel-must „${must.slice(0, 100)}“ ist in der Szenen-Summe (goal/mustShow/situations) nicht greifbar.`,
        );
      }
    }
    const ending = String(ch.contract?.endingFunction ?? "").trim();
    if (ending.length >= 16) {
      const last = scenes[scenes.length - 1]!;
      const m = parseManifest(last.manifest ?? {});
      const lastBlob = norm(
        [
          m?.sceneGoal ?? last.planSummary,
          ...(m?.mustShow ?? []),
          ...(m?.situations ?? []),
        ].join(" "),
      );
      const endTokens = norm(ending)
        .split(/[^a-zäöüß0-9]+/i)
        .filter((t) => t.length >= 5)
        .slice(0, 4);
      if (
        endTokens.length >= 2 &&
        endTokens.filter((t) => lastBlob.includes(t)).length < 1
      ) {
        gaps.push(
          `Kap.${ch.chapterNumber}: endingFunction in der letzten Szene (${last.sceneIndex}) nicht greifbar — Manifest der Schlussszene nachschärfen.`,
        );
      }
    }
  }
  return gaps.slice(0, 10);
}

function buildManifestInventory(bundle: NovelBundle): ManifestInventorySnapshot {
  const sk = parseSkeleton(bundle.novel.skeleton ?? {});
  const byChapter: Record<number, number> = {};
  const ids = new Set<string>();
  let thin = 0;
  for (const s of bundle.scenes) {
    const ch =
      bundle.chapters.find((c) => c.id === s.chapterId)?.chapterNumber ?? 0;
    if (ch < 1) continue;
    byChapter[ch] = (byChapter[ch] ?? 0) + 1;
    ids.add(`${ch}.${s.sceneIndex}`);
    if (isThinSceneManifest(parseManifest(s.manifest ?? {}))) thin += 1;
  }
  const planChapters =
    sk.chapters.length > 0
      ? sk.chapters
      : bundle.chapters.map((c) => ({
          chapterNumber: c.chapterNumber,
          job: c.contract?.job ?? "escalate",
        }));
  let complete = planChapters.length > 0 && bundle.scenes.length > 0;
  for (const c of planChapters) {
    const n = c.chapterNumber;
    const job =
      ("job" in c && typeof c.job === "string" ? c.job : null) ??
      bundle.chapters.find((x) => x.chapterNumber === n)?.contract?.job ??
      "escalate";
    const expect = pickBeatChain(job as never, n).length;
    if ((byChapter[n] ?? 0) !== expect) {
      complete = false;
      break;
    }
  }
  return {
    total: bundle.scenes.length,
    thin,
    ids,
    byChapter,
    complete,
  };
}

function sanitizeStructureAudit(
  audit: {
    passed: boolean;
    score: number;
    issues: string[];
    changeOrders: string[];
    questions?: string[];
  },
  opts?: {
    level?: SkeletonStructureLevel;
    inventory?: ManifestInventorySnapshot | null;
  },
): {
  passed: boolean;
  score: number;
  issues: string[];
  changeOrders: string[];
  questions: string[];
} {
  const filter =
    opts?.level === "manifests"
      ? (notes: string[]) =>
          filterBogusManifestInventoryNotes(notes, opts.inventory)
      : filterBogusStructureNotes;
  const issues = filter(audit.issues);
  const changeOrders = filter(audit.changeOrders);
  const questions = filter(audit.questions ?? []);

  let passed = audit.passed;
  let score = Math.round(audit.score);

  // Inventory hallucinations alone must not block Freeze when DB is complete.
  if (
    opts?.level === "manifests" &&
    opts.inventory?.complete &&
    (opts.inventory.thin ?? 1) === 0 &&
    issues.length === 0 &&
    changeOrders.length === 0
  ) {
    passed = true;
    score = 10;
  }

  return {
    passed,
    score,
    issues,
    changeOrders,
    questions,
  };
}

/**
 * Logic + dramaturgy gate between architect pyramid levels.
 * Acts/chapters: agentic auditor↔architect collab before rewrite / gate.
 * Fail after collab+rewrites → HITL structure_gate.
 */
export async function runSkeletonStructureAudit(input: {
  novelId: string;
  level: SkeletonStructureLevel;
  iteration?: number;
  status: StatusFn;
}): Promise<TreeHopOutcome> {
  const bundle = await getNovelBundle(input.novelId);
  if (!bundle) throw new Error("Roman nicht gefunden.");
  const iteration = Math.max(0, input.iteration ?? 0);
  const level = input.level;
  const phase =
    level === "acts"
      ? ("skeleton_audit_acts" as const)
      : level === "chapters"
        ? ("skeleton_audit_chapters" as const)
        : ("skeleton_audit_manifests" as const);
  const labelLevel =
    level === "acts" ? "Akte" : level === "chapters" ? "Kapitel" : "Manifeste";

  await input.status(input.novelId, {
    phase,
    label: `Struktur-Audit ${labelLevel} (Logik/Dramaturgie)…`,
    step: phase,
    iteration,
  });

  const sk = parseSkeleton(bundle.novel.skeleton ?? {});
  const pyramidBlock = formatPyramidStateForArchitect(
    getPyramidBookState(bundle),
  );
  let workingBundle = bundle;
  let artifactJson =
    level === "acts"
      ? JSON.stringify({ premise: sk.premise, acts: sk.acts })
      : level === "chapters"
        ? JSON.stringify({ acts: sk.acts, chapters: sk.chapters })
        : JSON.stringify(
            bundle.scenes.slice(0, 80).map((s) => {
              const m = parseManifest(s.manifest ?? {});
              return {
                chapter:
                  bundle.chapters.find((c) => c.id === s.chapterId)
                    ?.chapterNumber ?? null,
                scene: s.sceneIndex,
                plan: s.planSummary,
                beat: m?.beat,
                situations: m?.situations ?? [],
                mustShow: m?.mustShow ?? [],
                location: m?.location,
                thin: isThinSceneManifest(m),
              };
            }),
          );

  let collabTranscript = "";
  let collabFixOrders: string[] = [];
  const manifestInventory =
    level === "manifests" ? buildManifestInventory(bundle) : null;
  const sanitizeOpts = {
    level,
    inventory: manifestInventory,
  } as const;
  let audit = sanitizeStructureAudit(
    await parseJson(
      await generateAsEditorJson({
        role: "auditor",
        userText: structureAuditUserPrompt(level, bundle),
      }),
      skeletonStructureAuditSchema,
      `Struktur-Audit-${labelLevel}`,
      '{"passed":false,"score":5,"issues":[],"changeOrders":[],"questions":[]}',
    ),
    sanitizeOpts,
  );

  const collabRounds =
    level === "acts"
      ? TREE_STRUCTURE_COLLAB_ROUNDS_ACTS
      : level === "chapters"
        ? TREE_STRUCTURE_COLLAB_ROUNDS_CHAPTERS
        : TREE_STRUCTURE_COLLAB_ROUNDS_MANIFESTS;

  const requiresPerfectTen =
    level === "acts" || level === "chapters" || level === "manifests";

  for (let round = 0; round < collabRounds; round++) {
    const scoreNow = audit.score;
    const passedNow = requiresPerfectTen
      ? scoreNow >= 10
      : Boolean(audit.passed);
    if (passedNow) break;

    await input.status(input.novelId, {
      phase,
      label: `${labelLevel}: Auditor fragt Architekt (Runde ${round + 1})…`,
      step: phase,
      iteration,
    });

    const consult = await consultArchitectOnStructureGaps({
      level,
      idea: bundle.novel.highConceptIdea,
      artifactJson,
      pyramidStateBlock: pyramidBlock,
      issues: audit.issues,
      changeOrders: audit.changeOrders,
      questions: audit.questions,
    });
    if (!consult.transcript && !consult.fixOrders.length) break;

    collabTranscript = [collabTranscript, consult.transcript]
      .filter(Boolean)
      .join("\n\n");
    collabFixOrders = [
      ...collabFixOrders,
      ...consult.fixOrders,
    ].slice(0, 10);

    // Chapters: apply architect repair to skeleton before re-score (agentic close-the-loop).
    if (level === "chapters") {
      await input.status(input.novelId, {
        phase,
        label: `Kapitel: Architekt setzt Collab um (Repair)…`,
        step: phase,
        iteration,
      });
      const live = await getNovelBundle(input.novelId);
      if (live) {
        const liveSk = parseSkeleton(live.novel.skeleton ?? {});
        const repaired = await repairChaptersFromCollab({
          idea: live.novel.highConceptIdea,
          premise: liveSk.premise,
          actsJson: JSON.stringify(liveSk.acts),
          chapters: liveSk.chapters,
          transcript: collabTranscript,
          fixOrders: collabFixOrders,
          issues: audit.issues,
        });
        if (repaired.length >= 10) {
          await persistSkeletonChapters({
            novelId: input.novelId,
            skeleton: { ...liveSk, chapters: repaired },
            existingChapters: live.chapters,
            matrix: live.novel.stateMatrix ?? {},
          });
          const refreshed = await getNovelBundle(input.novelId);
          if (refreshed) {
            workingBundle = refreshed;
            const rSk = parseSkeleton(refreshed.novel.skeleton ?? {});
            artifactJson = JSON.stringify({
              acts: rSk.acts,
              chapters: rSk.chapters,
            });
          }
        }
      }
    }

    // Manifests: apply collab into DB scenes — otherwise re-score sees the same gaps.
    if (level === "manifests") {
      const targetChapters = extractChapterNumbersFromStructureNotes([
        ...audit.issues,
        ...audit.changeOrders,
        ...collabFixOrders,
        ...audit.questions,
      ]);
      if (targetChapters.length > 0) {
        await input.status(input.novelId, {
          phase,
          label: `Manifeste: Architekt patched Kap. ${targetChapters.join(",")}…`,
          step: phase,
          iteration,
        });
        const live = await getNovelBundle(input.novelId);
        if (live) {
          const sceneRows = live.scenes
            .map((s) => {
              const chNum =
                live.chapters.find((c) => c.id === s.chapterId)
                  ?.chapterNumber ?? 0;
              if (!targetChapters.includes(chNum)) return null;
              const m = parseManifest(s.manifest ?? {});
              return {
                chapterNumber: chNum,
                sceneIndex: s.sceneIndex,
                planSummary: s.planSummary,
                beat: m?.beat,
                manifest: m,
              };
            })
            .filter(Boolean);
          const repairedScenes = await repairManifestsFromCollab({
            idea: live.novel.highConceptIdea,
            chapterNumbers: targetChapters,
            scenesJson: JSON.stringify(sceneRows).slice(0, 10_000),
            chapterJobsJson: JSON.stringify(
              live.chapters
                .filter((c) => targetChapters.includes(c.chapterNumber))
                .map((c) => ({
                  n: c.chapterNumber,
                  job: c.contract?.job,
                  title: c.title,
                  outline: c.outline.slice(0, 200),
                })),
            ),
            transcript: collabTranscript,
            fixOrders: collabFixOrders,
            issues: audit.issues,
          });
          for (const row of repairedScenes) {
            const chapter = live.chapters.find(
              (c) => c.chapterNumber === row.chapterNumber,
            );
            if (!chapter) continue;
            const existing = live.scenes.find(
              (s) =>
                s.chapterId === chapter.id &&
                s.sceneIndex === row.sceneIndex,
            );
            const beat =
              row.beat ??
              (row.manifest as { beat?: NovelSceneBeat })?.beat ??
              "advance";
            const manifest = {
              ...row.manifest,
              beat,
            } as SceneManifest;
            await upsertScene({
              id: existing?.id,
              novelId: input.novelId,
              chapterId: chapter.id,
              sceneIndex: row.sceneIndex,
              status: "pending",
              planSummary: row.planSummary,
              location: manifest.location ?? "",
              characters: manifest.characters ?? [],
              briefing: "",
              manifest: manifest as unknown as Record<string, unknown>,
              rawText: existing?.rawText ?? "",
              finalText: existing?.finalText ?? "",
              summary: existing?.summary ?? "",
              score: 0,
              feedback: isThinSceneManifest(manifest)
                ? ["Dünnes Manifest — vor Freeze nachbessern."]
                : [],
              logicNotes: "",
              iteration: 0,
              createdAt: existing?.createdAt ?? new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
          const refreshed = await getNovelBundle(input.novelId);
          if (refreshed) {
            workingBundle = refreshed;
            artifactJson = JSON.stringify(
              refreshed.scenes.slice(0, 80).map((s) => {
                const m = parseManifest(s.manifest ?? {});
                return {
                  chapter:
                    refreshed.chapters.find((c) => c.id === s.chapterId)
                      ?.chapterNumber ?? null,
                  scene: s.sceneIndex,
                  plan: s.planSummary,
                  beat: m?.beat,
                  chars: m?.characters,
                  situations: m?.situations ?? [],
                  mustShow: m?.mustShow ?? [],
                  location: m?.location,
                  thin: isThinSceneManifest(m),
                };
              }),
            );
          }
        }
      }
    }

    await input.status(input.novelId, {
      phase,
      label: `${labelLevel}: Neubewertung nach Architekt-Antwort…`,
      step: phase,
      iteration,
    });

    const auditBundle =
      (await getNovelBundle(input.novelId)) ?? workingBundle;
    const inventoryLive =
      level === "manifests" ? buildManifestInventory(auditBundle) : null;
    audit = sanitizeStructureAudit(
      await parseJson(
        await generateAsEditorJson({
          role: "auditor",
          userText: structureAuditUserPrompt(
            level,
            auditBundle,
            collabTranscript,
          ),
        }),
        skeletonStructureAuditSchema,
        `Struktur-Audit-${labelLevel}-Collab`,
        '{"passed":false,"score":5,"issues":[],"changeOrders":[],"questions":[]}',
      ),
      { level, inventory: inventoryLive },
    );
  }

  let score = audit.score;
  let bundleIssues = [...audit.issues];
  let bundleOrders = [...audit.changeOrders];
  if (level === "manifests") {
    const gaps = chapterBundleManifestGaps(
      (await getNovelBundle(input.novelId)) ?? workingBundle,
    );
    if (gaps.length > 0) {
      bundleIssues = [...bundleIssues, ...gaps];
      bundleOrders = [
        ...bundleOrders,
        ...gaps.map((g) =>
          g.replace(/^Kap\.\d+:\s*/, "Manifeste anpassen: ").slice(0, 280),
        ),
      ];
      score = Math.min(score, 6);
    }
  }

  // Acts / chapters / manifests: only perfect 10/10 advances.
  const passed = requiresPerfectTen ? score >= 10 : Boolean(audit.passed);
  const notes = [
    ...bundleIssues,
    ...bundleOrders.map((c) => `→ Ändere: ${c}`),
    ...collabFixOrders.map((c) => `→ Collab: ${c}`),
    ...(collabTranscript
      ? [`## Architekt-Collab\n${collabTranscript}`]
      : []),
    ...(requiresPerfectTen && !passed && score < 10
      ? [
          `→ ${labelLevel} brauchen Score 10/10 (aktuell ${score}/10).`,
        ]
      : []),
  ]
    .map((n) => structureNoteToString(n))
    .filter((n) => n && n !== "[object Object]")
    .join("\n");
  const report: StructureLevelReport = {
    passed,
    score,
    issues: bundleIssues
      .map((n) => structureNoteToString(n))
      .filter((n) => n && n !== "[object Object]"),
    changeOrders: [...bundleOrders, ...collabFixOrders]
      .map((n) => structureNoteToString(n))
      .filter((n) => n && n !== "[object Object]")
      .slice(0, 8),
    updatedAt: new Date().toISOString(),
  };

  if (passed) {
    await persistStructureLevelReport(
      input.novelId,
      bundle.novel.stateMatrix ?? {},
      level,
      report,
      null,
    );

    const scoreLabel = `Score ${report.score}/10`;
    if (level === "acts") {
      await input.status(input.novelId, {
        phase: "architect_chapters",
        label: `Akte OK (${scoreLabel}) — Kapitel…`,
        step: "architect_chapters",
      });
      return continueHop({
        novelId: input.novelId,
        step: "architect_chapters",
        iteration: 0,
      });
    }
    if (level === "chapters") {
      await input.status(input.novelId, {
        phase: "architect_manifests",
        label: `Kapitel OK (${scoreLabel}) — Manifeste…`,
        step: "architect_manifests",
      });
      return continueHop({
        novelId: input.novelId,
        step: "architect_manifests",
        iteration: 0,
      });
    }

    // Manifests passed → human freeze gate
    const after = await getNovelBundle(input.novelId);
    const sceneCount = after?.scenes.length ?? 0;
    const thinManifests =
      after?.scenes.filter((s) =>
        isThinSceneManifest(parseManifest(s.manifest ?? {})),
      ).length ?? 0;
    await input.status(
      input.novelId,
      {
        phase: "architect_manifests",
        label:
          thinManifests > 0
            ? `Manifeste ${scoreLabel}, aber ${thinManifests} dünn — Freeze erst nach Nachbesserung.`
            : `Struktur OK (Akte/Kapitel/Manifeste) · Manifeste ${scoreLabel} · ${sceneCount} Szenen — Freeze.`,
        step: "architect_manifests",
        haltReason: "skeleton_gate",
        error:
          thinManifests > 0
            ? `${thinManifests} Manifest(e) zu dünn für Freeze.`
            : null,
      },
      "paused",
    );
    return { outcome: "ok" };
  }

  await persistStructureLevelReport(
    input.novelId,
    bundle.novel.stateMatrix ?? {},
    level,
    report,
    {
      level,
      notes,
      updatedAt: new Date().toISOString(),
      score: report.score,
      passed: false,
    },
  );

  const maxRewrites =
    level === "acts"
      ? TREE_MAX_ACTS_STRUCTURE_REWRITES
      : level === "chapters"
        ? TREE_MAX_CHAPTERS_STRUCTURE_REWRITES
        : TREE_MAX_MANIFESTS_STRUCTURE_REWRITES;
  if (iteration < maxRewrites) {
    const rewriteStep =
      level === "acts"
        ? "architect_acts"
        : level === "chapters"
          ? "architect_chapters"
          : "architect_manifests";
    await input.status(input.novelId, {
      phase: rewriteStep,
      label: `${labelLevel} ${report.score}/10 — Nachbesserung (Ziel 10/10, State/Manifeste)…`,
      step: rewriteStep,
      iteration: iteration + 1,
      error: notes.slice(0, 240),
    });
    return continueHop({
      novelId: input.novelId,
      step: rewriteStep,
      iteration: iteration + 1,
    });
  }

  await input.status(
    input.novelId,
    {
      phase,
      label: `Struktur-Stopp ${labelLevel} (Score ${report.score}/10): Logik/Dramaturgie offen.`,
      step: phase,
      iteration,
      haltReason: "structure_gate",
      error: notes.slice(0, 240),
    },
    "paused",
  );
  return { outcome: "ok" };
}

/**
 * Freeze pyramid contracts only — no prose auto-start.
 * Next: compile_prose_briefs, then scene_dispatch.
 */
export async function freezeSkeletonAndStartWriting(
  novelId: string,
): Promise<NovelJobHop> {
  let bundle = await getNovelBundle(novelId);
  if (!bundle) throw new Error("Roman nicht gefunden.");
  const sk = parseSkeleton(bundle.novel.skeleton ?? {});
  if (sk.chapters.length > 0) {
    const trimmed = await syncDbChaptersToSkeletonCount(novelId, sk.chapters);
    if (trimmed > 0) {
      console.warn(
        `[novel/freeze] ${trimmed} überzählige Kapitel vor Freeze gelöscht.`,
      );
      bundle = (await getNovelBundle(novelId)) ?? bundle;
    }
  }
  const skeletonChapterIds = new Set(
    bundle.chapters
      .filter((c) =>
        sk.chapters.some((sc) => sc.chapterNumber === c.chapterNumber),
      )
      .map((c) => c.id),
  );
  const scenesInScope = bundle.scenes.filter((s) =>
    skeletonChapterIds.has(s.chapterId),
  );
  const thin = scenesInScope.filter((s) =>
    isThinSceneManifest(parseManifest(s.manifest ?? {})),
  );
  if (thin.length > 0) {
    throw new Error(
      `${thin.length} Manifest(e) zu dünn (mustShow≥2, situations≥3, Ort≠offen, ≥1 Figur). Bitte Skelett nachbessern, dann erneut Freeze.`,
    );
  }
  if (scenesInScope.length === 0) {
    throw new Error("Keine Szenen-Manifeste — Architekt zuerst ausführen.");
  }
  await updateNovel({
    id: novelId,
    skeletonFrozen: true,
    status: "paused",
    orchestratorStatus: {
      phase: "prose_pending",
      label: `Pyramide freigegeben (${scenesInScope.length} Szenen-Verträge) — Prosa-Prompts kompilieren.`,
      step: "compile_prose_briefs",
      haltReason: null,
      error: null,
      updatedAt: new Date().toISOString(),
    },
  });
  // Caller must NOT auto-enqueue prose; hop is informational for UI.
  return { novelId, step: "compile_prose_briefs" };
}

/** Compile prose briefs from graph + manifests into scene.briefing. */
export async function runCompileProseBriefs(input: {
  novelId: string;
  status: StatusFn;
}): Promise<TreeHopOutcome> {
  const bundle = await getNovelBundle(input.novelId);
  if (!bundle) throw new Error("Roman nicht gefunden.");
  if (!bundle.novel.skeletonFrozen) {
    throw new Error("Pyramide noch nicht freigegeben.");
  }

  await input.status(input.novelId, {
    phase: "compile_prose_briefs",
    label: "Kompiliere Prosa-Prompts aus Graph + Manifesten…",
    step: "compile_prose_briefs",
  });

  const { compileAllSceneProseBriefs } = await import("@/lib/novel/prose-brief");
  const briefs = await compileAllSceneProseBriefs(bundle);
  for (const row of briefs) {
    const scene = bundle.scenes.find((s) => s.id === row.sceneId);
    if (!scene) continue;
    await upsertScene({
      ...scene,
      briefing: row.brief,
      status: "pending",
    });
  }

  await input.status(
    input.novelId,
    {
      phase: "prose_pending",
      label: `${briefs.length} Prosa-Prompts bereit — „Prosa schreiben“ starten.`,
      step: "scene_dispatch",
      haltReason: null,
      error: null,
    },
    "paused",
  );
  return { outcome: "ok" };
}

export async function runSceneDispatch(input: {
  novelId: string;
  status: StatusFn;
}): Promise<TreeHopOutcome> {
  let bundle = await getNovelBundle(input.novelId);
  if (!bundle) throw new Error("Roman nicht gefunden.");
  const skDispatch = parseSkeleton(bundle.novel.skeleton ?? {});
  if (skDispatch.chapters.length > 0) {
    const trimmed = await syncDbChaptersToSkeletonCount(
      input.novelId,
      skDispatch.chapters,
    );
    if (trimmed > 0) {
      bundle = (await getNovelBundle(input.novelId)) ?? bundle;
    }
  }
  if (!bundle.novel.skeletonFrozen) {
    await input.status(
      input.novelId,
      {
        phase: "architect_manifests",
        label: "Skelett noch nicht freigegeben.",
        step: "architect_manifests",
        haltReason: "skeleton_gate",
      },
      "paused",
    );
    return { outcome: "ok" };
  }

  const next = sortScenes(bundle).find((s) => s.status !== "approved");
  if (!next) {
    await input.status(
      input.novelId,
      {
        phase: "completed",
        label: "Alle Szenen fertig — Abnahme unter Export.",
        step: "completed",
      },
      "completed",
    );
    return { outcome: "ok" };
  }

  const chapter = bundle.chapters.find((c) => c.id === next.chapterId);
  return continueHop({
    novelId: input.novelId,
    step: "scene_draft",
    sceneId: next.id,
    chapterNumber: chapter?.chapterNumber,
    iteration: next.iteration ?? 0,
  });
}

function prevSummary3(bundle: NovelBundle, scene: NovelScene): string {
  const ordered = sortScenes(bundle);
  const idx = ordered.findIndex((s) => s.id === scene.id);
  if (idx <= 0) return "";
  const prev = ordered[idx - 1]!;
  if (prev.summary.trim()) return prev.summary.trim().slice(0, 600);
  const text = (prev.finalText || prev.rawText).trim();
  if (!text) return "";
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(-3).join(" ").slice(0, 600);
}

export async function runSceneDraft(input: {
  novelId: string;
  sceneId: string;
  iteration?: number;
  status: StatusFn;
}): Promise<TreeHopOutcome> {
  const bundle = await getNovelBundle(input.novelId);
  if (!bundle) throw new Error("Roman nicht gefunden.");
  const scene = bundle.scenes.find((s) => s.id === input.sceneId);
  if (!scene) throw new Error("Szene nicht gefunden.");
  const chapter = bundle.chapters.find((c) => c.id === scene.chapterId);
  if (!chapter) throw new Error("Kapitel fehlt.");
  const iteration = Math.max(0, input.iteration ?? scene.iteration ?? 0);

  let manifest = parseManifest(scene.manifest ?? {});
  if (!manifest) {
    throw new Error(
      `Szene ${chapter.chapterNumber}.${scene.sceneIndex}: Manifest fehlt/ungültig.`,
    );
  }
  const prev3 = prevSummary3(bundle, scene) || manifest.prevSummary3;
  manifest = { ...manifest, prevSummary3: prev3 };

  const slice = buildStateSlice(bundle.novel.stateMatrix ?? {}, manifest);

  await input.status(input.novelId, {
    phase: "scene_draft",
    label: `Draft Kap. ${chapter.chapterNumber}.${scene.sceneIndex}${iteration ? ` (Logik-Rewrite ${iteration})` : ""}…`,
    step: "scene_draft",
    sceneId: scene.id,
    chapterNumber: chapter.chapterNumber,
    iteration,
  });

  await upsertScene({
    ...scene,
    status: "drafting",
    manifest: manifest as unknown as Record<string, unknown>,
    iteration,
  });

  // HITL „Übergeben“ resets iteration but keeps logicNotes — always apply them.
  const logicNotes = scene.logicNotes.trim();
  const priorProse = scene.rawText.trim();
  const reviseFromPrior =
    Boolean(logicNotes) && priorProse.length >= 80;
  const logicBlock = logicNotes
    ? `\n## Logik-Korrekturen (nur Struktur umsetzen, Stil egal)\n${logicNotes}\n`
    : "";

  const beat = manifest.beat;
  const beatReg = beat
    ? getSceneBeatRegister(beat)
        .map((r) => `- ${r}`)
        .join("\n")
    : "";
  const beatHint = beat
    ? `\n## Szenen-Beat (Struktur — Haltung nur andeuten, Stil kommt später)
Beat: ${beat} (${NOVEL_SCENE_BEAT_LABELS[beat]})
${beatReg}
`
    : "";

  const contractBlock = formatContractForAuthor(chapter.contract);
  const job = chapter.contract?.job ?? "escalate";
  const beatChain = formatBeatChainMandate(job, chapter.chapterNumber);
  const scenePlanBlock = formatScenePlanForAuthor(chapter.scenePlan);
  const endingBudget = formatEndingGestureBudget(
    priorChapterTexts(bundle, chapter.chapterNumber),
  );
  const ledgerBlock = formatLogicLedgerForAuthor(getLogicLedger(bundle));
  const toneMode = detectToneModeFromBundle(bundle);
  const toneAuthor = formatToneContractForAuthor(toneMode);
  const voiceBlock = formatVoiceCardForAuthor(
    getVoiceCard(bundle),
    chapter.chapterNumber,
  );
  const situationsBlock =
    manifest.situations?.length > 0
      ? `## Situationen / Einzelhandlungen (Reihenfolge spielen)
${manifest.situations.map((s, i) => `${i + 1}. ${s}`).join("\n")}
Jede Nummer muss in der Prosa greifbar vorkommen — nicht nur andeuten.
`
      : "";
  const situationsMandate = formatNextPlanMandate(
    getNextPlanFor(getPyramidBookState(bundle), "scenes"),
    "situations",
  );

  const proseBrief = scene.briefing.trim();
  const briefBlock =
    proseBrief.length >= 40
      ? `\n## Prosa-Brief (aus Pyramid-Graph kompiliert — verbindlich)\n${proseBrief.slice(0, 6_000)}\n`
      : "";

  const sharedContext = `## Pyramid-Kontext (verbindlich)
${briefBlock || "Manifest + Situationen + State-Slice + Contract + Beat-Kette + Ledger + Ending-Budget. Kein anderer Plot erfinden."}
${toneAuthor ? `${toneAuthor}\n` : ""}
${situationsMandate ? `${situationsMandate}\n` : ""}
${beatHint}
${beatChain.block}

${contractBlock ? `${contractBlock}\n` : ""}
${scenePlanBlock ? `${scenePlanBlock}\n` : ""}
${situationsBlock}
${ledgerBlock ? `${ledgerBlock}\n` : ""}
${endingBudget}

${voiceBlock}

${NOVEL_AUTHOR_DRAFT_CRAFT}

## Manifest (verbindlich, unveränderlich)
${JSON.stringify(manifest, null, 2)}

## State-Slice
${JSON.stringify(slice, null, 2)}
${logicBlock}`;

  const priorWords = countNovelWords(priorProse);
  const prose = await generateAsAuthor({
    userText: reviseFromPrior
      ? `Überarbeite den Rohtext so, dass ALLE Logik-Korrekturen erfüllt sind.
Behalte brauchbare Passagen; ändere nur das Nötige (Struktur/Handlung laut Hinweisen). Keine komplette Neuerfindung, kein Stil-Politur-Pass.

## Länge
Mind. ${Math.max(TREE_SCENE_MIN_WORDS, Math.round(priorWords * 0.9))} Wörter (bisher ca. ${priorWords}).

${sharedContext}

## Aktueller Rohtext (korrigieren)
${priorProse.slice(0, 14_000)}

Ausgabe: nur die korrigierte Prosa, keine Meta, keine Wortzahl-Angabe.`
      : `Schreibe die Szene als fortlaufende Rohprosa.

## Länge (Pflicht)
Ziel: ${TREE_SCENE_TARGET_WORDS} Wörter (±15 %). Minimum ${TREE_SCENE_MIN_WORDS}. Nicht abbrechen, nicht skizzieren.

${sharedContext}
Ausgabe: nur Prosa, keine Meta, keine Wortzahl-Angabe.`,
  });

  await upsertScene({
    ...scene,
    status: "auditing",
    rawText: prose.trim(),
    manifest: manifest as unknown as Record<string, unknown>,
    iteration,
  });

  return continueHop({
    novelId: input.novelId,
    step: "logic_audit",
    sceneId: scene.id,
    chapterNumber: chapter.chapterNumber,
    iteration,
  });
}

function formatLogicAuditNotes(audit: {
  issues: string[];
  changeOrders: string[];
  stellen?: string[];
}): string {
  const stellenLines = (audit.stellen ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length >= 8)
    .map((s) => `Stelle: „${s}“`);
  return [
    ...audit.issues,
    ...stellenLines,
    ...audit.changeOrders.map((c) => `→ Ändere: ${c}`),
  ].join("\n");
}

function normalizeAuditNeedle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[„“"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Drop scene-logic fails that demand chapter-wide musts / endingFunction
 * not owned by this scene's manifest, or pedantic "betreten"-literalism.
 */
function sanitizeSceneLogicAudit(
  audit: {
    passed: boolean;
    issues: string[];
    changeOrders: string[];
    stellen?: string[];
  },
  opts: {
    contract: NovelChapterContract | null | undefined;
    manifest: SceneManifest;
    sceneIndex: number;
    sceneCountInChapter: number;
  },
): {
  passed: boolean;
  issues: string[];
  changeOrders: string[];
  stellen: string[];
} {
  const ownedBlob = normalizeAuditNeedle(
    [
      ...(opts.manifest.mustShow ?? []),
      ...(opts.manifest.situations ?? []),
      opts.manifest.sceneGoal ?? "",
    ].join(" "),
  );
  const chapterMusts = opts.contract?.must ?? [];
  const isLast =
    opts.sceneCountInChapter > 0 &&
    opts.sceneIndex >= opts.sceneCountInChapter;

  const isOutOfScopeChapterMust = (text: string): boolean => {
    const n = normalizeAuditNeedle(text);
    if (!/(vertragsschuld|zahlungsmittel|kapitel-?muss|muss\b|ending|kapitelende)/i.test(text)) {
      // Still catch generic "Contract verlangt X" for musts not in owned blob.
      if (!/contract|vertrag|muss/i.test(text)) return false;
    }
    for (const must of chapterMusts) {
      const mustN = normalizeAuditNeedle(must);
      if (mustN.length < 8) continue;
      const keyTokens = mustN
        .split(/[^a-zäöüß0-9]+/i)
        .filter((t) => t.length >= 5)
        .slice(0, 4);
      const mentionsMust =
        n.includes(mustN.slice(0, 24)) ||
        (keyTokens.length >= 2 && keyTokens.every((t) => n.includes(t)));
      if (!mentionsMust) continue;
      // Owned by this scene if manifest already asks for overlapping tokens.
      const owned =
        keyTokens.length > 0 &&
        keyTokens.filter((t) => ownedBlob.includes(t)).length >=
          Math.min(2, keyTokens.length);
      if (!owned) return true;
    }
    if (
      !isLast &&
      /ending|kapitelende|schlussfunktion|endingfunction/i.test(text)
    ) {
      return true;
    }
    return false;
  };

  const isPedanticEnter = (text: string): boolean => {
    // "betritt … nicht" while situation already covers enter+check — common false fail.
    if (!/betritt|betreten|tritt .* ein/i.test(text)) return false;
    if (!/nicht|fehlt|kein|ohne/i.test(text)) return false;
    return /musterwohnung|wohnung|zugang|bewegungsfläche|tür/i.test(ownedBlob);
  };

  const filterLine = (text: string): boolean => {
    const t = text.trim();
    if (!t) return false;
    if (isOutOfScopeChapterMust(t)) return false;
    if (isPedanticEnter(t)) return false;
    return true;
  };

  const issues = audit.issues.filter(filterLine);
  const changeOrders = audit.changeOrders.filter(filterLine);
  const stellen = (audit.stellen ?? []).filter((s) => s.trim().length >= 8);

  const passed =
    audit.passed || (issues.length === 0 && changeOrders.length === 0);

  return { passed, issues, changeOrders, stellen };
}

/**
 * Sync logic check (Manifest + State vs. prose). Used by hop + HITL recheck.
 */
export async function auditSceneAgainstManifest(input: {
  novelId: string;
  sceneId: string;
  /** Override prose (e.g. just-saved edit); defaults to scene.rawText. */
  rawText?: string;
}): Promise<{
  passed: boolean;
  issues: string[];
  changeOrders: string[];
  stellen: string[];
  notes: string;
  chapterNumber: number;
  sceneIndex: number;
}> {
  const bundle = await getNovelBundle(input.novelId);
  if (!bundle) throw new Error("Roman nicht gefunden.");
  const scene = bundle.scenes.find((s) => s.id === input.sceneId);
  if (!scene) throw new Error("Szene nicht gefunden.");
  const chapter = bundle.chapters.find((c) => c.id === scene.chapterId);
  if (!chapter) throw new Error("Kapitel fehlt.");
  const manifest = parseManifest(scene.manifest ?? {});
  if (!manifest) throw new Error("Manifest fehlt.");

  const prose = (input.rawText ?? scene.rawText).trim();
  const slice = buildStateSlice(bundle.novel.stateMatrix ?? {}, manifest);
  const siblingScenes = bundle.scenes.filter((s) => s.chapterId === chapter.id);
  const sceneCountInChapter = Math.max(
    siblingScenes.length,
    chapter.scenePlan?.length ?? 0,
    1,
  );
  const contractCheck = formatContractForSceneLogicAudit({
    contract: chapter.contract,
    sceneIndex: scene.sceneIndex,
    sceneCountInChapter,
    beat: manifest.beat,
    manifestMustShow: manifest.mustShow,
    manifestSituations: manifest.situations,
  });
  const beatsCheck = formatSceneBeatsForEditor(chapter.scenePlan);
  const ledgerCheck = formatLogicLedgerForEditor(getLogicLedger(bundle));
  const toneAudit = formatToneContractForAuditor(
    detectToneModeFromBundle(bundle),
  );
  const situationsList = (manifest.situations ?? [])
    .map((s, i) => `${i + 1}. ${s}`)
    .join("\n");
  const raw = await generateAsEditorJson({
    role: "auditor",
    userText: `Prüfe den Rohtext gegen Manifest, Situationen, State-Slice und den SZENEN-SCOPE des Kapitel-Contracts.
passed=true nur wenn:
- mustShow dieser Szene erfüllt; mustNot/knowledgeForbidden nicht verletzt; Ort/Zeit ok
- Situationen (falls gesetzt): jede nummerierte Einzelhandlung greifbar (Paraphrase reicht — kein Literal-Match)
- Kapitel-Contract nur im SZENEN-SCOPE (siehe Block unten) — Kapitel-Muss anderer Szenen NICHT abwerten
- Ledger/Zeitachse ohne Widerspruch
- Ton-Vertrag (falls gesetzt) nicht klar verfehlt

VERBOTEN als Fail-Grund:
- „Kapitel-Muss X fehlt“, obwohl X nicht in mustShow/situations DIESER Szene steht
- endingFunction in einer Nicht-letzten Szene
- Pedanterie („betritt“ fehlt wörtlich), wenn Zugang/Prüfung klar im Text vorkommt

Bei Fail:
- changeOrders: kurze strukturelle Aufträge (kein Stil)
- stellen: 1–4 wörtliche Ausschnitte aus dem Rohtext (8–120 Zeichen), genau dort wo geändert werden muss — unverändert kopieren

Antwort NUR JSON:
{"passed":true,"issues":[],"changeOrders":[],"stellen":[]}

${contractCheck ? `${contractCheck}\n` : ""}
${beatsCheck ? `${beatsCheck}\n` : ""}
${ledgerCheck ? `${ledgerCheck}\n` : ""}
${toneAudit ? `${toneAudit}\n` : ""}
${situationsList ? `Situationen (müssen vorkommen):\n${situationsList}\n` : ""}

Manifest:
${JSON.stringify(manifest)}

State-Slice:
${JSON.stringify(slice)}

Rohtext:
${prose.slice(0, 12_000)}`,
  });
  const audit = await parseJson(
    raw,
    logicAuditSchema,
    "Logik-Audit",
    '{"passed":false,"issues":[],"changeOrders":[],"stellen":[]}',
  );
  const cleaned = sanitizeSceneLogicAudit(audit, {
    contract: chapter.contract,
    manifest,
    sceneIndex: scene.sceneIndex,
    sceneCountInChapter,
  });
  return {
    passed: cleaned.passed,
    issues: cleaned.issues,
    changeOrders: cleaned.changeOrders,
    stellen: cleaned.stellen,
    notes: formatLogicAuditNotes(cleaned),
    chapterNumber: chapter.chapterNumber,
    sceneIndex: scene.sceneIndex,
  };
}

/**
 * HITL after manual Rohtext edit: save prose, re-run logic audit.
 * Pass → clear gate and return style_polish hop; Fail → refresh marks, stay paused.
 */
export async function saveAndRecheckLogic(input: {
  novelId: string;
  sceneId: string;
  rawText: string;
}): Promise<{
  passed: boolean;
  bundle: NovelBundle;
  hop: NovelJobHop | null;
  notes: string;
}> {
  const bundle = await getNovelBundle(input.novelId);
  if (!bundle) throw new Error("Roman nicht gefunden.");
  const scene = bundle.scenes.find((s) => s.id === input.sceneId);
  if (!scene) throw new Error("Szene nicht gefunden.");
  const chapter = bundle.chapters.find((c) => c.id === scene.chapterId);
  if (!chapter) throw new Error("Kapitel fehlt.");

  const rawText = input.rawText.trim();
  await upsertScene({
    ...scene,
    rawText,
    status: "auditing",
  });

  const audit = await auditSceneAgainstManifest({
    novelId: input.novelId,
    sceneId: input.sceneId,
    rawText,
  });

  if (audit.passed) {
    await upsertScene({
      ...scene,
      rawText,
      status: "polishing",
      logicNotes: "Logik-OK (manuell nachgebessert)",
      feedback: ["Manuell: Logik-Hinweise behoben."],
      score: Math.max(scene.score || 0, scoreAfterLogicPass(scene.iteration ?? 0)),
    });
    await updateNovel({
      id: input.novelId,
      status: "writing",
      orchestratorStatus: {
        phase: "style_polish",
        label: `Logik OK — Stilist Kap. ${chapter.chapterNumber}.${scene.sceneIndex}…`,
        step: "style_polish",
        sceneId: scene.id,
        chapterNumber: chapter.chapterNumber,
        haltReason: null,
        error: null,
        updatedAt: new Date().toISOString(),
      },
    });
    const next = await getNovelBundle(input.novelId);
    if (!next) throw new Error("Roman nach Recheck fehlt.");
    return {
      passed: true,
      bundle: next,
      hop: {
        novelId: input.novelId,
        step: "style_polish",
        sceneId: scene.id,
        chapterNumber: chapter.chapterNumber,
      },
      notes: "Logik-OK",
    };
  }

  await upsertScene({
    ...scene,
    rawText,
    status: "error",
    logicNotes: audit.notes,
    feedback: audit.issues,
  });
  await updateNovel({
    id: input.novelId,
    status: "paused",
    orchestratorStatus: {
      phase: "logic_audit",
      label: `Logik noch offen Kap. ${chapter.chapterNumber}.${scene.sceneIndex} — bitte Markierungen prüfen.`,
      step: "logic_audit",
      sceneId: scene.id,
      chapterNumber: chapter.chapterNumber,
      haltReason: "logic_gate",
      error: audit.notes.slice(0, 240),
      updatedAt: new Date().toISOString(),
    },
  });
  const next = await getNovelBundle(input.novelId);
  if (!next) throw new Error("Roman nach Recheck fehlt.");
  return {
    passed: false,
    bundle: next,
    hop: null,
    notes: audit.notes,
  };
}

export async function runLogicAudit(input: {
  novelId: string;
  sceneId: string;
  iteration?: number;
  status: StatusFn;
}): Promise<TreeHopOutcome> {
  const bundle = await getNovelBundle(input.novelId);
  if (!bundle) throw new Error("Roman nicht gefunden.");
  const scene = bundle.scenes.find((s) => s.id === input.sceneId);
  if (!scene) throw new Error("Szene nicht gefunden.");
  const chapter = bundle.chapters.find((c) => c.id === scene.chapterId);
  if (!chapter) throw new Error("Kapitel fehlt.");
  const iteration = Math.max(0, input.iteration ?? scene.iteration ?? 0);

  await input.status(input.novelId, {
    phase: "logic_audit",
    label: `Logik-Audit Kap. ${chapter.chapterNumber}.${scene.sceneIndex}…`,
    step: "logic_audit",
    sceneId: scene.id,
    chapterNumber: chapter.chapterNumber,
    iteration,
  });

  const audit = await auditSceneAgainstManifest({
    novelId: input.novelId,
    sceneId: input.sceneId,
  });

  if (!audit.passed) {
    if (iteration >= TREE_MAX_LOGIC_REWRITES) {
      await upsertScene({
        ...scene,
        status: "error",
        logicNotes: audit.notes,
        feedback: audit.issues,
        iteration,
      });
      await input.status(
        input.novelId,
        {
          phase: "logic_audit",
          label: `Logik-Stopp Kap. ${chapter.chapterNumber}.${scene.sceneIndex} nach ${TREE_MAX_LOGIC_REWRITES} Rewrites.`,
          step: "logic_audit",
          sceneId: scene.id,
          chapterNumber: chapter.chapterNumber,
          haltReason: "logic_gate",
          error: audit.notes.slice(0, 240),
        },
        "paused",
      );
      return { outcome: "ok" };
    }
    await upsertScene({
      ...scene,
      status: "drafting",
      logicNotes: audit.notes,
      feedback: audit.issues,
      iteration: iteration + 1,
    });
    return continueHop({
      novelId: input.novelId,
      step: "scene_draft",
      sceneId: scene.id,
      chapterNumber: chapter.chapterNumber,
      iteration: iteration + 1,
    });
  }

  await upsertScene({
    ...scene,
    status: "polishing",
    logicNotes: "Logik-OK",
    feedback: [],
    iteration,
    score: scoreAfterLogicPass(iteration),
  });
  return continueHop({
    novelId: input.novelId,
    step: "style_polish",
    sceneId: scene.id,
    chapterNumber: chapter.chapterNumber,
    iteration,
  });
}

function preferLongerProse(raw: string, polished: string): string {
  const rawN = countNovelWords(raw);
  const polN = countNovelWords(polished);
  // Reject aggressive shortening (stylist must not shrink below 90%).
  if (rawN > 0 && polN < rawN * 0.9) return raw.trim();
  return polished.trim() || raw.trim();
}

export async function runStylePolish(input: {
  novelId: string;
  sceneId: string;
  status: StatusFn;
}): Promise<TreeHopOutcome> {
  const bundle = await getNovelBundle(input.novelId);
  if (!bundle) throw new Error("Roman nicht gefunden.");
  const scene = bundle.scenes.find((s) => s.id === input.sceneId);
  if (!scene) throw new Error("Szene nicht gefunden.");
  const chapter = bundle.chapters.find((c) => c.id === scene.chapterId);
  if (!chapter) throw new Error("Kapitel fehlt.");

  await input.status(input.novelId, {
    phase: "style_polish",
    label: `Stilist Kap. ${chapter.chapterNumber}.${scene.sceneIndex}…`,
    step: "style_polish",
    sceneId: scene.id,
    chapterNumber: chapter.chapterNumber,
  });

  const manifest = parseManifest(scene.manifest ?? {});
  const registerBlock = formatRegisterForStylist({
    contract: chapter.contract,
    beat: manifest?.beat ?? null,
  });
  const endingBudget = formatEndingGestureBudget(
    priorChapterTexts(bundle, chapter.chapterNumber),
  );
  const toneMode = detectToneModeFromBundle(bundle);
  const toneAuthor = formatToneContractForAuthor(toneMode);
  const voiceBlock = formatVoiceCardForAuthor(
    getVoiceCard(bundle),
    chapter.chapterNumber,
  );
  const rawWords = countNovelWords(scene.rawText);
  const antiFormel = NOVEL_MANDATORY_PROSE_DOS.slice(0, 8)
    .map((d) => `- ${d}`)
    .join("\n");
  const chapterSceneIndexes = bundle.scenes
    .filter((s) => s.chapterId === chapter.id)
    .map((s) => s.sceneIndex);
  const isLastInChapter =
    chapterSceneIndexes.length > 0 &&
    scene.sceneIndex === Math.max(...chapterSceneIndexes);

  let polished = await generateAsStylist({
    userText: `Poliere die Szene stilistisch. Handlung und Fakten unverändert lassen.

## Länge (hart)
Rohtext hat ca. ${rawWords} Wörter. Ausgabe mind. ${Math.max(TREE_SCENE_MIN_WORDS, Math.round(rawWords * 0.95))} Wörter — nicht kürzen, nicht verdichten. Fehlende Sensorik eher ergänzen.

${registerBlock || "Kein Register — tonale Konsistenz und Show-don't-tell."}

${toneAuthor ? `${toneAuthor}\n` : ""}
${isLastInChapter ? `${endingBudget}\n` : ""}
${voiceBlock}

## Anti-Formel (positiv umsetzen, keine Verbotslisten abschreiben)
${antiFormel}

Rohtext (Logik bereits OK):
${scene.rawText.slice(0, 14_000)}`,
  });

  polished = preferLongerProse(scene.rawText, polished);

  // If still thin vs draft, one expand pass (still no plot change).
  if (
    rawWords >= TREE_SCENE_MIN_WORDS &&
    countNovelWords(polished) < rawWords * 0.92
  ) {
    const expanded = await generateAsStylist({
      userText: `Die Politur wurde zu kurz. Schreibe die Szene erneut stilistisch aus — gleiche Handlung, mehr sinnliche und dialogische Substanz.
Ziel: mindestens ${rawWords} Wörter.

${registerBlock}
${voiceBlock}

Rohtext:
${scene.rawText.slice(0, 14_000)}`,
    });
    polished = preferLongerProse(scene.rawText, expanded);
  }

  await upsertScene({
    ...scene,
    status: "polishing",
    finalText: polished,
    rawText: scene.rawText,
  });

  return continueHop({
    novelId: input.novelId,
    step: "scene_tic_scrub",
    sceneId: scene.id,
    chapterNumber: chapter.chapterNumber,
    iteration: 0,
  });
}

/**
 * Deterministic Formel-Tic gate after style — one rewrite pass max, then commit.
 */
export async function runSceneTicScrub(input: {
  novelId: string;
  sceneId: string;
  iteration?: number;
  status: StatusFn;
}): Promise<TreeHopOutcome> {
  const bundle = await getNovelBundle(input.novelId);
  if (!bundle) throw new Error("Roman nicht gefunden.");
  const scene = bundle.scenes.find((s) => s.id === input.sceneId);
  if (!scene) throw new Error("Szene nicht gefunden.");
  const chapter = bundle.chapters.find((c) => c.id === scene.chapterId);
  if (!chapter) throw new Error("Kapitel fehlt.");
  const scrubRound = Math.max(0, input.iteration ?? 0);
  const prose = (scene.finalText || scene.rawText).trim();
  const hits = detectNovelProseTics(prose);

  await input.status(input.novelId, {
    phase: "scene_tic_scrub",
    label:
      hits.length === 0
        ? `Tic-Gate Kap. ${chapter.chapterNumber}.${scene.sceneIndex}: sauber`
        : `Tic-Gate Kap. ${chapter.chapterNumber}.${scene.sceneIndex}: ${hits.length} Treffer…`,
    step: "scene_tic_scrub",
    sceneId: scene.id,
    chapterNumber: chapter.chapterNumber,
    iteration: scrubRound,
  });

  if (hits.length === 0 || scrubRound >= TREE_MAX_TIC_SCRUBS) {
    const notes =
      hits.length > 0
        ? [
            ...(scene.feedback ?? []),
            `Tic-Rest nach Scrub: ${hits.map((h) => h.code).join(", ")}`,
          ]
        : scene.feedback ?? [];
    await upsertScene({
      ...scene,
      status: "approved",
      finalText: prose,
      feedback: notes,
    });
    return continueHop({
      novelId: input.novelId,
      step: "state_commit",
      sceneId: scene.id,
      chapterNumber: chapter.chapterNumber,
    });
  }

  const orders = hits
    .slice(0, 6)
    .map((h) => `- ${h.label}: ${h.detail}`)
    .join("\n");
  const words = countNovelWords(prose);
  const fixed = await generateAsStylist({
    userText: `Bereinige Formel-Tics. Handlung/Fakten/Reihenfolge unverändert.
Länge: mindestens ${words} Wörter (nicht kürzen).

## Tic-Aufträge
${orders}

Text:
${prose.slice(0, 14_000)}`,
  });
  const kept = preferLongerProse(prose, fixed);
  await upsertScene({
    ...scene,
    status: "polishing",
    finalText: kept,
    feedback: [
      ...(scene.feedback ?? []),
      `Tic-Scrub: ${hits.map((h) => h.code).join(", ")}`,
    ],
  });

  return continueHop({
    novelId: input.novelId,
    step: "scene_tic_scrub",
    sceneId: scene.id,
    chapterNumber: chapter.chapterNumber,
    iteration: scrubRound + 1,
  });
}

export async function runStateCommit(input: {
  novelId: string;
  sceneId: string;
  status: StatusFn;
}): Promise<TreeHopOutcome> {
  const bundle = await getNovelBundle(input.novelId);
  if (!bundle) throw new Error("Roman nicht gefunden.");
  const scene = bundle.scenes.find((s) => s.id === input.sceneId);
  if (!scene) throw new Error("Szene nicht gefunden.");
  const chapter = bundle.chapters.find((c) => c.id === scene.chapterId);
  if (!chapter) throw new Error("Kapitel fehlt.");
  const manifest = parseManifest(scene.manifest ?? {});

  await input.status(input.novelId, {
    phase: "state_commit",
    label: `State Kap. ${chapter.chapterNumber}.${scene.sceneIndex}…`,
    step: "state_commit",
    sceneId: scene.id,
    chapterNumber: chapter.chapterNumber,
  });

  const prose = (scene.finalText || scene.rawText).trim();
  const raw = await generateAsEditorJson({
    role: "auditor",
    userText: `Extrahiere State-Diff nach dieser Szene + genau 3 Sätze Summary für die nächste Szene (prevSummary3).
Optional ledger: Zeit/Geld/offene Fragen die in DIESER Szene neu gesetzt oder geändert wurden (chapter=${chapter.chapterNumber}).

Antwort NUR JSON:
{"state":{"characters":{},"knowledge":{},"items":{},"notes":[]},"summary3":"…","ledger":{"timeline":[{"chapter":${chapter.chapterNumber},"dateLabel":"…","event":"…"}],"money":[],"openQuestions":[]}}

Vorheriger State:
${JSON.stringify(bundle.novel.stateMatrix ?? {}).slice(0, 4_000)}

Bisheriges Ledger:
${JSON.stringify(getLogicLedger(bundle) ?? emptyLogicLedger()).slice(0, 2_500)}

Manifest:
${JSON.stringify(manifest ?? {}).slice(0, 2_000)}

Szene:
${prose.slice(0, 10_000)}`,
  });
  const diff = await parseJson(
    raw,
    stateDiffSchema,
    "State-Diff",
    '{"state":{},"summary3":""}',
  );

  const proseStateKeys = Object.keys(diff.state ?? {}).filter(
    (k) => !k.startsWith("__"),
  );
  let merged = {
    ...(bundle.novel.stateMatrix ?? {}),
    ...diff.state,
  };
  merged = markStateProvenance(merged, proseStateKeys, "prose");

  // Keep book-level logic ledger in knowledge_graph for draft/audit/abnahme.
  if (diff.ledger) {
    const base = getLogicLedger(bundle) ?? emptyLogicLedger();
    const nextLedger = mergeLogicLedgerPatch(
      base,
      {
        timeline: diff.ledger.timeline,
        money: diff.ledger.money,
        openQuestions: diff.ledger.openQuestions,
      },
      chapter.chapterNumber,
    );
    const prevStates = bundle.knowledgeGraph?.entityStates ?? {};
    const entityStates = entityStatesWithLedger(prevStates, nextLedger);
    merged = markEntityProvenance(merged, [LOGIC_LEDGER_KEY], "prose");
    await upsertKnowledgeGraph({
      novelId: input.novelId,
      entityStates,
      timelineEvents: bundle.knowledgeGraph?.timelineEvents ?? [],
    });
  }

  await updateNovel({
    id: input.novelId,
    stateMatrix: merged,
  });

  await upsertSceneState({
    sceneId: scene.id,
    novelId: input.novelId,
    state: diff.state,
  });
  await upsertScene({
    ...scene,
    status: "approved",
    summary: diff.summary3,
    finalText: prose,
    score: Math.max(scene.score || 0, scoreAfterLogicPass(scene.iteration ?? 0)),
  });

  // Assemble chapter text from approved scenes
  const fresh = await getNovelBundle(input.novelId);
  if (!fresh) {
    return continueHop({
      novelId: input.novelId,
      step: "scene_dispatch",
    });
  }
  const siblings = fresh.scenes
    .filter((s) => s.chapterId === chapter.id)
    .sort((a, b) => a.sceneIndex - b.sceneIndex);
  const approvedSiblings = siblings.filter((s) => s.status === "approved");
  const chapterText = approvedSiblings
    .map((s) => s.finalText || s.rawText)
    .filter(Boolean)
    .join("\n\n");
  const chapterComplete =
    siblings.length > 0 && approvedSiblings.length === siblings.length;

  await upsertChapter({
    ...chapter,
    finalText: chapterText,
    rawDraft: chapterText,
    status: chapterComplete ? "reviewing" : "drafting",
  });

  if (chapterComplete) {
    return continueHop({
      novelId: input.novelId,
      step: "chapter_audit",
      chapterNumber: chapter.chapterNumber,
      sceneId: scene.id,
    });
  }

  if (bundle.novel.pilotMode === "pause_after_scene") {
    await input.status(
      input.novelId,
      {
        phase: "scene_dispatch",
        label: `Szene Kap. ${chapter.chapterNumber}.${scene.sceneIndex} fertig — Pause. Fortsetzen für nächste.`,
        step: "scene_dispatch",
        sceneId: scene.id,
        chapterNumber: chapter.chapterNumber,
        haltReason: "manual_pause",
      },
      "paused",
    );
    return { outcome: "ok" };
  }

  return continueHop({
    novelId: input.novelId,
    step: "scene_dispatch",
  });
}

/**
 * HITL „Übergeben“ after chapter_gate: revise assembled chapter prose against
 * dramaturgy notes, write back to scenes + chapter, then re-run chapter_audit.
 */
export async function runChapterDramaturgyHandoff(input: {
  novelId: string;
  chapterNumber: number;
  status: StatusFn;
}): Promise<TreeHopOutcome> {
  const bundle = await getNovelBundle(input.novelId);
  if (!bundle) throw new Error("Roman nicht gefunden.");
  const chapter = bundle.chapters.find(
    (c) => c.chapterNumber === input.chapterNumber,
  );
  if (!chapter) throw new Error("Kapitel fehlt.");

  const scenes = bundle.scenes
    .filter((s) => s.chapterId === chapter.id)
    .sort((a, b) => a.sceneIndex - b.sceneIndex);
  if (scenes.length < 1) {
    throw new Error("Keine Szenen für Kapitel-Übergeben.");
  }

  const notesFromScene = scenes
    .slice()
    .reverse()
    .map((s) => s.logicNotes.trim())
    .find((n) => n.startsWith("[KAPITEL-AUDIT]"));
  const notes = (
    notesFromScene ??
    bundle.novel.orchestratorStatus.error ??
    ""
  )
    .replace(/^\[KAPITEL-AUDIT\]\s*/i, "")
    .trim();
  if (notes.length < 12) {
    throw new Error("Keine Kapitel-Dramaturgie-Hinweise zum Übergeben.");
  }

  const assembled =
    (chapter.finalText || chapter.rawDraft).trim() ||
    scenes
      .map((s) => (s.finalText || s.rawText).trim())
      .filter(Boolean)
      .join("\n\n");
  if (assembled.length < 120) {
    throw new Error("Kapitelprosa zu kurz für Dramaturgie-Übergeben.");
  }

  await input.status(input.novelId, {
    phase: "chapter_revise",
    label: `Übergeben: Dramaturgie Kap. ${chapter.chapterNumber}…`,
    step: "chapter_revise",
    chapterNumber: chapter.chapterNumber,
  });

  const contractBlock = formatContractForAuthor(chapter.contract);
  const beatChain = formatBeatChainMandate(
    chapter.contract?.job ?? "escalate",
    chapter.chapterNumber,
  );
  const scenePlanBlock = formatScenePlanForAuthor(chapter.scenePlan);
  const priorWords = countNovelWords(assembled);
  const sceneMarkers = scenes
    .map((s) => `===SZENE ${s.sceneIndex}===`)
    .join("\n");

  const revised = await generateAsAuthor({
    userText: `Überarbeite das Kapitel so, dass ALLE Dramaturgie-Hinweise erfüllt sind.
Handlung und Fakten beibehalten — nur dramaturgische Lücken schließen (Job, Beat-Kette, endingFunction, Eskalation, Muss/Darf-nicht).
Kein Stil-Politur-Pass, keine neuen Subplots.

## Länge
Mind. ${Math.max(TREE_SCENE_MIN_WORDS * scenes.length * 0.75, Math.round(priorWords * 0.9))} Wörter (bisher ca. ${priorWords}).

${contractBlock ? `${contractBlock}\n` : ""}
${beatChain.block}
${scenePlanBlock ? `${scenePlanBlock}\n` : ""}

## Dramaturgie-Hinweise (verbindlich umsetzen)
${notes.slice(0, 4_000)}

## Aktuelle Kapitelprosa (korrigieren)
${assembled.slice(0, 28_000)}

## Ausgabeformat (hart)
Genau ${scenes.length} Szenenblöcke in dieser Reihenfolge, jeweils mit Marker-Zeile:
${sceneMarkers}
Danach der Szenentext. Keine Meta, keine Wortzahl.`,
  });

  const byIndex = splitChapterHandoffScenes(revised, scenes.map((s) => s.sceneIndex));
  const nextParts: string[] = [];
  for (const scene of scenes) {
    const part =
      byIndex.get(scene.sceneIndex)?.trim() ||
      (scene.finalText || scene.rawText).trim();
    nextParts.push(part);
    await upsertScene({
      ...scene,
      finalText: part,
      rawText: part,
      logicNotes: "",
      feedback: (scene.feedback ?? []).filter(
        (f) => !f.startsWith("[KAPITEL]"),
      ),
      status: "approved",
    });
  }
  const chapterText = nextParts.filter(Boolean).join("\n\n");
  await upsertChapter({
    ...chapter,
    finalText: chapterText,
    rawDraft: chapterText,
    status: "reviewing",
  });

  return continueHop({
    novelId: input.novelId,
    step: "chapter_audit",
    chapterNumber: chapter.chapterNumber,
  });
}

/** Parse `===SZENE n===` blocks from a chapter handoff rewrite. */
function splitChapterHandoffScenes(
  raw: string,
  expectedIndexes: number[],
): Map<number, string> {
  const out = new Map<number, string>();
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return out;

  const re = /^===\s*SZENE\s+(\d+)\s*===\s*$/gim;
  const hits: Array<{ index: number; start: number; markerEnd: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) != null) {
    hits.push({
      index: Number(m[1]),
      start: m.index,
      markerEnd: m.index + m[0].length,
    });
  }
  if (hits.length === 0) {
    // Fallback: single blob → first expected scene only (caller keeps others).
    if (expectedIndexes[0] != null) out.set(expectedIndexes[0]!, text);
    return out;
  }
  for (let i = 0; i < hits.length; i++) {
    const cur = hits[i]!;
    const end = hits[i + 1]?.start ?? text.length;
    const body = text.slice(cur.markerEnd, end).trim();
    if (body) out.set(cur.index, body);
  }
  return out;
}

/**
 * Dramaturgy gate after all scenes of a chapter are approved.
 * Fail → HITL chapter_gate; Pass → scene_dispatch (or pause).
 */
export async function runChapterAudit(input: {
  novelId: string;
  chapterNumber: number;
  status: StatusFn;
}): Promise<TreeHopOutcome> {
  const bundle = await getNovelBundle(input.novelId);
  if (!bundle) throw new Error("Roman nicht gefunden.");
  const chapter = bundle.chapters.find(
    (c) => c.chapterNumber === input.chapterNumber,
  );
  if (!chapter) throw new Error("Kapitel fehlt.");

  await input.status(input.novelId, {
    phase: "chapter_audit",
    label: `Kapitel-Audit Kap. ${chapter.chapterNumber} (Dramaturgie)…`,
    step: "chapter_audit",
    chapterNumber: chapter.chapterNumber,
  });

  const prose = (chapter.finalText || chapter.rawDraft).trim();
  const contractCheck = formatContractForEditor(chapter.contract);
  const beatsCheck = formatSceneBeatsForEditor(chapter.scenePlan);
  const beatChain = formatBeatChainMandate(
    chapter.contract?.job ?? "escalate",
    chapter.chapterNumber,
  );
  const endingBudget = formatEndingGestureBudget(
    priorChapterTexts(bundle, chapter.chapterNumber),
  );
  const prevChapter = bundle.chapters
    .filter((c) => c.chapterNumber < chapter.chapterNumber)
    .sort((a, b) => b.chapterNumber - a.chapterNumber)[0];
  const prevHint = prevChapter
    ? `Vorkapitel ${prevChapter.chapterNumber} (${prevChapter.contract?.job ?? "?"}): Eskalation/Neuheit prüfen — keine reine Wiederholung.`
    : "Erstes Kapitel — Setup muss greifen.";
  const toneAudit = formatToneContractForAuditor(
    detectToneModeFromBundle(bundle),
  );

  const raw = await generateAsEditorJson({
    role: "auditor",
    userText: `Kapitel-Dramaturgie-Audit. Kein Stil-Lektorat.
passed=true nur wenn Kapitel-Job erfüllt, Beat-Kette spürbar, endingFunction gelandet, Eskalation vs. Vorkapitel ok, Schlussgeste nicht verbraucht, Ton-Vertrag (falls gesetzt) gehalten.

Antwort NUR JSON:
{"passed":true,"issues":[],"changeOrders":[],"score":8}

${contractCheck ? `${contractCheck}\n` : ""}
${beatsCheck ? `${beatsCheck}\n` : ""}
${beatChain.block}

${endingBudget}

${toneAudit ? `${toneAudit}\n` : ""}
${prevHint}

Kapitelprosa:
${prose.slice(0, 16_000)}`,
  });
  const audit = await parseJson(
    raw,
    chapterAuditSchema,
    "Kapitel-Audit",
    '{"passed":false,"issues":[],"changeOrders":[],"score":5}',
  );

  const notes = [
    ...audit.issues,
    ...audit.changeOrders.map((c) => `→ Ändere: ${c}`),
  ].join("\n");
  const craftScore = Math.round(audit.score);

  if (!audit.passed) {
    await upsertChapter({
      ...chapter,
      status: "approved_with_warnings",
    });
    // Stamp chapter issues onto last scene for HITL visibility.
    const lastScene = bundle.scenes
      .filter((s) => s.chapterId === chapter.id)
      .sort((a, b) => b.sceneIndex - a.sceneIndex)[0];
    if (lastScene) {
      await upsertScene({
        ...lastScene,
        logicNotes: `[KAPITEL-AUDIT]\n${notes}`,
        feedback: [
          ...(lastScene.feedback ?? []).filter(
            (f) => !f.startsWith("[KAPITEL]"),
          ),
          ...audit.issues.slice(0, 4).map((i) => `[KAPITEL] ${i}`),
        ],
        score: Math.min(craftScore, lastScene.score || craftScore),
      });
    }
    await input.status(
      input.novelId,
      {
        phase: "chapter_audit",
        label: `Kapitel-Stopp Kap. ${chapter.chapterNumber}: Dramaturgie offen.`,
        step: "chapter_audit",
        chapterNumber: chapter.chapterNumber,
        sceneId: lastScene?.id ?? null,
        haltReason: "chapter_gate",
        error: notes.slice(0, 240),
      },
      "paused",
    );
    return { outcome: "ok" };
  }

  // Pass: bump scene scores toward chapter craft score (Abnahme floor).
  const chapterScenes = bundle.scenes.filter((s) => s.chapterId === chapter.id);
  for (const s of chapterScenes) {
    await upsertScene({
      ...s,
      score: Math.max(s.score || 0, Math.min(9, craftScore)),
    });
  }
  await upsertChapter({
    ...chapter,
    status: "approved",
  });

  if (bundle.novel.pilotMode === "pause_after_scene") {
    await input.status(
      input.novelId,
      {
        phase: "scene_dispatch",
        label: `Kap. ${chapter.chapterNumber} Dramaturgie OK — Pause. Fortsetzen für nächstes Kapitel.`,
        step: "scene_dispatch",
        chapterNumber: chapter.chapterNumber,
        haltReason: "manual_pause",
      },
      "paused",
    );
    return { outcome: "ok" };
  }

  return continueHop({
    novelId: input.novelId,
    step: "scene_dispatch",
  });
}
