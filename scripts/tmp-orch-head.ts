/**
 * Zwei-Rollen State-Machine for greenfield Roman.
 * Hop-based: each call does one step and may return `continue` for self-kick.
 *
 * Single write path:
 * Phase A: style_guide → voice_discovery → world_building → outline (5-Kap. Qualitätsprobe)
 * Phase B: wave_dispatch → scene_plan (craft classes) → draft (tic gate) → approve
 * → completed (Abnahme under Export)
 *
 * Stale hops into former Heavy-only steps (review book-passes) are skipped/completed.
 */

import { isAiAbortError } from "@/lib/ai/fetch-timeout";
import { parseModelJsonObjectWithRepair } from "@/lib/ai/repair-model-json";
import type { z } from "zod";
import {
  chapterEndingHint,
  formatBeatChainMandate,
  formatContractForAuthor,
  formatContractForEditor,
  formatEndingGestureBudget,
  formatJobTaxonomyForOutline,
  formatSceneBeatTaxonomy,
  formatSceneBeatsForEditor,
  formatScenePlanForAuthor,
  hasChapterContract,
  normalizeChapterContract,
  normalizeScenePlan,
} from "@/lib/novel/chapter-contract";
import { formatCanonPrefix } from "@/lib/novel/context";
import {
  findingsToIssueLines,
  hierarchicalEditorReviewSchema,
  hierarchicalReviewJsonHint,
} from "@/lib/novel/hierarchical-review";
import {
  addLedgerDebt,
  clearLedgerDebtChapter,
  deriveAnchorsFromTimeline,
  emptyLedgerDebt,
  emptyLogicLedger,
  entityStatesWithLedger,
  entityStatesWithLedgerDebt,
  formatLogicLedgerForEditor,
  getLedgerDebt,
  getLogicLedger,
  mergeLogicLedgerPatch,
} from "@/lib/novel/logic-ledger";
import {
  buildFormulaPassQueue,
  emptyFormulaPassState,
  entityStatesWithFormulaPass,
  formatFormulaPassAuthorBrief,
  getFormulaPassState,
  scanChapterFormulaHits,
} from "@/lib/novel/formula-pass";
import {
  buildTimelinePassQueue,
  emptyTimelinePassState,
  entityStatesWithTimelinePass,
  formatTimelinePassAuthorBrief,
  getTimelinePassState,
} from "@/lib/novel/timeline-pass";
import {
  briefForChapter,
  coerceRevisionPlan,
  emptyManuscriptRevisionState,
  entityStatesWithManuscriptRevision,
  formatManuscriptDigest,
  getManuscriptRevisionState,
  globalRecheckSchema,
  manuscriptReviewSchema,
  queueFromPlan,
  REVISION_PLAN_SCHEMA_HINT,
} from "@/lib/novel/manuscript-revision";
import {
  knowledgeGraphSyncSchema,
  logicLedgerSeedSchema,
  outlineExtractSchema,
  scenePlanExtractSchema,
  styleGuideExtractSchema,
  worldBuildingExtractSchema,
} from "@/lib/novel/schemas";
import {
  mergeMandatoryProseRules,
  NOVEL_AUTHOR_CHAPTER_END_REMINDER,
} from "@/lib/novel/prose-guardrails";
import {
  detectCrossChapterFormulaHits,
  detectNovelProseTics,
  detectPlaceholders,
  formatProseTicIssues,
} from "@/lib/novel/prose-tic-detect";
import {
  assignCraftClassesForChapter,
  entityStatesWithCraftClasses,
  formatCraftClassesForAuthor,
  getCraftClassesState,
} from "@/lib/novel/craft-classes";
import {
  draftTicIssueLines,
  formatDraftTicRewriteBrief,
  isDraftTicFeedback,
  MAX_DRAFT_TIC_ITERS,
  QUALITY_PROBE_CHAPTER_COUNT,
  scanDraftProseTics,
} from "@/lib/novel/draft-tic-gate";
import {
  generateAsAuthor,
  generateAsEditorJson,
  NOVEL_AUTHOR_MODEL_SLUG,
  NOVEL_EDITOR_MODEL_SLUG,
} from "@/lib/novel/roles";
import {
  entityStatesWithVoiceDiscovery,
  getVoiceDiscoveryState,
  secondSceneAuthorPrompt,
  VOICE_DISCOVERY_SCENE_A,
  voiceCriticPrompt,
  voiceCriticSchema,
  voiceLockPrompt,
  voiceLockSchema,
  voiceVariantsBundleSchema,
} from "@/lib/novel/voice-discovery";
import {
  formatVoiceCardForAuthor,
  getVoiceCard,
  voiceEndingHint,
} from "@/lib/novel/voice-card";
import {
  emptyWaveState,
  entityStatesWithWave,
  formatWaveLabel,
  getWaveState,
  nextUnsyncedInWave,
  pendingChapterNumbers,
  pickNextWave,
  resolveWaveSize,
  waveReviewComplete,
  type WaveBatchState,
} from "@/lib/novel/wave-batch";
import { kickNovelJobsParallel } from "@/lib/novel/novel-job-kick";
import { resolveRomanSchreibModel } from "@/lib/roman/model";
import {
  getNovelBundle,
  insertEditorFeedback,
  setOrchestratorStatus,
  updateNovel,
  upsertChapter,
  upsertKnowledgeGraph,
  upsertStyleGuide,
  upsertWorldBuilding,
} from "@/lib/novel/repository";
import type { NovelJobHop, OrchestratorStatus } from "@/lib/novel/types";

