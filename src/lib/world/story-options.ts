/**
 * Loads child-profile options for story composers (signed-in only).
 */

import type { ChildProfileOption } from "@/lib/world/catalog";
import { listMyChildProfiles } from "@/lib/world/repository";

/**
 * Returns profile tabs data, or null when the caller is a guest / load failed.
 */
export async function loadChildProfileOptionsForUser(
  isSignedIn: boolean,
): Promise<ChildProfileOption[] | null> {
  if (!isSignedIn) return null;
  try {
    const profiles = await listMyChildProfiles();
    return profiles.map((profile) => {
      const hasName = Boolean(profile.displayName.trim());
      const hasTopicSeeds =
        profile.interests.length > 0 || profile.experiences.length > 0;
      return {
        id: profile.id,
        displayName: profile.displayName.trim() || "Ohne Namen",
        schoolStage: profile.schoolStage,
        lengthStep: profile.lengthStep,
        mood: profile.mood,
        hasName,
        hasTopicSeeds,
        personalReady: hasName && hasTopicSeeds,
        includeImages: profile.includeImages,
        syllableHelp: profile.syllableHelp,
        wordHighlight: profile.wordHighlight,
        readableAloud: profile.readableAloud,
        isDefault: profile.isDefault,
      };
    });
  } catch (error) {
    console.error("[loadChildProfileOptionsForUser]", error);
    return [];
  }
}
