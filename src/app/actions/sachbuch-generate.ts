"use server";

/**
 * 3-pass chapter generation for Sachbuch.
 */

import { revalidateSachbuchAdmin } from "@/lib/sachbuch/revalidate-admin";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import { generateSachbuchKapitel } from "@/lib/sachbuch/generate-section";
import type { SachbuchKontext } from "@/lib/sachbuch/types";
import type { ActionResult } from "@/lib/types/actions";
import {
  firstSachbuchZodMessage,
  sachbuchGenerateSchema,
} from "@/lib/validations/sachbuch";

/** Coach + 3 LLM passes can take a long time. */
export const maxDuration = 1800;

/**
 * Run Writer → Critic → Stylist. Client should poll generation-progress.
 */
export async function generateSachbuchKapitelAction(
  input: unknown,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = sachbuchGenerateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstSachbuchZodMessage(parsed.error) };
  }

  try {
    const book = await generateSachbuchKapitel({
      sachbuchId: parsed.data.sachbuchId,
      kapitelId: parsed.data.kapitelId,
      fromPass: parsed.data.fromPass,
    });
    revalidateSachbuchAdmin(book.id);
    return { success: true, data: { book } };
  } catch (error) {
    revalidateSachbuchAdmin(parsed.data.sachbuchId);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Kapitel-Generierung fehlgeschlagen.",
    };
  }
}
