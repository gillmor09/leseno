"use server";

/**
 * Admin Video-Clips: Gemini Veo generation, Storage persist, list + delete.
 */

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import { getCurrentUser } from "@/lib/auth/session";
import { generateVideoClip } from "@/lib/video-clips/generate";
import {
  deleteVideoClip,
  listVideoClipsWithUrls,
  saveGeneratedVideoClip,
  type VideoClipListItem,
} from "@/lib/video-clips/repository";
import { createVideoClipSignedUrl } from "@/lib/video-clips/storage";
import type { ActionResult } from "@/lib/types/actions";
import {
  videoClipGenerateFieldsSchema,
  videoClipIdSchema,
} from "@/lib/validations/video-clips-admin";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

function sniffImage(mime: string, fileName: string): boolean {
  const lower = mime.toLowerCase();
  if (IMAGE_MIME.has(lower)) return true;
  return /\.(jpe?g|png|webp)$/i.test(fileName);
}

function normalizeImageMime(mime: string, fileName: string) {
  const lower = mime.toLowerCase().trim();
  if (lower === "image/jpg") return "image/jpeg";
  if (IMAGE_MIME.has(lower)) return lower;
  if (fileName.toLowerCase().endsWith(".png")) return "image/png";
  if (fileName.toLowerCase().endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function revalidateVideoClips() {
  revalidatePath("/admin/video-clips");
}

/**
 * Image → Veo clip. FormData: `file`, `prompt`, optional duration/aspect/modelSlug.
 */
export async function generateVideoClipAction(
  formData: FormData,
): Promise<ActionResult<VideoClipListItem>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, error: "Bitte ein Bild als Vorlage hochladen." };
  }

  const fields = videoClipGenerateFieldsSchema.safeParse({
    prompt: String(formData.get("prompt") ?? ""),
    durationSeconds: Number(formData.get("durationSeconds") ?? 8),
    aspectRatio: String(formData.get("aspectRatio") ?? "16:9"),
    modelSlug: String(formData.get("modelSlug") ?? "").trim() || undefined,
  });
  if (!fields.success) {
    return {
      success: false,
      error: fields.error.issues[0]?.message ?? "Ungültige Eingabe.",
    };
  }

  if (!sniffImage(file.type || "", file.name || "")) {
    return {
      success: false,
      error: "Nur Bildvorlagen (JPEG/PNG/WebP) sind erlaubt.",
    };
  }

  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return { success: false, error: "Bild zu groß (max. 8 MB)." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const generated = await generateVideoClip({
      prompt: fields.data.prompt,
      mimeType: normalizeImageMime(file.type || "", file.name || ""),
      base64: buffer.toString("base64"),
      fileName: file.name || "vorlage.jpg",
      aspectRatio: fields.data.aspectRatio,
      modelSlug: fields.data.modelSlug,
    });

    const user = await getCurrentUser();
    const clipId = randomUUID();
    const saved = await saveGeneratedVideoClip({
      clipId,
      buffer: generated.buffer,
      title: generated.suggestedTitle,
      prompt: generated.promptUsed,
      modelSlug: generated.modelSlug,
      durationSeconds: generated.durationSeconds,
      aspectRatio: fields.data.aspectRatio,
      sourceKind: "image",
      sourceFileName: generated.sourceFileName,
      veoFileUri: generated.veoFileUri,
      createdBy: user?.id ?? null,
    });

    let signedUrl: string | null = null;
    try {
      signedUrl = await createVideoClipSignedUrl(saved.storagePath);
    } catch {
      signedUrl = null;
    }

    revalidateVideoClips();
    return { success: true, data: { ...saved, signedUrl } };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Video-Clip-Generierung fehlgeschlagen.";
    console.error("[video-clips] generate failed:", message, error);
    return { success: false, error: message };
  }
}

/** Reload clip list with fresh signed URLs. */
export async function listVideoClipsAction(): Promise<
  ActionResult<{ clips: VideoClipListItem[] }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  try {
    const clips = await listVideoClipsWithUrls();
    return { success: true, data: { clips } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Video-Clips laden fehlgeschlagen.",
    };
  }
}

/** Delete clip metadata + Storage object. */
export async function deleteVideoClipAction(
  input: unknown,
): Promise<ActionResult<{ deleted: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = videoClipIdSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige ID.",
    };
  }

  try {
    const deleted = await deleteVideoClip(parsed.data.clipId);
    revalidateVideoClips();
    return { success: true, data: { deleted } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Video-Clip löschen fehlgeschlagen.",
    };
  }
}
