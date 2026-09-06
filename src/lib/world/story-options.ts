/**
 * Loads child-profile options for story composers (signed-in only).
 */

import { canUsePersonalMode } from "@/lib/stories/personal";
import type { ChildProfileOption } from "@/lib/world/catalog";
import { listMyChildProfiles } from "@/lib/world/repository";

/**
 * Returns profile tabs data, or null when the caller is a guest / load failed.
 * `personalReady` excludes seeds that only overlap with fears.
 */
export async function loadChildProfileOptionsForUser(
  isSignedIn: boolean,
): Promise<ChildProfileOption[] | null> {
  if (!isSignedIn) return null;
  try {
    const profiles = await listMyChildProfiles();
    return profiles.map((profile) => {
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
      };
    });
  } catch (error) {
    console.error("[loadChildProfileOptionsForUser]", error);
    return [];
  }
}
