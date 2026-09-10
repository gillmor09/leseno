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
import {
  hasCustomReadingModePrefs,
  normalizeReadingModePrefs,
  type ReadingModePrefs,
} from "@/lib/stories/reading-mode-prefs";
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
    fearsGentle: asBool(row.fears_gentle, false),
    includeImages: asBool(row.include_images, false),
    syllableHelp: asBool(row.syllable_help, false),
    wordHighlight: asBool(row.word_highlight, false),
    readableAloud: asBool(row.readable_aloud, true),
    isDefault: asBool(row.is_default, false),
    readingModePrefs: hasCustomReadingModePrefs(row.reading_mode_prefs)
      ? normalizeReadingModePrefs(row.reading_mode_prefs)
      : null,
    hasPin: false,
    loginCode:
      typeof row.login_code === "string" ? row.login_code.trim() || null : null,
    hasPassword: asBool(row.has_password, false),
    sortOrder:
      typeof row.sort_order === "number"
        ? row.sort_order
        : Number(row.sort_order) || 0,
  };
}

/**
 * Lists all child profiles for the signed-in parent (may be empty).
 * Child cookie sessions cannot list — use `loadChildProfile` instead.
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
 * Service-role load by id (optional parent ownership check).
 * Used for child cookie sessions and login-adjacent paths.
 */
export async function loadChildProfileByIdService(
  profileId: string,
  expectedParentUserId?: string,
): Promise<ChildProfile | null> {
  const { createServiceClient } = await import("@/lib/supabase/service");
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("child_profiles")
    .select(
      "id, user_id, display_name, school_stage, friends, interests, experiences, fears, include_images, syllable_help, word_highlight, readable_aloud, length_step, mood, is_default, sort_order, reading_mode_prefs, fears_gentle, login_code, password_hash",
    )
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data || typeof data !== "object") return null;

  const row = data as Record<string, unknown>;
  if (
    expectedParentUserId &&
    typeof row.user_id === "string" &&
    row.user_id !== expectedParentUserId
  ) {
    return null;
  }

  return mapRow({
    ...row,
    has_password:
      typeof row.password_hash === "string" &&
      row.password_hash.trim().length > 0,
  });
}

/**
 * Loads one owned profile by id, or null when missing / not owned.
 * Supports parent Auth and matching child cookie session.
 */
export async function loadChildProfile(
  profileId: string,
): Promise<ChildProfile | null> {
  const { getAppSession } = await import("@/lib/auth/app-session");
  const session = await getAppSession();
  if (!session) return null;

  if (session.kind === "child") {
    if (session.profileId !== profileId) return null;
    return loadChildProfileByIdService(profileId, session.parentUserId);
  }

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
    p_fears_gentle: input.fields.fearsGentle,
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

/** Returns stored PIN hash for an owned profile, or null when unset. */
export async function getChildProfilePinHash(
  profileId: string,
): Promise<string | null> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("get_my_child_profile_pin_hash", {
    p_id: profileId,
  });
  if (error) {
    throw new Error(error.message);
  }
  return typeof data === "string" && data.length > 0 ? data : null;
}

/** Stores a new PIN hash on an owned profile. */
export async function setChildProfilePinHash(
  profileId: string,
  pinHash: string,
): Promise<void> {
  const supabase = await createClient(null);
  const { error } = await supabase.rpc("set_my_child_profile_pin", {
    p_id: profileId,
    p_pin_hash: pinHash,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** Removes the PIN from an owned profile. */
export async function clearChildProfilePinHash(
  profileId: string,
): Promise<void> {
  const supabase = await createClient(null);
  const { error } = await supabase.rpc("clear_my_child_profile_pin", {
    p_id: profileId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** True when Kennung is unused (parent session). Optionally ignore one profile. */
export async function isChildLoginCodeAvailable(
  loginCode: string,
  excludeProfileId?: string | null,
): Promise<boolean> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("is_child_login_code_available", {
    p_code: loginCode,
    p_exclude_id: excludeProfileId ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
  return data === true;
}

/** Sets child login Kennung (parent session). */
export async function setChildLoginCode(
  profileId: string,
  loginCode: string,
): Promise<void> {
  const supabase = await createClient(null);
  const { error } = await supabase.rpc("set_my_child_login_code", {
    p_id: profileId,
    p_code: loginCode,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** Sets child login password hash (parent session). */
export async function setChildLoginPasswordHash(
  profileId: string,
  passwordHash: string,
): Promise<void> {
  const supabase = await createClient(null);
  const { error } = await supabase.rpc("set_my_child_login_password", {
    p_id: profileId,
    p_password_hash: passwordHash,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** Clears child login password (parent session). */
export async function clearChildLoginPasswordHash(
  profileId: string,
): Promise<void> {
  const supabase = await createClient(null);
  const { error } = await supabase.rpc("clear_my_child_login_password", {
    p_id: profileId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export type ChildLoginLookup = {
  profileId: string;
  parentUserId: string;
  displayName: string;
  loginCode: string;
  passwordHash: string;
};

/** Service-role lookup by Kennung for child login. */
export async function lookupChildLoginByCode(
  code: string,
): Promise<ChildLoginLookup | null> {
  const { createServiceClient } = await import("@/lib/supabase/service");
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("lookup_child_login_by_code", {
    p_code: code.trim().toLowerCase(),
  });
  if (error) {
    throw new Error(error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (
    typeof record.profile_id !== "string" ||
    typeof record.parent_user_id !== "string" ||
    typeof record.login_code !== "string" ||
    typeof record.password_hash !== "string"
  ) {
    return null;
  }
  return {
    profileId: record.profile_id,
    parentUserId: record.parent_user_id,
    displayName:
      typeof record.display_name === "string" ? record.display_name.trim() : "",
    loginCode: record.login_code,
    passwordHash: record.password_hash,
  };
}

/**
 * Persists Lesemodus typography prefs on an owned child profile.
 * Pass `prefs: null` to clear the override (follow admin stage Standard).
 */
export async function saveChildReadingModePrefs(input: {
  profileId: string;
  prefs: ReadingModePrefs | null;
}): Promise<void> {
  const supabase = await createClient(null);
  const { error } = await supabase.rpc("save_my_child_reading_mode_prefs", {
    p_id: input.profileId,
    p_prefs: input.prefs ? normalizeReadingModePrefs(input.prefs) : {},
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
      fearsGentle: false,
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
    fearsGentle: first.fearsGentle,
    includeImages: first.includeImages,
    syllableHelp: first.syllableHelp,
    wordHighlight: first.wordHighlight,
    readableAloud: first.readableAloud,
    isDefault: first.isDefault,
  };
}
