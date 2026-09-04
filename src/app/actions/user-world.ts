"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/types/actions";
import { saveMyWorld } from "@/lib/world/repository";
import { userWorldSchema } from "@/lib/validations/user-world";

/**
 * Saves the signed-in user's "Meine Welt" profile.
 */
export async function saveMyWorldAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = userWorldSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Die Angaben sind ungültig.",
    };
  }

  try {
    await saveMyWorld({
      displayName: parsed.data.displayName,
      friends: parsed.data.friends,
      interests: parsed.data.interests,
      experiences: parsed.data.experiences,
    });
    revalidatePath("/meine-welt");
    return { success: true };
  } catch (error) {
    console.error("[saveMyWorldAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Speichern hat nicht geklappt.",
    };
  }
}
