/**
 * Parent-PIN gate for Meine-Welt profiles (cookie unlock after verify).
 */

import { getCurrentUser } from "@/lib/auth/session";
import {
  hasChildProfileUnlockCookie,
} from "@/lib/world/profile-pin-cookie";
import { getChildProfilePinHash } from "@/lib/world/repository";

/**
 * Ensures a locked profile is unlocked for this session.
 * Profiles without a PIN always pass.
 */
export async function assertChildProfileUnlocked(
  profileId: string,
): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) {
    return "Bitte melde dich an.";
  }

  const pinHash = await getChildProfilePinHash(profileId);
  if (!pinHash) {
    return null;
  }

  const unlocked = await hasChildProfileUnlockCookie(user.id, profileId);
  if (!unlocked) {
    return "Dieses Profil ist mit einer Eltern-PIN geschützt. Bitte zuerst entsperren.";
  }
  return null;
}

/** Profile ids that currently have a valid unlock cookie. */
export async function listUnlockedChildProfileIds(
  userId: string,
  profiles: readonly { id: string; hasPin: boolean }[],
): Promise<string[]> {
  const unlocked: string[] = [];
  for (const profile of profiles) {
    if (!profile.hasPin) {
      unlocked.push(profile.id);
      continue;
    }
    if (await hasChildProfileUnlockCookie(userId, profile.id)) {
      unlocked.push(profile.id);
    }
  }
  return unlocked;
}
