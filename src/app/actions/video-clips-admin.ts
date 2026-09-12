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
  videoClipExtendFieldsSchema,
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

async function persistAndReturn(
  generated: Awaited<ReturnType<typeof generateVideoClip>>,
  aspectRatio: string,
): Promise<VideoClipListItem> {
  const user = await getCurrentUser();
  const clipId = randomUUID();
  const saved = await saveGeneratedVideoClip({
    clipId,
    buffer: generated.buffer,
    title: generated.suggestedTitle,
    prompt: generated.promptUsed,
    modelSlug: generated.modelSlug,
    durationSeconds: generated.durationSeconds,
    aspectRatio,
    sourceKind: generated.sourceKind,
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
  return { ...saved, signedUrl };
}

/**
 * Image → Veo clip. FormData: `file`, `prompt`, optional duration/aspect/modelSlug.
 * Uploaded videos are not supported (Veo needs a prior generation URI to extend).
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
      error:
        "Nur Bildvorlagen (JPEG/PNG/WebP). Hochgeladene Videos unterstützt Veo nicht — bitte einen gespeicherten Clip verlängern.",
    };
  }

  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return { success: false, error: "Bild zu groß (max. 8 MB)." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const generated = await generateVideoClip({
      mode: "image",
      prompt: fields.data.prompt,
      mimeType: normalizeImageMime(file.type || "", file.name || ""),
      base64: buffer.toString("base64"),
      fileName: file.name || "vorlage.jpg",
      durationSeconds: fields.data.durationSeconds,
      aspectRatio: fields.data.aspectRatio,
      modelSlug: fields.data.modelSlug,
    });

    const item = await persistAndReturn(generated, fields.data.aspectRatio);
    return { success: true, data: item };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Video-Clip-Generierung fehlgeschlagen.",
    };
  }
}

/**
 * Extend a previously generated Veo clip via its Gemini file URI.
 */
export async function extendVideoClipAction(
  input: unknown,
): Promise<ActionResult<VideoClipListItem>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = videoClipExtendFieldsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe.",
    };
  }

  try {
    const clips = await listVideoClipsWithUrls();
    const source = clips.find((c) => c.id === parsed.data.sourceClipId);
    if (!source) {
      return { success: false, error: "Ausgangs-Clip nicht gefunden." };
    }
    if (!source.veoFileUri) {
      return {
        success: false,
        error:
          "Dieser Clip hat keine Gemini-URI mehr (nur ca. 2 Tage nach Erzeugung verlängerbar).",
      };
    }

    const generated = await generateVideoClip({
      mode: "extend",
      prompt: parsed.data.prompt,
      veoFileUri: source.veoFileUri,
      sourceTitle: source.title,
      durationSeconds: parsed.data.durationSeconds,
      aspectRatio: parsed.data.aspectRatio,
      modelSlug: parsed.data.modelSlug,
    });

    const item = await persistAndReturn(generated, parsed.data.aspectRatio);
    return { success: true, data: item };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Video-Verlängerung fehlgeschlagen.",
    };
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
