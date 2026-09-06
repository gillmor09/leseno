"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/types/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { hashPin, verifyPin } from "@/lib/security/pin";
import { loadFeaturesForCurrentUser } from "@/lib/users/package-access";
import { featuresInclude } from "@/lib/users/packages";
import { normalizeReadingModePrefs } from "@/lib/stories/reading-mode-prefs";
import { assertChildProfileUnlocked } from "@/lib/world/profile-pin-access";
import {
  clearChildProfileUnlockCookie,
  setChildProfileUnlockCookie,
} from "@/lib/world/profile-pin-cookie";
import {
  clearChildProfilePinHash,
  deleteChildProfile,
  getChildProfilePinHash,
  listMyChildProfiles,
  saveChildProfile,
  saveChildReadingModePrefs,
  setChildProfilePinHash,
} from "@/lib/world/repository";
import {
  deleteChildProfileSchema,
  lockChildProfilePinSchema,
  removeChildProfilePinSchema,
  saveChildProfileSchema,
  saveChildReadingModePrefsSchema,
  setChildProfilePinSchema,
  unlockChildProfilePinSchema,
} from "@/lib/validations/user-world";

function revalidateWorldPaths() {
  revalidatePath("/meine-welt");
  revalidatePath("/geschichte");
}

async function assertMeineWeltFeature(): Promise<string | null> {
  const features = await loadFeaturesForCurrentUser();
  if (!featuresInclude(features, "meine_welt")) {
    return "Meine Welt gehört nicht zu deinem Paket.";
  }
  return null;
}

/**
 * Creates or updates a Meine-Welt child profile for the signed-in user.
 * Enforces package features (`meine_welt`, `meine_welt_familie`, reading extras).
 */
export async function saveChildProfileAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = saveChildProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Die Angaben sind ungültig.",
    };
  }

  try {
    const featureError = await assertMeineWeltFeature();
    if (featureError) {
      return { success: false, error: featureError };
    }

    const features = await loadFeaturesForCurrentUser();
    const isCreate = parsed.data.id == null;
    if (isCreate && !featuresInclude(features, "meine_welt_familie")) {
      const existing = await listMyChildProfiles();
      if (existing.length >= 1) {
        return {
          success: false,
          error:
            "In deinem Paket ist nur ein Kinder-Profil möglich. Upgrade für die Familien-Funktion.",
        };
      }
    }

    if (!isCreate && parsed.data.id) {
      const lockError = await assertChildProfileUnlocked(parsed.data.id);
      if (lockError) {
        return { success: false, error: lockError };
      }
    }

    const id = await saveChildProfile({
      id: parsed.data.id,
      fields: {
        displayName: parsed.data.displayName,
        schoolStage: parsed.data.schoolStage,
        lengthStep: parsed.data.lengthStep,
        mood: parsed.data.mood,
        friends: parsed.data.friends,
        interests: parsed.data.interests,
        experiences: parsed.data.experiences,
        fears: parsed.data.fears,
        fearsGentle: parsed.data.fearsGentle,
        includeImages:
          featuresInclude(features, "bilder") && parsed.data.includeImages,
        syllableHelp:
          featuresInclude(features, "silbenmethode") &&
          parsed.data.syllableHelp,
        wordHighlight:
          featuresInclude(features, "markierung") && parsed.data.wordHighlight,
        readableAloud:
          featuresInclude(features, "vorlesen") && parsed.data.readableAloud,
        isDefault: parsed.data.isDefault,
      },
    });
    revalidateWorldPaths();
    return { success: true, data: { id } };
  } catch (error) {
    console.error("[saveChildProfileAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Speichern hat nicht geklappt.",
    };
  }
}

/**
 * Saves Lesemodus typography prefs onto a child profile (immediate, no full form).
 * Requires `meine_welt` + `lesemodus`.
 */
export async function saveChildReadingModePrefsAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = saveChildReadingModePrefsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Darstellung ungültig.",
    };
  }

  try {
    const featureError = await assertMeineWeltFeature();
    if (featureError) {
      return { success: false, error: featureError };
    }
    const features = await loadFeaturesForCurrentUser();
    if (!featuresInclude(features, "lesemodus")) {
      return {
        success: false,
        error: "Lesemodus gehört nicht zu deinem Paket.",
      };
    }

    const lockError = await assertChildProfileUnlocked(parsed.data.profileId);
    if (lockError) {
      return { success: false, error: lockError };
    }

    await saveChildReadingModePrefs({
      profileId: parsed.data.profileId,
      prefs: parsed.data.prefs
        ? normalizeReadingModePrefs(parsed.data.prefs)
        : null,
    });
    return { success: true };
  } catch (error) {
    console.error("[saveChildReadingModePrefsAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Darstellung speichern fehlgeschlagen.",
    };
  }
}

/**
 * Deletes a Meine-Welt child profile after UI confirm.
 */
