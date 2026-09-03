"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/types/actions";
import {
  updateAiModels,
  updatePromptTemplates,
} from "@/lib/prompts/repository";
import {
  aiModelsFormSchema,
  promptTemplatesFormSchema,
} from "@/lib/validations/prompt-admin";

/**
 * Saves model settings and prompt templates for the two-step story pipeline.
 * Auth can wrap this action later; writes already go through the service role.
 */
export async function saveAiModelsAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = aiModelsFormSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      success: false,
      error: first?.message ?? "Die Modell-Angaben sind ungültig.",
    };
  }

  try {
    await updateAiModels(parsed.data.models);
    revalidatePath("/admin/ki-modelle");
    revalidatePath("/admin/prompts");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return {
      success: false,
      error:
        message ||
        "Speichern hat nicht geklappt. Läuft Supabase und ist die Migration da?",
    };
  }
}

/**
 * Saves prompt templates for the two-step story pipeline.
 * Auth can wrap this action later; writes already go through the service role.
 */
export async function savePromptTemplatesAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = promptTemplatesFormSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      success: false,
      error: first?.message ?? "Die Prompt-Angaben sind ungültig.",
    };
  }

  try {
    await updatePromptTemplates(parsed.data.prompts);
    revalidatePath("/admin/prompts");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return {
      success: false,
      error:
        message ||
        "Speichern hat nicht geklappt. Läuft Supabase und ist die Migration da?",
    };
  }
}
