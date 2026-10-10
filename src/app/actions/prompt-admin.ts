"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import { synthesizeSpeechWithElevenLabs } from "@/lib/ai/elevenlabs-tts";
import {
  ensureElevenLabsSharedVoice,
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

const ensureElevenLabsVoiceSchema = z.object({
  voiceId: z.string().trim().min(1).max(120),
  publicOwnerId: z.string().trim().min(1).max(120),
});

/**
 * Adds a Voice-Library voice to the ElevenLabs account (needed before TTS).
 */
export async function ensureElevenLabsVoiceAction(
  input: unknown,
): Promise<ActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = ensureElevenLabsVoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Stimme fehlt." };
  }

  try {
    await ensureElevenLabsSharedVoice(parsed.data);
    return { success: true };
  } catch (error) {
    console.error("[ensureElevenLabsVoiceAction]", error);
    return {
      success: false,
      error: toUserFacingMessage(
        error,
        "Stimme konnte nicht zur Bibliothek hinzugefügt werden.",
      ),
    };
  }
}

const previewTtsVoiceSchema = z.object({
  provider: z.string().trim().min(1),
  voiceId: z.string().trim().min(1).max(120),
  /** Required for Voice Library entries that are not yet in the account. */
  publicOwnerId: z.string().trim().min(1).max(120).optional().nullable(),
  /** Prefer playing this client-side; when absent we synthesize a short sample. */
  previewUrl: z.string().url().optional().nullable(),
});

/**
 * Returns a short MP3 probe for a TTS voice (ElevenLabs).
 * Prefer `previewUrl` from the voice list when present (no credits).
 */
export async function previewTtsVoiceAction(
  input: unknown,
): Promise<
  ActionResult<{
    audioBase64: string | null;
    previewUrl: string | null;
    mimeType: "audio/mpeg";
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) {
    return { success: false, error: denied };
  }

  const parsed = previewTtsVoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Stimme fehlt." };
  }

  const provider = parsed.data.provider.trim().toLowerCase();
  if (provider !== "elevenlabs") {
    return {
      success: false,
      error: "Hörprobe ist derzeit nur für ElevenLabs verfügbar.",
    };
  }

  const previewUrl = parsed.data.previewUrl?.trim() || null;
  if (previewUrl) {
    return {
      success: true,
      data: { audioBase64: null, previewUrl, mimeType: "audio/mpeg" },
    };
  }

  try {
    if (parsed.data.publicOwnerId?.trim()) {
      await ensureElevenLabsSharedVoice({
        voiceId: parsed.data.voiceId,
        publicOwnerId: parsed.data.publicOwnerId,
      });
    }
    const result = await synthesizeSpeechWithElevenLabs({
      text: "Hallo, ich bin eine Hörprobe für dein Hörbuch.",
      voiceId: parsed.data.voiceId,
      modelSlug: "eleven_v4",
      languageCode: "de",
    });
    return {
      success: true,
      data: {
        audioBase64: result.audio.toString("base64"),
        previewUrl: null,
        mimeType: "audio/mpeg",
      },
    };
  } catch (error) {
    if (error instanceof UserFacingError) {
      return { success: false, error: error.message };
    }
    console.error("[previewTtsVoiceAction]", error);
    return {
      success: false,
      error: toUserFacingMessage(error, "Hörprobe fehlgeschlagen."),
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
