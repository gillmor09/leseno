/**
 * Advent calendar books via public security-definer RPCs (`leseno.advent_*`).
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { StoryLengthStepId } from "@/lib/stories/length";
import type { StoryMoodId, StorySchoolStageId } from "@/lib/stories/options";
import { STORY_MOODS, STORY_SCHOOL_STAGES } from "@/lib/stories/options";
import { STORY_LENGTH_STEP_IDS } from "@/lib/stories/length";

const SCHOOL_STAGE_IDS = new Set(
  STORY_SCHOOL_STAGES.map((stage) => stage.id),
);
const LENGTH_STEP_IDS = new Set<string>(STORY_LENGTH_STEP_IDS);
const MOOD_IDS = new Set(STORY_MOODS.map((mood) => mood.id));

export type AdventBookStatus = "generating" | "ready" | "failed";

export type AdventBookSummary = {
  id: string;
  title: string;
  year: number;
  topic: string | null;
  schoolStage: StorySchoolStageId;
  lengthStep: StoryLengthStepId;
  mood: StoryMoodId;
  personalMode: boolean;
  childProfileId: string | null;
  profileDisplayName: string | null;
  daysReady: number;
  status: AdventBookStatus;
  createdAt: string;
};

export type AdventBookDetail = AdventBookSummary & {
  syllableHelp: boolean;
  includeImages: boolean;
  pinHash: string;
};

export type AdventDayMeta = {
  dayNumber: number;
  title: string;
  hasStory: boolean;
  userStoryId: string | null;
};

export type AdventDayContent = {
  dayNumber: number;
  title: string;
  storyHtml: string | null;
  facts: string[];
  userStoryId: string | null;
  isLocked: boolean;
  unlockDate: string;
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

function asStatus(value: unknown): AdventBookStatus {
  if (value === "ready" || value === "failed" || value === "generating") {
    return value;
  }
  return "generating";
}

function asFacts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function mapSummary(row: Record<string, unknown>): AdventBookSummary {
  return {
    id: typeof row.id === "string" ? row.id : String(row.id ?? ""),
    title: typeof row.title === "string" ? row.title.trim() : "Adventskalenderbuch",
    year: typeof row.year === "number" ? row.year : Number(row.year) || 2026,
    topic: typeof row.topic === "string" ? row.topic.trim() || null : null,
    schoolStage: asSchoolStage(row.school_stage),
    lengthStep: asLengthStep(row.length_step),
    mood: asMood(row.mood),
    personalMode: Boolean(row.personal_mode),
    childProfileId:
      typeof row.child_profile_id === "string" ? row.child_profile_id : null,
    profileDisplayName:
      typeof row.profile_display_name === "string"
        ? row.profile_display_name.trim() || null
        : null,
    daysReady:
      typeof row.days_ready === "number" ? row.days_ready : Number(row.days_ready) || 0,
    status: asStatus(row.status),
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : new Date().toISOString(),
  };
}

export type CreateAdventBookInput = {
  title: string;
  year: number;
  topic: string | null;
  schoolStage: StorySchoolStageId;
  lengthStep: StoryLengthStepId;
  mood: StoryMoodId;
  pinHash: string;
  childProfileId?: string | null;
  personalMode?: boolean;
  syllableHelp?: boolean;
  includeImages?: boolean;
  creditsCharged?: number | null;
};

export async function createMyAdventBook(
  input: CreateAdventBookInput,
): Promise<string> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("create_my_advent_book", {
    p_title: input.title,
    p_year: input.year,
    p_topic: input.topic,
    p_school_stage: input.schoolStage,
    p_length_step: input.lengthStep,
    p_mood: input.mood,
    p_pin_hash: input.pinHash,
    p_child_profile_id: input.childProfileId ?? null,
    p_personal_mode: input.personalMode ?? false,
    p_syllable_help: input.syllableHelp ?? false,
    p_include_images: input.includeImages ?? false,
    p_credits_charged: input.creditsCharged ?? null,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== "string" || !data) {
    throw new Error("Adventskalenderbuch anlegen fehlgeschlagen.");
  }
  return data;
}

export async function saveMyAdventDay(input: {
  bookId: string;
  dayNumber: number;
  title: string;
  storyHtml: string;
  facts: string[];
  userStoryId?: string | null;
}): Promise<string> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("save_my_advent_day", {
    p_book_id: input.bookId,
    p_day_number: input.dayNumber,
    p_title: input.title,
    p_story_html: input.storyHtml,
    p_facts: input.facts,
    p_user_story_id: input.userStoryId ?? null,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== "string" || !data) {
    throw new Error("Adventstag speichern fehlgeschlagen.");
  }
  return data;
}

export async function markMyAdventBookFailed(bookId: string): Promise<void> {
  const supabase = await createClient(null);
  const { error } = await supabase.rpc("mark_my_advent_book_failed", {
    p_book_id: bookId,
  });
  if (error) throw new Error(error.message);
}

export async function listMyAdventBooks(): Promise<AdventBookSummary[]> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("list_my_advent_books");
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];
  return data.map((row) => mapSummary(row as Record<string, unknown>));
}

export async function getMyAdventBook(
  bookId: string,
): Promise<AdventBookDetail | null> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("get_my_advent_book", {
    p_id: bookId,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  return {
    ...mapSummary(record),
    syllableHelp: Boolean(record.syllable_help),
    includeImages: Boolean(record.include_images),
    pinHash: typeof record.pin_hash === "string" ? record.pin_hash : "",
  };
}

export async function listMyAdventDayMeta(
  bookId: string,
): Promise<AdventDayMeta[]> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("list_my_advent_day_meta", {
    p_book_id: bookId,
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      dayNumber:
        typeof r.day_number === "number"
          ? r.day_number
          : Number(r.day_number) || 0,
      title: typeof r.title === "string" ? r.title : "Tür",
      hasStory: Boolean(r.has_story),
      userStoryId:
        typeof r.user_story_id === "string" ? r.user_story_id : null,
    };
  });
}

/** Date-gated day body (locked HTML is null). */
export async function getMyAdventDay(
  bookId: string,
  dayNumber: number,
): Promise<AdventDayContent | null> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("get_my_advent_day", {
    p_book_id: bookId,
    p_day_number: dayNumber,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  return mapDayContent(row as Record<string, unknown>);
}

/**
 * Full day body for parent preview — service RPC after server PIN/cookie check.
 */
export async function getAdventDayForPreview(
  userId: string,
  bookId: string,
  dayNumber: number,
): Promise<AdventDayContent | null> {
  const service = createServiceClient(null);
  const { data, error } = await service.rpc("service_get_advent_day", {
    p_user_id: userId,
    p_book_id: bookId,
    p_day_number: dayNumber,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  return {
    dayNumber:
      typeof record.day_number === "number"
        ? record.day_number
        : Number(record.day_number) || 0,
    title: typeof record.title === "string" ? record.title : "Tür",
    storyHtml:
      typeof record.story_html === "string" ? record.story_html : null,
    facts: asFacts(record.facts),
    userStoryId:
      typeof record.user_story_id === "string" ? record.user_story_id : null,
    isLocked: false,
    unlockDate:
      typeof record.unlock_date === "string"
        ? record.unlock_date
        : String(record.unlock_date ?? ""),
  };
}

export async function getMyAdventDayHtmlForGenerate(
  bookId: string,
  dayNumber: number,
): Promise<string | null> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc(
    "get_my_advent_day_html_for_generate",
    {
      p_book_id: bookId,
      p_day_number: dayNumber,
    },
  );
  if (error) throw new Error(error.message);
  return typeof data === "string" && data.trim() ? data : null;
}

export async function linkMyAdventDayStory(
  bookId: string,
  dayNumber: number,
  userStoryId: string,
): Promise<void> {
  const supabase = await createClient(null);
  const { error } = await supabase.rpc("link_my_advent_day_story", {
    p_book_id: bookId,
    p_day_number: dayNumber,
    p_user_story_id: userStoryId,
  });
  if (error) throw new Error(error.message);
}

function mapDayContent(row: Record<string, unknown>): AdventDayContent {
  return {
    dayNumber:
      typeof row.day_number === "number"
        ? row.day_number
        : Number(row.day_number) || 0,
    title: typeof row.title === "string" ? row.title : "Tür",
    storyHtml:
      typeof row.story_html === "string" ? row.story_html : null,
    facts: asFacts(row.facts),
    userStoryId:
      typeof row.user_story_id === "string" ? row.user_story_id : null,
    isLocked: Boolean(row.is_locked),
    unlockDate:
      typeof row.unlock_date === "string"
        ? row.unlock_date
        : String(row.unlock_date ?? ""),
  };
}
