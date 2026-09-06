/**
 * Persisted membership stories (`leseno.user_stories`) via public RPCs.
 */

import { createClient } from "@/lib/supabase/server";
import type { StoryLengthStepId } from "@/lib/stories/length";
import type { StoryMoodId, StorySchoolStageId } from "@/lib/stories/options";
import { STORY_MOODS, STORY_SCHOOL_STAGES } from "@/lib/stories/options";
import { STORY_LENGTH_STEP_IDS } from "@/lib/stories/length";

const SCHOOL_STAGE_IDS = new Set(
  STORY_SCHOOL_STAGES.map((stage) => stage.id),
);
const LENGTH_STEP_IDS = new Set<string>(STORY_LENGTH_STEP_IDS);
const MOOD_IDS = new Set(STORY_MOODS.map((mood) => mood.id));

export type UserStorySummary = {
  id: string;
  title: string;
  childProfileId: string | null;
  profileDisplayName: string | null;
  isFavorite: boolean;
  isRead: boolean;
  schoolStage: StorySchoolStageId;
  personalMode: boolean;
  /** Null for root stories; set when this row continues another story. */
  parentStoryId: string | null;
  createdAt: string;
};

export type UserStoryDetail = UserStorySummary & {
  storyHtml: string;
  facts: string[];
  lengthStep: StoryLengthStepId | null;
  mood: StoryMoodId | null;
  topic: string | null;
  syllableHelp: boolean;
  includeImages: boolean;
  creditsCharged: number | null;
};

export type SaveUserStoryInput = {
  title: string;
  storyHtml: string;
  facts: string[];
  schoolStage: StorySchoolStageId;
  childProfileId?: string | null;
  lengthStep?: StoryLengthStepId | null;
  mood?: StoryMoodId | null;
  topic?: string | null;
  personalMode?: boolean;
  syllableHelp?: boolean;
  includeImages?: boolean;
  creditsCharged?: number | null;
  parentStoryId?: string | null;
};

function asSchoolStage(value: unknown): StorySchoolStageId {
  if (
    typeof value === "string" &&
    SCHOOL_STAGE_IDS.has(value as StorySchoolStageId)
  ) {
    return value as StorySchoolStageId;
  }
  return "klasse_3";
}

function asLengthStep(value: unknown): StoryLengthStepId | null {
  if (typeof value === "string" && LENGTH_STEP_IDS.has(value)) {
    return value as StoryLengthStepId;
  }
  return null;
}

function asMood(value: unknown): StoryMoodId | null {
  if (typeof value === "string" && MOOD_IDS.has(value as StoryMoodId)) {
    return value as StoryMoodId;
  }
  return null;
}

function asFacts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function mapSummary(row: Record<string, unknown>): UserStorySummary {
  return {
    id: typeof row.id === "string" ? row.id : String(row.id ?? ""),
    title: typeof row.title === "string" ? row.title.trim() : "Ohne Titel",
    childProfileId:
      typeof row.child_profile_id === "string" ? row.child_profile_id : null,
    profileDisplayName:
      typeof row.profile_display_name === "string"
        ? row.profile_display_name.trim() || null
        : null,
    isFavorite: Boolean(row.is_favorite),
    isRead: Boolean(row.is_read),
    schoolStage: asSchoolStage(row.school_stage),
    personalMode: Boolean(row.personal_mode),
    parentStoryId:
      typeof row.parent_story_id === "string" ? row.parent_story_id : null,
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : new Date().toISOString(),
  };
}

function mapDetail(row: Record<string, unknown>): UserStoryDetail {
  return {
    ...mapSummary(row),
    storyHtml: typeof row.story_html === "string" ? row.story_html : "",
    facts: asFacts(row.facts),
    lengthStep: asLengthStep(row.length_step),
    mood: asMood(row.mood),
    topic: typeof row.topic === "string" ? row.topic.trim() || null : null,
    syllableHelp: Boolean(row.syllable_help),
    includeImages: Boolean(row.include_images),
    creditsCharged:
      typeof row.credits_charged === "number" ? row.credits_charged : null,
  };
}

/** Saves a story into the signed-in user's library. Returns the new id. */
export async function saveMyStory(
  input: SaveUserStoryInput,
): Promise<string> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("save_my_story", {
    p_title: input.title,
    p_story_html: input.storyHtml,
    p_facts: input.facts,
    p_school_stage: input.schoolStage,
    p_child_profile_id: input.childProfileId ?? null,
    p_length_step: input.lengthStep ?? null,
    p_mood: input.mood ?? null,
    p_topic: input.topic ?? null,
    p_personal_mode: input.personalMode ?? false,
    p_syllable_help: input.syllableHelp ?? false,
    p_include_images: input.includeImages ?? false,
    p_credits_charged: input.creditsCharged ?? null,
    p_parent_story_id: input.parentStoryId ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
  if (typeof data !== "string" || !data) {
    throw new Error("Speichern der Geschichte fehlgeschlagen.");
  }
  return data;
}

/** Lists library summaries (favorites first, then newest). */
export async function listMyStories(): Promise<UserStorySummary[]> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("list_my_stories");
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as Record<string, unknown>[]).map(mapSummary);
}

/** Loads one owned story including HTML. */
export async function getMyStory(
  storyId: string,
): Promise<UserStoryDetail | null> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("get_my_story", {
    p_id: storyId,
  });
  if (error) {
    throw new Error(error.message);
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  if (!rows[0]) return null;
  return mapDetail(rows[0]);
}

/** Sets the favorite flag on an owned story. */
export async function setMyStoryFavorite(
  storyId: string,
  isFavorite: boolean,
): Promise<void> {
  const supabase = await createClient(null);
  const { error } = await supabase.rpc("set_my_story_favorite", {
    p_id: storyId,
    p_is_favorite: isFavorite,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** Sets the read flag on an owned story. */
export async function setMyStoryRead(
  storyId: string,
  isRead: boolean,
): Promise<void> {
  const supabase = await createClient(null);
  const { error } = await supabase.rpc("set_my_story_read", {
    p_id: storyId,
    p_is_read: isRead,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** Deletes one owned library story. Continuations keep their rows (parent cleared). */
export async function deleteMyStory(storyId: string): Promise<void> {
  const supabase = await createClient(null);
  const { error } = await supabase.rpc("delete_my_story", {
    p_id: storyId,
  });
  if (error) {
    throw new Error(error.message);
  }
}
