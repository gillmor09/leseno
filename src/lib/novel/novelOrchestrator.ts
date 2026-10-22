/**
 * Top-Down Roman orchestrator: architect tree → scene draft/audit/style/commit.
 * Replaces the sequential Zwei-Rollen score/rewrite loop.
 */

import { isAiAbortError } from "@/lib/ai/fetch-timeout";
import {
  freezeSkeletonAndStartWriting,
  runArchitectActs,
  runArchitectChapters,
  runArchitectManifests,
  runChapterAudit,
  runChapterDramaturgyHandoff,
  runCompileProseBriefs,
  runLogicAudit,
  runSceneDispatch,
  runSceneDraft,
  runSceneTicScrub,
  runSkeletonStructureAudit,
  runStateCommit,
  runStylePolish,
} from "@/lib/novel/tree-pipeline";
import { runFormelTicScrubHop } from "@/lib/novel/formel-tic-scrub";
import { getNovelBundle, setOrchestratorStatus } from "@/lib/novel/repository";
import type { NovelJobHop, OrchestratorStatus } from "@/lib/novel/types";

export type NovelJobOutcome =
  | { outcome: "ok" }
  | { outcome: "continue"; hop: NovelJobHop }
  | { outcome: "error"; message: string };

const MAX_HOP_TRANSIENT_RETRIES = 5;

