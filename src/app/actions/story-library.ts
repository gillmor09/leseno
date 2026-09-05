"use server";

/**
 * Server actions for Meine Bücherei (list/load/favorite/read).
 * Requires package feature `buecherei`.
 */

import { getCurrentUser } from "@/lib/auth/session";
import {
  getMyStory,
  listMyStories,
  setMyStoryFavorite,
  setMyStoryRead,
  type UserStoryDetail,
  type UserStorySummary,
} from "@/lib/stories/library-repository";
import { currentUserHasFeature } from "@/lib/users/package-access";
import type { ActionResult } from "@/lib/types/actions";

const BUECHEREI_DENIED =
  "Meine Bücherei gehört nicht zu deinem Paket.";

async function assertBuechereiAccess(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) {
    return "Bitte melde dich an.";
  }
  if (!(await currentUserHasFeature("buecherei"))) {
    return BUECHEREI_DENIED;
  }
  return null;
}

/** Lists the signed-in user's library summaries. */
export async function listMyStoriesAction(): Promise<
  ActionResult<{ stories: UserStorySummary[] }>
> {
  const denied = await assertBuechereiAccess();
  if (denied) {
    return { success: false, error: denied };
  }
  try {
    const stories = await listMyStories();
    return { success: true, data: { stories } };
  } catch (error) {
    console.error("[listMyStoriesAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Bücherei konnte nicht geladen werden.",
    };
  }
}

/** Loads one story for expand view. */
export async function getMyStoryAction(input: {
  storyId: string;
}): Promise<ActionResult<{ story: UserStoryDetail }>> {
  const denied = await assertBuechereiAccess();
  if (denied) {
    return { success: false, error: denied };
  }
  if (!input.storyId?.trim()) {
    return { success: false, error: "Geschichte fehlt." };
  }
  try {
    const story = await getMyStory(input.storyId);
    if (!story) {
      return { success: false, error: "Geschichte nicht gefunden." };
    }
    return { success: true, data: { story } };
  } catch (error) {
    console.error("[getMyStoryAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Geschichte konnte nicht geladen werden.",
    };
  }
}

/** Toggles favorite on an owned library story. */
export async function setMyStoryFavoriteAction(input: {
  storyId: string;
  isFavorite: boolean;
}): Promise<ActionResult<{ isFavorite: boolean }>> {
  const denied = await assertBuechereiAccess();
  if (denied) {
    return { success: false, error: denied };
  }
  if (!input.storyId?.trim()) {
    return { success: false, error: "Geschichte fehlt." };
  }
  try {
    await setMyStoryFavorite(input.storyId, Boolean(input.isFavorite));
    return { success: true, data: { isFavorite: Boolean(input.isFavorite) } };
  } catch (error) {
    console.error("[setMyStoryFavoriteAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Favorit konnte nicht gespeichert werden.",
    };
  }
}

/** Toggles read on an owned library story. */
export async function setMyStoryReadAction(input: {
  storyId: string;
  isRead: boolean;
}): Promise<ActionResult<{ isRead: boolean }>> {
  const denied = await assertBuechereiAccess();
  if (denied) {
    return { success: false, error: denied };
  }
  if (!input.storyId?.trim()) {
    return { success: false, error: "Geschichte fehlt." };
  }
  try {
    await setMyStoryRead(input.storyId, Boolean(input.isRead));
    return { success: true, data: { isRead: Boolean(input.isRead) } };
  } catch (error) {
    console.error("[setMyStoryReadAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Gelesen-Status konnte nicht gespeichert werden.",
    };
  }
}
