/**
 * Loads and saves Meine Welt child profiles via public RPCs.
 */

import { createClient } from "@/lib/supabase/server";
import {
  STORY_LENGTH_STEP_IDS,
  type StoryLengthStepId,
} from "@/lib/stories/length";
import type { StoryMoodId, StorySchoolStageId } from "@/lib/stories/options";
import { STORY_MOODS, STORY_SCHOOL_STAGES } from "@/lib/stories/options";
import type {
  ChildProfile,
  ChildProfileFields,
} from "@/lib/world/catalog";

const SCHOOL_STAGE_IDS = new Set(
  STORY_SCHOOL_STAGES.map((stage) => stage.id),
);
const LENGTH_STEP_IDS = new Set<string>(STORY_LENGTH_STEP_IDS);
const MOOD_IDS = new Set(STORY_MOODS.map((mood) => mood.id));

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function asSchoolStage(value: unknown): StorySchoolStageId {
  if (typeof value === "string" && SCHOOL_STAGE_IDS.has(value as StorySchoolStageId)) {
    return value as StorySchoolStageId;
  }
  return "klasse_3";
}

function asLengthStep(value: unknown): StoryLengthStepId {
  if (typeof value === "string" && LENGTH_STEP_IDS.has(value)) {
    return value as StoryLengthStepId;
  }
  return "mittel";
}

function asMood(value: unknown): StoryMoodId {
  if (typeof value === "string" && MOOD_IDS.has(value as StoryMoodId)) {
    return value as StoryMoodId;
  }
  return "spannend";
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function mapRow(row: Record<string, unknown>): ChildProfile {
  return {
    id: typeof row.id === "string" ? row.id : String(row.id ?? ""),
    displayName:
      typeof row.display_name === "string" ? row.display_name.trim() : "",
    schoolStage: asSchoolStage(row.school_stage),
    lengthStep: asLengthStep(row.length_step),
    mood: asMood(row.mood),
    friends: asStringList(row.friends),
    interests: asStringList(row.interests),
    experiences: asStringList(row.experiences),
    fears: asStringList(row.fears),
    includeImages: asBool(row.include_images, false),
    syllableHelp: asBool(row.syllable_help, false),
    wordHighlight: asBool(row.word_highlight, false),
    readableAloud: asBool(row.readable_aloud, true),
    isDefault: asBool(row.is_default, false),
    sortOrder:
      typeof row.sort_order === "number"
        ? row.sort_order
        : Number(row.sort_order) || 0,
  };
}

/**
 * Lists all child profiles for the signed-in user (may be empty).
 */
export async function listMyChildProfiles(): Promise<ChildProfile[]> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("list_my_child_profiles");

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return rows.map((row) => mapRow(row as Record<string, unknown>));
}

/**
 * Loads one owned profile by id, or null when missing / not owned.
 */
export async function loadChildProfile(
  profileId: string,
): Promise<ChildProfile | null> {
  const profiles = await listMyChildProfiles();
  return profiles.find((profile) => profile.id === profileId) ?? null;
}

/**
 * Creates or updates a child profile. Pass `id: null` to create.
 * Returns the profile id.
 */
export async function saveChildProfile(input: {
  id: string | null;
  fields: ChildProfileFields;
}): Promise<string> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("upsert_my_child_profile", {
    p_id: input.id,
    p_display_name: input.fields.displayName,
    p_school_stage: input.fields.schoolStage,
    p_friends: input.fields.friends,
    p_interests: input.fields.interests,
    p_experiences: input.fields.experiences,
    p_fears: input.fields.fears,
    p_include_images: input.fields.includeImages,
    p_syllable_help: input.fields.syllableHelp,
    p_word_highlight: input.fields.wordHighlight,
    p_readable_aloud: input.fields.readableAloud,
    p_length_step: input.fields.lengthStep,
    p_mood: input.fields.mood,
    p_is_default: input.fields.isDefault,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (typeof data !== "string" || !data) {
    throw new Error("Profil-ID fehlt nach dem Speichern.");
  }

  return data;
}

/**
 * Deletes an owned child profile.
 */
export async function deleteChildProfile(profileId: string): Promise<void> {
  const supabase = await createClient(null);
  const { error } = await supabase.rpc("delete_my_child_profile", {
    p_id: profileId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * @deprecated Prefer listMyChildProfiles / loadChildProfile.
 * Returns the first child profile fields, or empty defaults.
 */
export async function loadMyWorld(): Promise<ChildProfileFields> {
  const profiles = await listMyChildProfiles();
  const first = profiles[0];
  if (!first) {
    return {
      displayName: "",
      schoolStage: "klasse_3",
      lengthStep: "mittel",
      mood: "spannend",
      friends: [],
      interests: [],
      experiences: [],
      fears: [],
      includeImages: false,
      syllableHelp: false,
      wordHighlight: false,
      readableAloud: true,
      isDefault: false,
    };
  }
  return {
    displayName: first.displayName,
    schoolStage: first.schoolStage,
    lengthStep: first.lengthStep,
    mood: first.mood,
    friends: first.friends,
    interests: first.interests,
    experiences: first.experiences,
    fears: first.fears,
    includeImages: first.includeImages,
    syllableHelp: first.syllableHelp,
    wordHighlight: first.wordHighlight,
    readableAloud: first.readableAloud,
    isDefault: first.isDefault,
  };
}
