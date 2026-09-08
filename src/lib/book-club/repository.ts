/**
 * Mein Buchclub data access via public security-definer RPCs.
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

export type FriendshipStatus = "pending" | "accepted";
export type FriendshipDirection = "incoming" | "outgoing";

export type BookClubFriendship = {
  id: string;
  status: FriendshipStatus;
  direction: FriendshipDirection;
  otherUserId: string;
  otherFriendshipCode: string | null;
  createdAt: string;
};

export type FriendSharedStorySummary = {
  id: string;
  title: string;
  ownerUserId: string;
  ownerFriendshipCode: string | null;
  schoolStage: StorySchoolStageId;
  parentStoryId: string | null;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  createdAt: string;
};

export type FriendSharedStoryDetail = FriendSharedStorySummary & {
  storyHtml: string;
  facts: string[];
  lengthStep: StoryLengthStepId | null;
  mood: StoryMoodId | null;
  topic: string | null;
  syllableHelp: boolean;
  includeImages: boolean;
};

export type StoryComment = {
  id: string;
  body: string;
  authorFriendshipCode: string | null;
  createdAt: string;
  isMine: boolean;
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

function asCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function asIso(value: unknown): string {
  return typeof value === "string" ? value : new Date().toISOString();
}

function mapFriendship(row: Record<string, unknown>): BookClubFriendship {
  const status =
    row.status === "accepted" || row.status === "pending"
      ? row.status
      : "pending";
  const direction =
    row.direction === "incoming" || row.direction === "outgoing"
      ? row.direction
      : "outgoing";
  return {
    id: typeof row.id === "string" ? row.id : String(row.id ?? ""),
    status,
    direction,
    otherUserId:
      typeof row.other_user_id === "string"
        ? row.other_user_id
        : String(row.other_user_id ?? ""),
    otherFriendshipCode:
      typeof row.other_friendship_code === "string"
        ? row.other_friendship_code.trim() || null
        : null,
    createdAt: asIso(row.created_at),
  };
}

function mapFriendSummary(
  row: Record<string, unknown>,
): FriendSharedStorySummary {
  return {
    id: typeof row.id === "string" ? row.id : String(row.id ?? ""),
    title: typeof row.title === "string" ? row.title.trim() : "Ohne Titel",
    ownerUserId:
      typeof row.owner_user_id === "string"
        ? row.owner_user_id
        : String(row.owner_user_id ?? ""),
    ownerFriendshipCode:
      typeof row.owner_friendship_code === "string"
        ? row.owner_friendship_code.trim() || null
        : null,
    schoolStage: asSchoolStage(row.school_stage),
    parentStoryId:
      typeof row.parent_story_id === "string" ? row.parent_story_id : null,
    likeCount: asCount(row.like_count),
    commentCount: asCount(row.comment_count),
    likedByMe: Boolean(row.liked_by_me),
    createdAt: asIso(row.created_at),
  };
}

function mapFriendDetail(
  row: Record<string, unknown>,
): FriendSharedStoryDetail {
  return {
    ...mapFriendSummary(row),
    storyHtml: typeof row.story_html === "string" ? row.story_html : "",
    facts: asFacts(row.facts),
    lengthStep: asLengthStep(row.length_step),
    mood: asMood(row.mood),
    topic: typeof row.topic === "string" ? row.topic.trim() || null : null,
    syllableHelp: Boolean(row.syllable_help),
    includeImages: Boolean(row.include_images),
  };
}

function mapComment(row: Record<string, unknown>): StoryComment {
  return {
    id: typeof row.id === "string" ? row.id : String(row.id ?? ""),
    body: typeof row.body === "string" ? row.body : "",
    authorFriendshipCode:
      typeof row.author_friendship_code === "string"
        ? row.author_friendship_code.trim() || null
        : null,
    createdAt: asIso(row.created_at),
    isMine: Boolean(row.is_mine),
  };
}

/** Current user's friendship code (may be null until set). */
export async function getMyBookClubProfile(): Promise<{
  friendshipCode: string | null;
}> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("get_my_book_club_profile");
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as Record<string, unknown>[])[0];
  const code =
    typeof row?.friendship_code === "string"
      ? row.friendship_code.trim() || null
      : null;
  return { friendshipCode: code };
}

/** Sets or updates the signed-in user's friendship code (stored lowercase). */
export async function setMyFriendshipCode(code: string): Promise<string> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("set_my_friendship_code", {
    p_code: code,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== "string" || !data) {
    throw new Error("Kennung konnte nicht gespeichert werden.");
  }
  return data;
}

/** Sends a pending friendship request by the other user's code. */
export async function requestFriendshipByCode(code: string): Promise<string> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("request_friendship_by_code", {
    p_code: code,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== "string" || !data) {
    throw new Error("Anfrage fehlgeschlagen.");
  }
  return data;
}

export async function respondToFriendship(
  friendshipId: string,
  accept: boolean,
): Promise<void> {
  const supabase = await createClient(null);
  const { error } = await supabase.rpc("respond_to_friendship", {
    p_friendship_id: friendshipId,
    p_accept: accept,
  });
  if (error) throw new Error(error.message);
}

export async function cancelFriendshipRequest(
  friendshipId: string,
): Promise<void> {
  const supabase = await createClient(null);
  const { error } = await supabase.rpc("cancel_friendship_request", {
    p_friendship_id: friendshipId,
  });
  if (error) throw new Error(error.message);
}

export async function removeFriendship(friendshipId: string): Promise<void> {
  const supabase = await createClient(null);
  const { error } = await supabase.rpc("remove_friendship", {
    p_friendship_id: friendshipId,
  });
  if (error) throw new Error(error.message);
}

export async function listMyFriendships(): Promise<BookClubFriendship[]> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("list_my_friendships");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(mapFriendship);
}

export async function listFriendSharedStories(
  friendUserId?: string | null,
): Promise<FriendSharedStorySummary[]> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("list_friend_shared_stories", {
    p_friend_user_id: friendUserId ?? null,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(mapFriendSummary);
}

export async function getFriendSharedStory(
  storyId: string,
): Promise<FriendSharedStoryDetail | null> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("get_friend_shared_story", {
    p_id: storyId,
  });
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as Record<string, unknown>[])[0];
  if (!row) return null;
  return mapFriendDetail(row);
}

export async function toggleFriendStoryLike(
  storyId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("toggle_friend_story_like", {
    p_story_id: storyId,
  });
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as Record<string, unknown>[])[0];
  return {
    liked: Boolean(row?.liked),
    likeCount: asCount(row?.like_count),
  };
}

export async function listStoryComments(
  storyId: string,
): Promise<StoryComment[]> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("list_story_comments", {
    p_story_id: storyId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(mapComment);
}

export async function addFriendStoryComment(
  storyId: string,
  body: string,
): Promise<string> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("add_friend_story_comment", {
    p_story_id: storyId,
    p_body: body,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== "string" || !data) {
    throw new Error("Kommentar konnte nicht gespeichert werden.");
  }
  return data;
}

/** Records invite for rate-limit audit; call before/after SMTP send. */
export async function recordBookClubInvite(email: string): Promise<string> {
  const supabase = await createClient(null);
  const { data, error } = await supabase.rpc("record_book_club_invite", {
    p_email: email,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== "string" || !data) {
    throw new Error("Einladung konnte nicht vermerkt werden.");
  }
  return data;
}
