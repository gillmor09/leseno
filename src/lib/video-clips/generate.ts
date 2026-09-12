/**
 * Admin Video-Clips: build a short Gemini Veo clip from image or extend prior Veo URI.
 */

import {
  DEFAULT_VEO_MODEL,
  generateWithGeminiVideo,
  type VeoAspectRatio,
  type VeoDurationSeconds,
} from "@/lib/ai/gemini-video";
import { FALLBACK_AI_MODELS } from "@/lib/prompts/catalog";
import { loadPromptAdminCatalog } from "@/lib/prompts/repository";

export type VideoClipGenerateInput =
  | {
      mode: "image";
      prompt: string;
      mimeType: string;
      /** Raw base64 without data-URL prefix. */
      base64: string;
      fileName: string;
      durationSeconds: VeoDurationSeconds;
      aspectRatio: VeoAspectRatio;
      modelSlug?: string;
    }
  | {
      mode: "extend";
      prompt: string;
      /** Gemini Veo download URI from a previous generation. */
      veoFileUri: string;
      sourceTitle: string;
      durationSeconds: VeoDurationSeconds;
      aspectRatio: VeoAspectRatio;
      modelSlug?: string;
    };

export type VideoClipGenerateResult = {
  buffer: Buffer;
  mimeType: string;
  modelSlug: string;
  durationSeconds: number;
  byteSize: number;
  suggestedTitle: string;
  promptUsed: string;
  veoFileUri: string | null;
  sourceKind: "image" | "video";
  sourceFileName: string;
};

/** Prefer catalog `video-default`, else wired Veo preview model. */
export async function resolveVideoClipModelSlug(
  preferred?: string | null,
): Promise<string> {
  const wanted = preferred?.trim();
  if (wanted) return wanted;
  try {
    const catalog = await loadPromptAdminCatalog({ mergeFallback: true });
    const fromDb = catalog.models.find(
      (m) =>
        m.isActive &&
        (m.id === "video-default" ||
          m.provider.trim().toLowerCase() === "gemini-video"),
    );
    if (fromDb?.modelSlug) return fromDb.modelSlug;
  } catch {
    // fallback
  }
  return (
    FALLBACK_AI_MODELS.find((m) => m.id === "video-default")?.modelSlug ??
    DEFAULT_VEO_MODEL
  );
}

/**
 * Runs Veo and returns MP4 bytes for Storage upload.
 */
export async function generateVideoClip(
  input: VideoClipGenerateInput,
): Promise<VideoClipGenerateResult> {
  const modelSlug = await resolveVideoClipModelSlug(input.modelSlug);
  const result = await generateWithGeminiVideo({
    prompt: input.prompt,
    modelSlug,
    durationSeconds: input.durationSeconds,
    aspectRatio: input.aspectRatio,
    source:
      input.mode === "image"
        ? {
            kind: "image",
            mimeType: input.mimeType,
            base64: input.base64,
          }
        : {
            kind: "video-uri",
            uri: input.veoFileUri,
          },
  });

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  let suggestedTitle: string;
  let sourceFileName: string;
  let sourceKind: "image" | "video";

  if (input.mode === "image") {
    const base = input.fileName.replace(/\.[^.]+$/, "").trim() || "Clip";
    const safeBase = base
      .slice(0, 60)
      .replace(/[^\w\-äöüÄÖÜß ]+/gi, " ")
      .trim();
    suggestedTitle = `${safeBase || "Video-Clip"} · ${stamp}`;
    sourceFileName = input.fileName;
    sourceKind = "image";
  } else {
    suggestedTitle = `Verlängerung · ${input.sourceTitle.slice(0, 40)} · ${stamp}`;
    sourceFileName = input.sourceTitle;
    sourceKind = "video";
  }

  return {
    buffer: result.buffer,
    mimeType: result.mimeType,
    modelSlug: result.modelSlug,
    durationSeconds: result.durationSeconds,
    byteSize: result.buffer.byteLength,
    suggestedTitle,
    promptUsed: input.prompt.trim(),
    veoFileUri: result.veoFileUri,
    sourceKind,
    sourceFileName,
  };
}