export async function deleteChildProfileAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = deleteChildProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige Profil-ID.",
    };
  }

  try {
    const featureError = await assertMeineWeltFeature();
    if (featureError) {
      return { success: false, error: featureError };
    }

    const lockError = await assertChildProfileUnlocked(parsed.data.id);
    if (lockError) {
      return { success: false, error: lockError };
    }

    await deleteChildProfile(parsed.data.id);
    await clearChildProfileUnlockCookie(parsed.data.id);
    revalidateWorldPaths();
    return { success: true };
  } catch (error) {
    console.error("[deleteChildProfileAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Löschen hat nicht geklappt.",
    };
  }
}

/** Unlocks a PIN-protected profile for this browser session (~2h). */
export async function unlockChildProfilePinAction(
  input: unknown,
): Promise<ActionResult<{ unlocked: true }>> {
  const parsed = unlockChildProfilePinSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige PIN.",
    };
  }

  try {
    const featureError = await assertMeineWeltFeature();
    if (featureError) {
      return { success: false, error: featureError };
    }

    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Bitte melde dich an." };
    }

    const pinHash = await getChildProfilePinHash(parsed.data.profileId);
    if (!pinHash) {
      return {
        success: false,
        error: "Für dieses Profil ist keine PIN gesetzt.",
      };
    }
    if (!verifyPin(parsed.data.pin, pinHash)) {
      return { success: false, error: "Die PIN stimmt nicht." };
    }

    await setChildProfileUnlockCookie(user.id, parsed.data.profileId);
    return { success: true, data: { unlocked: true } };
  } catch (error) {
    console.error("[unlockChildProfilePinAction]", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Entsperren fehlgeschlagen.",
    };
  }
}

/** Locks a profile again (clears unlock cookie). */
export async function lockChildProfilePinAction(
  input: unknown,
): Promise<ActionResult<{ unlocked: false }>> {
  const parsed = lockChildProfilePinSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige Profil-ID.",
    };
  }
  await clearChildProfileUnlockCookie(parsed.data.profileId);
  return { success: true, data: { unlocked: false } };
}

/**
 * Sets or changes the optional parent PIN.
 * When a PIN already exists, `currentPin` must match.
 */
export async function setChildProfilePinAction(
  input: unknown,
): Promise<ActionResult<{ hasPin: true }>> {
  const parsed = setChildProfilePinSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige PIN.",
    };
  }

  try {
    const featureError = await assertMeineWeltFeature();
    if (featureError) {
      return { success: false, error: featureError };
    }

    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Bitte melde dich an." };
    }

    const existingHash = await getChildProfilePinHash(parsed.data.profileId);
    if (existingHash) {
      const current = parsed.data.currentPin?.trim() ?? "";
      if (!/^\d{4,8}$/.test(current) || !verifyPin(current, existingHash)) {
        return {
          success: false,
          error: "Die aktuelle PIN stimmt nicht.",
        };
      }
    }

    await setChildProfilePinHash(
      parsed.data.profileId,
      hashPin(parsed.data.pin),
    );
    await setChildProfileUnlockCookie(user.id, parsed.data.profileId);
    revalidateWorldPaths();
    return { success: true, data: { hasPin: true } };
  } catch (error) {
    console.error("[setChildProfilePinAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "PIN speichern fehlgeschlagen.",
    };
  }
}

/** Removes the parent PIN after verifying the current PIN. */
export async function removeChildProfilePinAction(
  input: unknown,
): Promise<ActionResult<{ hasPin: false }>> {
  const parsed = removeChildProfilePinSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige PIN.",
    };
  }

  try {
    const featureError = await assertMeineWeltFeature();
    if (featureError) {
      return { success: false, error: featureError };
    }

    const existingHash = await getChildProfilePinHash(parsed.data.profileId);
    if (!existingHash) {
      return {
        success: false,
        error: "Für dieses Profil ist keine PIN gesetzt.",
      };
    }
    if (!verifyPin(parsed.data.currentPin, existingHash)) {
      return { success: false, error: "Die PIN stimmt nicht." };
    }

    await clearChildProfilePinHash(parsed.data.profileId);
    await clearChildProfileUnlockCookie(parsed.data.profileId);
    revalidateWorldPaths();
    return { success: true, data: { hasPin: false } };
  } catch (error) {
    console.error("[removeChildProfilePinAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "PIN entfernen fehlgeschlagen.",
    };
  }
}

/**
 * @deprecated Prefer saveChildProfileAction.
 */
export async function saveMyWorldAction(
  input: unknown,
): Promise<ActionResult> {
  const result = await saveChildProfileAction({
    ...(typeof input === "object" && input !== null ? input : {}),
    id: null,
  });
  if (!result.success) {
    return { success: false, error: result.error };
  }
  return { success: true };
}
