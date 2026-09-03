/**
 * Loads and updates story-length bands from `leseno.story_length_*`.
 * Public reads use the anon server client; admin writes use the service role.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  FALLBACK_STORY_LENGTH_CATALOG,
  STORY_LENGTH_STEPS,
  type AgeGroupId,
  type StoryLengthCatalog,
  type StoryLengthLimit,
  type StoryLengthStepId,
} from "@/lib/stories/length";

type StepRow = { id: string; label: string; sort_order: number };
type LimitRow = {
  id: string;
  age_group_id: string;
  step_id: string;
  min_words: number;
  max_words: number | null;
  fact_count: number;
};

function toCatalog(steps: StepRow[], limits: LimitRow[]): StoryLengthCatalog {
  const orderedSteps = [...steps]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((step) => ({
      id: step.id as StoryLengthStepId,
      label: step.label,
      sortOrder: step.sort_order,
    }));

  return {
    steps: orderedSteps.length > 0 ? orderedSteps : STORY_LENGTH_STEPS,
    limits: limits.map((row) => ({
      id: row.id,
      ageGroupId: row.age_group_id as AgeGroupId,
      stepId: row.step_id as StoryLengthStepId,
      minWords: row.min_words,
      maxWords: row.max_words,
      factCount: row.fact_count,
    })),
  };
}

/** Public catalog for the composer. Falls back to seed numbers if the API is down. */
export async function loadStoryLengthCatalog(): Promise<StoryLengthCatalog> {
  try {
    const supabase = await createClient(null);
    const [stepsResult, limitsResult] = await Promise.all([
      supabase.rpc("list_story_length_steps"),
      supabase.rpc("list_story_length_limits"),
    ]);

    if (stepsResult.error || limitsResult.error || !limitsResult.data?.length) {
      return FALLBACK_STORY_LENGTH_CATALOG;
    }

    return toCatalog(
      (stepsResult.data ?? []) as StepRow[],
      (limitsResult.data ?? []) as LimitRow[],
    );
  } catch {
    return FALLBACK_STORY_LENGTH_CATALOG;
  }
}

/** Admin load — service role so empty/new rows still appear after a fresh migrate. */
export async function loadStoryLengthCatalogForAdmin(): Promise<StoryLengthCatalog> {
  const supabase = createServiceClient(null);
  const [stepsResult, limitsResult] = await Promise.all([
    supabase.rpc("list_story_length_steps"),
    supabase.rpc("list_story_length_limits"),
  ]);

  if (stepsResult.error) throw new Error(stepsResult.error.message);
  if (limitsResult.error) throw new Error(limitsResult.error.message);

  return toCatalog(
    (stepsResult.data ?? []) as StepRow[],
    (limitsResult.data ?? []) as LimitRow[],
  );
}

export async function updateStoryLengthLimits(
  updates: Pick<StoryLengthLimit, "id" | "minWords" | "maxWords" | "factCount">[],
): Promise<void> {
  const supabase = createServiceClient(null);

  for (const update of updates) {
    const { error } = await supabase
      .rpc("update_story_length_limit", {
        p_id: update.id,
        p_min_words: update.minWords,
        p_max_words: update.maxWords,
        p_fact_count: update.factCount,
      });

    if (error) {
      throw new Error(error.message);
    }
  }
}
