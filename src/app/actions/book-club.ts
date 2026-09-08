"use server";

/**
 * Server actions for Mein Buchclub (friends, invites, shared stories).
 * Requires package feature `buchclub` (Plus+).
 */

import {
  hasSmtpConfig,
  sendSmtpHtmlEmail,
} from "@/lib/auth/email-hook-security";
import { getCurrentUser } from "@/lib/auth/session";
import {
  cancelFriendshipRequest,
  getFriendSharedStory,
  getMyBookClubProfile,
  listFriendSharedStories,
  listMyFriendships,
  recordBookClubInvite,
  removeFriendship,
  requestFriendshipByCode,
  respondToFriendship,
  setMyFriendshipCode,
  toggleFriendStoryLike,
  type BookClubFriendship,
  type FriendSharedStoryDetail,
  type FriendSharedStorySummary,
} from "@/lib/book-club/repository";
import {
  buildSignupUrl,
  referralCodeFromUserId,
} from "@/lib/marketing/referral";
import { setMyStoryBookClubShare } from "@/lib/stories/library-repository";
import type { BookClubShareLevel } from "@/lib/book-club/share";
import type { ActionResult } from "@/lib/types/actions";
import {
  bookClubInviteEmailSchema,
  bookClubShareLevelSchema,
  friendshipCodeSchema,
} from "@/lib/validations/book-club";
import { currentUserHasFeature } from "@/lib/users/package-access";

const BUCHCLUB_DENIED = "Mein Buchclub gehört nicht zu deinem Paket.";

async function assertBuchclubAccess(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return "Bitte melde dich an.";
  if (!(await currentUserHasFeature("buchclub"))) {
    return BUCHCLUB_DENIED;
  }
  return null;
}

/** Loads club profile + friendships + shared friend stories for the page. */
export async function loadBookClubPageAction(): Promise<
  ActionResult<{
    friendshipCode: string | null;
    friendships: BookClubFriendship[];
    stories: FriendSharedStorySummary[];
  }>
> {
  const denied = await assertBuchclubAccess();
  if (denied) return { success: false, error: denied };
  try {
    const [profile, friendships, stories] = await Promise.all([
      getMyBookClubProfile(),
      listMyFriendships(),
      listFriendSharedStories(),
    ]);
    return {
      success: true,
      data: {
        friendshipCode: profile.friendshipCode,
        friendships,
        stories,
      },
    };
  } catch (error) {
    console.error("[loadBookClubPageAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Buchclub konnte nicht geladen werden.",
    };
  }
}

export async function setMyFriendshipCodeAction(input: {
  code: string;
}): Promise<ActionResult<{ friendshipCode: string }>> {
  const denied = await assertBuchclubAccess();
  if (denied) return { success: false, error: denied };
  const parsed = friendshipCodeSchema.safeParse(input.code);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige Kennung.",
    };
  }
  try {
    const friendshipCode = await setMyFriendshipCode(parsed.data);
    return { success: true, data: { friendshipCode } };
  } catch (error) {
    console.error("[setMyFriendshipCodeAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Kennung konnte nicht gespeichert werden.",
    };
  }
}

export async function requestFriendshipByCodeAction(input: {
  code: string;
}): Promise<ActionResult<{ friendshipId: string }>> {
  const denied = await assertBuchclubAccess();
  if (denied) return { success: false, error: denied };
  const parsed = friendshipCodeSchema.safeParse(input.code);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige Kennung.",
    };
  }
  try {
    const friendshipId = await requestFriendshipByCode(parsed.data);
    return { success: true, data: { friendshipId } };
  } catch (error) {
    console.error("[requestFriendshipByCodeAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Freundschaftsanfrage fehlgeschlagen.",
    };
  }
}

export async function respondToFriendshipAction(input: {
  friendshipId: string;
  accept: boolean;
}): Promise<ActionResult<{ friendshipId: string }>> {
  const denied = await assertBuchclubAccess();
  if (denied) return { success: false, error: denied };
  if (!input.friendshipId?.trim()) {
    return { success: false, error: "Anfrage fehlt." };
  }
  try {
    await respondToFriendship(input.friendshipId, Boolean(input.accept));
    return { success: true, data: { friendshipId: input.friendshipId } };
  } catch (error) {
    console.error("[respondToFriendshipAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Antwort konnte nicht gespeichert werden.",
    };
  }
}

export async function cancelFriendshipRequestAction(input: {
  friendshipId: string;
}): Promise<ActionResult<{ friendshipId: string }>> {
  const denied = await assertBuchclubAccess();
  if (denied) return { success: false, error: denied };
  if (!input.friendshipId?.trim()) {
    return { success: false, error: "Anfrage fehlt." };
  }
  try {
    await cancelFriendshipRequest(input.friendshipId);
    return { success: true, data: { friendshipId: input.friendshipId } };
  } catch (error) {
    console.error("[cancelFriendshipRequestAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Anfrage konnte nicht zurückgezogen werden.",
    };
  }
}

