"use server";

/**
 * Admin Video-Clips: Gemini Veo generation, finished MP4 upload,
 * Storage persist, list + delete.
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
  videoClipUploadFieldsSchema,
} from "@/lib/validations/video-clips-admin";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Match Storage bucket `file_size_limit` (50 MB). */
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const VIDEO_MIME = new Set(["video/mp4", "video/quicktime"]);

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

function sniffMp4(mime: string, fileName: string): boolean {
  const lower = mime.toLowerCase().trim();
  if (lower === "video/mp4") return true;
  // Some browsers send empty type or video/quicktime for .mp4 — still require .mp4.
  if (VIDEO_MIME.has(lower) || !lower) {
    return /\.mp4$/i.test(fileName);
  }
  return /\.mp4$/i.test(fileName);
}

function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  return base.slice(0, 160) || "Video-Clip";
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

/**
 * Upload a finished MP4 into the same Storage + metadata list.
 * FormData: `file`, `title`, optional `notes`, `durationSeconds`, `aspectRatio`.
 */
export async function uploadVideoClipAction(
  formData: FormData,
): Promise<ActionResult<VideoClipListItem>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, error: "Bitte eine MP4-Datei wählen." };
  }

  const fields = videoClipUploadFieldsSchema.safeParse({
    title: String(formData.get("title") ?? "").trim() || titleFromFileName(file.name || ""),
    notes: String(formData.get("notes") ?? ""),
    durationSeconds: Number(formData.get("durationSeconds") ?? 8),
    aspectRatio: String(formData.get("aspectRatio") ?? "16:9"),
  });
  if (!fields.success) {
    return {
      success: false,
      error: fields.error.issues[0]?.message ?? "Ungültige Eingabe.",
    };
  }

  if (!sniffMp4(file.type || "", file.name || "")) {
    return { success: false, error: "Nur MP4-Dateien sind erlaubt." };
  }

  if (file.size <= 0 || file.size > MAX_VIDEO_BYTES) {
    return { success: false, error: "Video zu groß (max. 50 MB)." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const user = await getCurrentUser();
    const clipId = randomUUID();
    const notes = fields.data.notes.trim();
    const saved = await saveGeneratedVideoClip({
      clipId,
      buffer,
      title: fields.data.title,
      prompt: notes || "Fertiger Upload (ohne KI-Generierung).",
      modelSlug: "upload",
      durationSeconds: fields.data.durationSeconds,
      aspectRatio: fields.data.aspectRatio,
      sourceKind: "video",
      sourceFileName: file.name || "clip.mp4",
      veoFileUri: null,
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
        : "Video-Clip-Upload fehlgeschlagen.";
    console.error("[video-clips] upload failed:", message, error);
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
