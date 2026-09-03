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
    })),
  };
}

/** Public catalog for the composer. Falls back to seed numbers if the API is down. */
export async function loadStoryLengthCatalog(): Promise<StoryLengthCatalog> {
  try {
    const supabase = await createClient();
    const [stepsResult, limitsResult] = await Promise.all([
      supabase.from("story_length_steps").select("id, label, sort_order"),
      supabase.from("story_length_limits").select("id, age_group_id, step_id, min_words, max_words"),
    ]);

    if (stepsResult.error || limitsResult.error || !limitsResult.data?.length) {
      return FALLBACK_STORY_LENGTH_CATALOG;
    }

    return toCatalog(stepsResult.data ?? [], limitsResult.data);
  } catch {
    return FALLBACK_STORY_LENGTH_CATALOG;
  }
}

/** Admin load — service role so empty/new rows still appear after a fresh migrate. */
export async function loadStoryLengthCatalogForAdmin(): Promise<StoryLengthCatalog> {
  const supabase = createServiceClient();
  const [stepsResult, limitsResult] = await Promise.all([
    supabase.from("story_length_steps").select("id, label, sort_order"),
    supabase.from("story_length_limits").select("id, age_group_id, step_id, min_words, max_words"),
  ]);

  if (stepsResult.error) {
    throw new Error(stepsResult.error.message);
  }
  if (limitsResult.error) {
    throw new Error(limitsResult.error.message);
  }

  return toCatalog(stepsResult.data ?? [], limitsResult.data ?? []);
}

export async function updateStoryLengthLimits(
  updates: Pick<StoryLengthLimit, "id" | "minWords" | "maxWords">[],
): Promise<void> {
  const supabase = createServiceClient();

  for (const update of updates) {
    const { error } = await supabase
      .from("story_length_limits")
      .update({
        min_words: update.minWords,
        max_words: update.maxWords,
      })
      .eq("id", update.id);

    if (error) {
      throw new Error(error.message);
    }
  }
}