export async function removeFriendshipAction(input: {
  friendshipId: string;
}): Promise<ActionResult<{ friendshipId: string }>> {
  const denied = await assertBuchclubAccess();
  if (denied) return { success: false, error: denied };
  if (!input.friendshipId?.trim()) {
    return { success: false, error: "Freundschaft fehlt." };
  }
  try {
    await removeFriendship(input.friendshipId);
    return { success: true, data: { friendshipId: input.friendshipId } };
  } catch (error) {
    console.error("[removeFriendshipAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Freundschaft konnte nicht entfernt werden.",
    };
  }
}

export async function listFriendSharedStoriesAction(input?: {
  friendUserId?: string | null;
}): Promise<ActionResult<{ stories: FriendSharedStorySummary[] }>> {
  const denied = await assertBuchclubAccess();
  if (denied) return { success: false, error: denied };
  try {
    const stories = await listFriendSharedStories(input?.friendUserId ?? null);
    return { success: true, data: { stories } };
  } catch (error) {
    console.error("[listFriendSharedStoriesAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Geschichten konnten nicht geladen werden.",
    };
  }
}

export async function getFriendSharedStoryAction(input: {
  storyId: string;
}): Promise<ActionResult<{ story: FriendSharedStoryDetail }>> {
  const denied = await assertBuchclubAccess();
  if (denied) return { success: false, error: denied };
  if (!input.storyId?.trim()) {
    return { success: false, error: "Geschichte fehlt." };
  }
  try {
    const story = await getFriendSharedStory(input.storyId);
    if (!story) {
      return { success: false, error: "Geschichte nicht gefunden." };
    }
    return { success: true, data: { story } };
  } catch (error) {
    console.error("[getFriendSharedStoryAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Geschichte konnte nicht geladen werden.",
    };
  }
}

export async function toggleFriendStoryLikeAction(input: {
  storyId: string;
}): Promise<ActionResult<{ liked: boolean; likeCount: number }>> {
  const denied = await assertBuchclubAccess();
  if (denied) return { success: false, error: denied };
  if (!input.storyId?.trim()) {
    return { success: false, error: "Geschichte fehlt." };
  }
  try {
    const result = await toggleFriendStoryLike(input.storyId);
    return { success: true, data: result };
  } catch (error) {
    console.error("[toggleFriendStoryLikeAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Like konnte nicht gespeichert werden.",
    };
  }
}

/**
 * Sets Buchclub visibility for an owned library story (Privat / Freunde / Öffentlich).
 * Requires package feature `buecherei` (stories live in the library).
 */
export async function setMyStoryBookClubShareAction(input: {
  storyId: string;
  share: BookClubShareLevel;
}): Promise<ActionResult<{ share: BookClubShareLevel }>> {
  const denied = await assertBuchclubAccess();
  if (denied) return { success: false, error: denied };
  if (!(await currentUserHasFeature("buecherei"))) {
    return {
      success: false,
      error: "Meine Bücherei gehört nicht zu deinem Paket.",
    };
  }
  if (!input.storyId?.trim()) {
    return { success: false, error: "Geschichte fehlt." };
  }
  const parsed = bookClubShareLevelSchema.safeParse(input.share);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige Freigabe.",
    };
  }
  try {
    await setMyStoryBookClubShare(input.storyId, parsed.data);
    return { success: true, data: { share: parsed.data } };
  } catch (error) {
    console.error("[setMyStoryBookClubShareAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Freigabe konnte nicht gespeichert werden.",
    };
  }
}

/** Invites someone to Leseno by email (signup link + soft referral). */
export async function sendBookClubInviteEmailAction(input: {
  email: string;
}): Promise<ActionResult<{ email: string }>> {
  const denied = await assertBuchclubAccess();
  if (denied) return { success: false, error: denied };
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Bitte melde dich an." };

  const parsed = bookClubInviteEmailSchema.safeParse(input.email);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige E-Mail.",
    };
  }

  if (!hasSmtpConfig()) {
    return {
      success: false,
      error: "E-Mail-Versand ist derzeit nicht konfiguriert.",
    };
  }

  const email = parsed.data.toLowerCase();
  try {
    await recordBookClubInvite(email);
  } catch (error) {
    console.error("[sendBookClubInviteEmailAction] record", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Einladung konnte nicht vermerkt werden.",
    };
  }

  const signupUrl = buildSignupUrl(referralCodeFromUserId(user.id));
  const html = `
    <p>Hallo!</p>
    <p>Jemand aus dem leseno-Buchclub möchte dich einladen.</p>
    <p>Mit leseno entstehen persönliche Kindergeschichten zum Lesenlernen.</p>
    <p><a href="${signupUrl}">Jetzt bei leseno registrieren</a></p>
    <p>Wenn der Link nicht funktioniert, kopiere diese Adresse in den Browser:<br/>${signupUrl}</p>
  `;

  try {
    await sendSmtpHtmlEmail({
      to: email,
      subject: "Einladung zu leseno",
      html,
    });
    return { success: true, data: { email } };
  } catch (error) {
    console.error("[sendBookClubInviteEmailAction] smtp", error);
    return {
      success: false,
      error: "Einladung konnte nicht gesendet werden. Bitte später erneut versuchen.",
    };
  }
}