export type NovelJobOutcome =
  | { outcome: "ok" }
  | { outcome: "continue"; hop: NovelJobHop }
  | { outcome: "error"; message: string };

/** Draft↔review rounds per chapter; then force freigabe regardless of score. */
const MAX_PROSE_REVIEW_ITERS = 3;

/** Max hop-level auto-retries after timeout/abort (in addition to in-call retry). */
const MAX_HOP_TRANSIENT_RETRIES = 2;

function isTransientNovelError(error: unknown): boolean {
  if (isAiAbortError(error)) return true;
  const msg = error instanceof Error ? error.message : String(error);
  return /timeout|abbruch|abortexception|timed?\s*out|ECONNRESET|ETIMEDOUT|fetch failed|socket/i.test(
    msg,
  );
}

async function parseStructuredJson<T>(
  raw: string,
  schema: z.ZodType<T>,
  label: string,
  schemaHint: string,
): Promise<T> {
  const model = await resolveRomanSchreibModel(NOVEL_EDITOR_MODEL_SLUG);
  const obj = await parseModelJsonObjectWithRepair({
    raw,
    model,
    schemaHint,
    errorLabel: label,
  });
  const parsed = schema.safeParse(obj);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 4)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(
      `${label}: JSON entspricht nicht dem Schema.${detail ? ` ${detail}` : ""}`,
    );
  }
  return parsed.data;
}

/** Map orchestrator phase → novel.status so resume clears sticky `error`. */
function novelStatusForPhase(
  phase: OrchestratorStatus["phase"],
): string | undefined {
  switch (phase) {
    case "style_guide":
    case "voice_discovery":
    case "world_building":
      return "setup";
    case "outline":
    case "outline_revision":
      return "outlining";
    case "wave_dispatch":
    case "wave_barrier":
    case "scene_plan":
    case "draft":
    case "review":
    case "state_sync":
    case "manuscript_review":
    case "revision_plan":
    case "targeted_rewrite":
    case "global_recheck":
    case "timeline_pass":
    case "formula_pass":
    case "voice_rewrite":
    case "assisted_fix":
      return "writing";
    case "completed":
      return "completed";
    case "error":
      return "error";
    default:
      return undefined;
  }
}

async function status(
  novelId: string,
  patch: OrchestratorStatus,
  novelStatus?: string,
): Promise<void> {
  await setOrchestratorStatus(
    novelId,
    patch,
    novelStatus ?? novelStatusForPhase(patch.phase),
  );
}

function continueHop(hop: NovelJobHop): NovelJobOutcome {
  return { outcome: "continue", hop };
}

/**
 * Run one orchestrator hop. Caller persists progress and self-kicks on continue.
 */
