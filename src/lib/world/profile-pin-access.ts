/**
 * Profile access gate. Eltern-PIN soft-lock removed — child login is separate.
 * Kept so existing call sites keep compiling; always allows when authenticated
 * as parent or as the matching child session.
 */

import { getAppSession } from "@/lib/auth/app-session";

/**
 * Ensures the actor may use this profile for personal stories / edits.
 */
export async function assertChildProfileUnlocked(
  profileId: string,
): Promise<string | null> {
  const session = await getAppSession();
  if (!session) {
    return "Bitte melde dich an.";
  }
  if (session.kind === "child" && session.profileId !== profileId) {
    return "Dieses Profil gehört nicht zu deiner Anmeldung.";
  }
  return null;
}

/** All profile ids are usable (PIN gate removed). */
export async function listUnlockedChildProfileIds(
  _userId: string,
  profiles: readonly { id: string; hasPin?: boolean }[],
): Promise<string[]> {
  return profiles.map((profile) => profile.id);
}