function novelStatusForPhase(
  phase: OrchestratorStatus["phase"],
): string | undefined {
  switch (phase) {
    case "architect_acts":
    case "architect_chapters":
    case "architect_manifests":
    case "skeleton_audit_acts":
    case "skeleton_audit_chapters":
    case "skeleton_audit_manifests":
      return "outlining";
    case "scene_dispatch":
    case "scene_draft":
    case "logic_audit":
    case "style_polish":
    case "scene_tic_scrub":
    case "formel_tic_scrub":
    case "state_commit":
    case "chapter_audit":
    case "chapter_revise":
    case "state_slice":
      return "writing";
    case "compile_prose_briefs":
      return "outlining";
    case "prose_pending":
      return "paused";
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

/**
 * Network / provider blips that should self-retry the same hop.
 * Permanent schema / auth / business errors stay non-transient.
 */
function isTransientNovelError(error: unknown): boolean {
  if (isAiAbortError(error)) return true;
  const msg =
    error instanceof Error
      ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`
      : String(error ?? "");
  return /429|503|502|504|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|network|overloaded|rate.?limit|temporar|try again|socket hang up|UND_ERR|cloudflare|bad gateway|gateway timeout|service unavailable|too many requests|connection reset|connect timed out/i.test(
    msg,
  );
}

/** Map leftover sequential steps onto the new tree entry. */
function normalizeStep(step: string): string {
  if (
    step === "style_guide" ||
    step === "voice_discovery" ||
    step === "voice_critique" ||
    step === "voice_lock" ||
    step === "world_building" ||
    step === "outline" ||
    step === "scene_briefing" ||
    step === "scene_review" ||
    step === "scene_revise" ||
    step === "scene_commit" ||
    step === "wave_dispatch" ||
    step === "draft" ||
    step === "review"
  ) {
    return "architect_acts";
  }
  return step;
}

export async function runNovelOrchestratorHop(
  hop: NovelJobHop,
): Promise<NovelJobOutcome> {
  const novelId = hop.novelId;
  try {
    const step = normalizeStep(hop.step || "architect_acts");

    {
      const live = await getNovelBundle(novelId);
      // Soft pause: idle until an action clears status to writing/outlining.
      if (live?.novel.status === "paused") {
        return { outcome: "ok" };
      }
    }

    if (step === "architect_acts") {
      return runArchitectActs({
        novelId,
        iteration: hop.iteration,
        status,
      });
    }
    if (step === "architect_chapters") {
      return runArchitectChapters({
        novelId,
        iteration: hop.iteration,
        status,
      });
    }
    if (step === "architect_manifests") {
      return runArchitectManifests({
        novelId,
        iteration: hop.iteration,
        chapterNumber: hop.chapterNumber,
        status,
      });
    }
    if (step === "skeleton_audit_acts") {
      return runSkeletonStructureAudit({
        novelId,
        level: "acts",
        iteration: hop.iteration,
        status,
      });
    }
    if (step === "skeleton_audit_chapters") {
      return runSkeletonStructureAudit({
        novelId,
        level: "chapters",
        iteration: hop.iteration,
        status,
      });
    }
    if (step === "skeleton_audit_manifests") {
      return runSkeletonStructureAudit({
        novelId,
        level: "manifests",
        iteration: hop.iteration,
        status,
      });
    }
    if (step === "compile_prose_briefs") {
      return runCompileProseBriefs({ novelId, status });
    }
    if (step === "scene_dispatch") {
      return runSceneDispatch({ novelId, status });
    }
    if (step === "scene_draft") {
      if (!hop.sceneId) throw new Error("scene_draft ohne sceneId.");
      return runSceneDraft({
        novelId,
        sceneId: hop.sceneId,
        iteration: hop.iteration,
        status,
      });
    }
    if (step === "logic_audit") {
      if (!hop.sceneId) throw new Error("logic_audit ohne sceneId.");
      return runLogicAudit({
        novelId,
        sceneId: hop.sceneId,
        iteration: hop.iteration,
        status,
      });
    }
    if (step === "style_polish") {
      if (!hop.sceneId) throw new Error("style_polish ohne sceneId.");
      return runStylePolish({
        novelId,
        sceneId: hop.sceneId,
        status,
      });
    }
    if (step === "scene_tic_scrub") {
      if (!hop.sceneId) throw new Error("scene_tic_scrub ohne sceneId.");
      return runSceneTicScrub({
        novelId,
        sceneId: hop.sceneId,
        iteration: hop.iteration,
        status,
      });
    }
    if (step === "formel_tic_scrub") {
      return runFormelTicScrubHop({
        novelId,
        chapterNumber: hop.chapterNumber,
        status,
      });
    }
    if (step === "state_commit") {
      if (!hop.sceneId) throw new Error("state_commit ohne sceneId.");
      return runStateCommit({
        novelId,
        sceneId: hop.sceneId,
        status,
      });
    }
    if (step === "chapter_audit") {
      const chapterNumber = hop.chapterNumber;
      if (chapterNumber == null || chapterNumber < 1) {
        throw new Error("chapter_audit ohne chapterNumber.");
      }
      return runChapterAudit({
        novelId,
        chapterNumber,
        status,
      });
    }
    if (step === "chapter_revise") {
      const chapterNumber = hop.chapterNumber;
      if (chapterNumber == null || chapterNumber < 1) {
        throw new Error("chapter_revise ohne chapterNumber.");
      }
      return runChapterDramaturgyHandoff({
        novelId,
        chapterNumber,
        status,
      });
    }

    throw new Error(`Unbekannter Orchestrator-Schritt: ${step}`);
  } catch (error) {
    if (
      isTransientNovelError(error) &&
      (hop.retry ?? 0) < MAX_HOP_TRANSIENT_RETRIES
    ) {
      const retry = (hop.retry ?? 0) + 1;
      const delayMs = Math.min(30_000, 2_500 * retry);
      await status(novelId, {
        phase: (normalizeStep(hop.step) ||
          hop.step) as OrchestratorStatus["phase"],
        label: `Kurzstörung — erneuter Versuch ${retry}/${MAX_HOP_TRANSIENT_RETRIES} (${hop.step})…`,
        step: hop.step,
        chapterNumber: hop.chapterNumber ?? null,
        sceneId: hop.sceneId ?? null,
        iteration: hop.iteration ?? null,
        error: null,
        haltReason: null,
      }).catch(() => undefined);
      return {
        outcome: "continue",
        hop: { ...hop, retry, delayMs },
      };
    }
    const message =
      error instanceof Error ? error.message : "Orchestrator-Fehler.";
    // Keep step cursor so Fortsetzen / auto-resume can retry the same hop.
    await status(
      novelId,
      {
        phase: "error",
        label: message.slice(0, 240),
        step: hop.step,
        chapterNumber: hop.chapterNumber ?? null,
        sceneId: hop.sceneId ?? null,
        iteration: hop.iteration ?? null,
        error: message,
        haltReason: "pipeline_stall",
      },
      "error",
    ).catch(() => undefined);
    return { outcome: "error", message };
  }
}

export function initialNovelHop(novelId: string): NovelJobHop {
  return { novelId, step: "architect_acts" };
}

const RESUMABLE = new Set([
  "architect_acts",
  "architect_chapters",
  "architect_manifests",
  "skeleton_audit_acts",
  "skeleton_audit_chapters",
  "skeleton_audit_manifests",
  "scene_dispatch",
  "scene_draft",
  "logic_audit",
  "style_polish",
  "scene_tic_scrub",
  "formel_tic_scrub",
  "state_commit",
  "chapter_audit",
  "chapter_revise",
  "compile_prose_briefs",
]);

export function resumeNovelHop(input: {
  novelId: string;
  phase: OrchestratorStatus["phase"];
  step?: string | null;
  chapterNumber?: number | null;
  sceneId?: string | null;
  iteration?: number | null;
}): NovelJobHop {
  const rawStep = input.step?.trim() || "";
  // Prefer saved step cursor (incl. after phase=error / pipeline_stall).
  const fromPhase =
    !rawStep &&
    input.phase !== "completed" &&
    input.phase !== "idle" &&
    input.phase !== "error" &&
    RESUMABLE.has(input.phase)
      ? input.phase
      : "";
  const candidate = normalizeStep(rawStep || fromPhase);
  if (
    input.phase === "completed" ||
    candidate === "completed" ||
    !RESUMABLE.has(candidate)
  ) {
    return initialNovelHop(input.novelId);
  }
  const hop: NovelJobHop = { novelId: input.novelId, step: candidate };
  if (input.chapterNumber != null && input.chapterNumber >= 1) {
    hop.chapterNumber = input.chapterNumber;
  }
  if (input.sceneId) hop.sceneId = input.sceneId;
  if (input.iteration != null && input.iteration >= 0) {
    hop.iteration = Math.min(5, input.iteration);
  }
  // Fresh retry budget after stall / error resume.
  hop.retry = 0;
  return hop;
}

export { freezeSkeletonAndStartWriting };
