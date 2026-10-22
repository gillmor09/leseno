  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Orchestrator fehlgeschlagen.";
    const retry = hop.retry ?? 0;
    if (isTransientNovelError(error) && retry < MAX_HOP_TRANSIENT_RETRIES) {
      const nextRetry = retry + 1;
      const step = hop.step || "style_guide";
      const writablePhases = [
        "style_guide",
        "voice_discovery",
        "world_building",
        "outline",
        "wave_dispatch",
        "wave_barrier",
        "scene_plan",
        "draft",
        "review",
        "state_sync",
        "manuscript_review",
        "revision_plan",
        "targeted_rewrite",
        "global_recheck",
        "timeline_pass",
        "formula_pass",
        "voice_rewrite",
      ] as const;
      type WritablePhase = (typeof writablePhases)[number];
      const stepToPhase: Record<string, WritablePhase> = {
        voice_critique: "voice_discovery",
        voice_lock: "voice_discovery",
        wave_chapter_done: "wave_barrier",
      };
      const mapped = stepToPhase[step] ?? step;
      const phase: WritablePhase = (
        writablePhases as readonly string[]
      ).includes(mapped)
        ? (mapped as WritablePhase)
        : "draft";
      await status(
        novelId,
        {
          phase,
          label: `Timeout/Netz — Auto-Retry ${nextRetry}/${MAX_HOP_TRANSIENT_RETRIES} (${step})…`,
          step,
          chapterNumber: hop.chapterNumber ?? null,
          iteration: hop.iteration ?? null,
          error: null,
        },
        novelStatusForPhase(phase),
      ).catch(() => undefined);
      return continueHop({
        ...hop,
        step,
        retry: nextRetry,
      });
    }
    await status(
      novelId,
      {
        phase: "error",
        label: message.slice(0, 200),
        step: hop.step,
        chapterNumber: hop.chapterNumber ?? null,
        iteration: hop.iteration ?? null,
        error: message,
      },
      "error",
    ).catch(() => undefined);
    return { outcome: "error", message };
  }
}

/** First hop after author clicks Start (always from Styleguide). */
export function initialNovelHop(novelId: string): NovelJobHop {
  return { novelId, step: "style_guide" };
}

const RESUMABLE_STEPS = new Set([
  "style_guide",
  "voice_discovery",
  "voice_critique",
  "voice_lock",
  "world_building",
  "outline",
  "wave_dispatch",
  "wave_barrier",
  "wave_chapter_done",
  "scene_plan",
  "draft",
  "review",
  "state_sync",
  "manuscript_review",
  "revision_plan",
  "targeted_rewrite",
  "global_recheck",
  "timeline_pass",
  "formula_pass",
  "voice_rewrite",
]);

/**
 * Resume at the last persisted orchestrator step (after abort/timeout/error),
 * or start from Styleguide when idle/completed/unknown.
 */
export function resumeNovelHop(input: {
  novelId: string;
  phase: OrchestratorStatus["phase"];
  step?: string | null;
  chapterNumber?: number | null;
  iteration?: number | null;
}): NovelJobHop {
  const step = input.step?.trim() || "";
  if (
    input.phase === "completed" ||
    input.phase === "idle" ||
    step === "completed" ||
    !RESUMABLE_STEPS.has(step)
  ) {
    return initialNovelHop(input.novelId);
  }

  const hop: NovelJobHop = { novelId: input.novelId, step };
  if (
    (step === "scene_plan" ||
      step === "draft" ||
      step === "review" ||
      step === "voice_rewrite" ||
      step === "state_sync" ||
      step === "targeted_rewrite" ||
      step === "timeline_pass" ||
      step === "formula_pass") &&
    input.chapterNumber != null &&
    input.chapterNumber >= 1
  ) {
    hop.chapterNumber = input.chapterNumber;
  }
  if (
    (step === "draft" || step === "review" || step === "voice_rewrite") &&
    input.iteration != null &&
    input.iteration >= 1
  ) {
    hop.iteration = Math.min(
      step === "voice_rewrite" ? 2 : MAX_PROSE_REVIEW_ITERS,
      input.iteration,
    );
  }
  return hop;
}
