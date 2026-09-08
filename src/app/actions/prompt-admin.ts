"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  listTtsVoicesForProvider,
  type TtsVoiceOption,
} from "@/lib/ai/tts-voices";
import { providerForWiredSlug } from "@/lib/ai/wired-models";
import { toUserFacingMessage, UserFacingError } from "@/lib/errors/user-facing";
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
 * Saves model settings for the story pipeline. Admin role required.
 */
export async function saveAiModelsAction(
  input: unknown,
): Promise<ActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) {
    return { success: false, error: denied };
  }

  const parsed = aiModelsFormSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      success: false,
      error: first?.message ?? "Die Modell-Angaben sind ungültig.",
    };
  }

  try {
    // Provider is always derived from the wired slug (never trust client alone).
    const models = parsed.data.models.map((model) => {
      const provider = providerForWiredSlug(model.modelSlug);
      if (!provider) {
        throw new Error(`Modell „${model.modelSlug}“ ist nicht angebunden.`);
      }
      return { ...model, provider, ttsVoiceId: model.ttsVoiceId ?? null };
    });
    await updateAiModels(models);
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

const listTtsVoicesSchema = z.object({
  provider: z.string().trim().min(1),
});

/**
 * Loads selectable TTS voices for Admin KI-Modelle (German-first where possible).
 */
export async function listTtsVoicesAction(
  input: unknown,
): Promise<ActionResult<{ voices: TtsVoiceOption[] }>> {
  const denied = await denyUnlessAdmin();
  if (denied) {
    return { success: false, error: denied };
  }

  const parsed = listTtsVoicesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Provider fehlt." };
  }

  try {
    const voices = await listTtsVoicesForProvider(parsed.data.provider);
    return { success: true, data: { voices } };
  } catch (error) {
    if (error instanceof UserFacingError) {
      return { success: false, error: error.message };
    }
    console.error("[listTtsVoicesAction]", error);
    return {
      success: false,
      error: toUserFacingMessage(
        error,
        "Stimmen konnten nicht geladen werden.",
      ),
    };
  }
}

/**
 * Saves prompt templates for the story pipeline. Admin role required.
 */
export async function savePromptTemplatesAction(
  input: unknown,
): Promise<ActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) {
    return { success: false, error: denied };
  }

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
