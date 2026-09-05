"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/types/actions";
import { loadFeaturesForCurrentUser } from "@/lib/users/package-access";
import { featuresInclude } from "@/lib/users/packages";
import {
  deleteChildProfile,
  listMyChildProfiles,
  saveChildProfile,
} from "@/lib/world/repository";
import {
  deleteChildProfileSchema,
  saveChildProfileSchema,
} from "@/lib/validations/user-world";

function revalidateWorldPaths() {
  revalidatePath("/meine-welt");
  revalidatePath("/geschichte");
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
    const features = await loadFeaturesForCurrentUser();
    if (!featuresInclude(features, "meine_welt")) {
      return {
        success: false,
        error: "Meine Welt gehört nicht zu deinem Paket.",
      };
    }

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
    const features = await loadFeaturesForCurrentUser();
    if (!featuresInclude(features, "meine_welt")) {
      return {
        success: false,
        error: "Meine Welt gehört nicht zu deinem Paket.",
      };
    }

    await deleteChildProfile(parsed.data.id);
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
