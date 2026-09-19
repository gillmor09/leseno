"use server";

/**
 * Admin actions for Roman-module KI roles (prompts + model).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  loadRomanKiRollen,
  saveRomanKiRolle,
  type RomanKiRolle,
} from "@/lib/roman/roles";
import type { ActionResult } from "@/lib/types/actions";

const romanKiRolleSaveSchema = z.object({
  key: z.string().min(1).max(80),
  label: z.string().min(1).max(200),
  purpose: z.string().max(2000),
  systemPrompt: z.string().max(50_000),
  userPromptHint: z.string().max(10_000),
  modelSlug: z.string().min(1).max(200),
  reasoningEffort: z.string().max(40).optional().default(""),
  sortOrder: z.number().int().min(0).max(10_000),
});

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Eingabe ungültig.";
}

/**
 * Lists roman KI roles (DB + fallback seeds).
 */
export async function loadRomanKiRollenAction(): Promise<
  ActionResult<{ rollen: RomanKiRolle[] }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  try {
    const rollen = await loadRomanKiRollen({ mergeFallback: true });
    return { success: true, data: { rollen } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "KI-Rollen laden fehlgeschlagen.",
    };
  }
}

/**
 * Saves one roman KI role (system prompt + model).
 */
export async function saveRomanKiRolleAction(
  input: unknown,
): Promise<ActionResult<{ rolle: RomanKiRolle }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = romanKiRolleSaveSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    await saveRomanKiRolle(parsed.data);
    const rollen = await loadRomanKiRollen({ mergeFallback: true });
    const rolle = rollen.find((r) => r.key === parsed.data.key);
    if (!rolle) {
      return { success: false, error: "Rolle nach dem Speichern nicht gefunden." };
    }
    revalidatePath("/admin/roman");
    revalidatePath("/admin/roman/rollen");
    return { success: true, data: { rolle } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "KI-Rolle speichern fehlgeschlagen.",
    };
  }
}
