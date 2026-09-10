/**
 * Loads child-profile options for story composers (parent or child session).
 */

import { getAppSession } from "@/lib/auth/app-session";
import { canUsePersonalMode } from "@/lib/stories/personal";
import type { ChildProfile, ChildProfileOption } from "@/lib/world/catalog";
import {
  listMyChildProfiles,
  loadChildProfileByIdService,
} from "@/lib/world/repository";

function toOption(profile: ChildProfile): ChildProfileOption {
  const hasName = Boolean(profile.displayName.trim());
  const personalReady = canUsePersonalMode(profile);
  return {
    id: profile.id,
    displayName: profile.displayName.trim() || "Ohne Namen",
    schoolStage: profile.schoolStage,
    lengthStep: profile.lengthStep,
    mood: profile.mood,
    hasName,
    hasTopicSeeds: personalReady,
    personalReady,
    includeImages: profile.includeImages,
    syllableHelp: profile.syllableHelp,
    wordHighlight: profile.wordHighlight,
    readableAloud: profile.readableAloud,
    isDefault: profile.isDefault,
    readingModePrefs: profile.readingModePrefs,
    hasPin: false,
    loginCode: profile.loginCode,
    hasPassword: profile.hasPassword,
  };
}

/**
 * Returns profile tabs data, or null when signed out / load failed.
 * Child sessions only see their own profile (Meine Welt stays hidden).
 * `personalReady` excludes seeds that only overlap with fears.
 */
export async function loadChildProfileOptionsForUser(
  isSignedIn: boolean,
): Promise<ChildProfileOption[] | null> {
  if (!isSignedIn) return null;
  try {
    const session = await getAppSession();
    if (!session) return null;

    if (session.kind === "child") {
      const profile = await loadChildProfileByIdService(
        session.profileId,
        session.parentUserId,
      );
      return profile ? [toOption(profile)] : [];
    }

    const profiles = await listMyChildProfiles();
    return profiles.map(toOption);
  } catch (error) {
    console.error("[loadChildProfileOptionsForUser]", error);
    return [];
  }
}
