import "@/lib/validations/configure-zod";
import { z } from "zod";
import {
  VEO_DURATION_SECONDS,
  VEO_IMAGE_TO_VIDEO_SECONDS,
} from "@/lib/ai/gemini-video";

export const videoClipAspectSchema = z.enum(["16:9", "9:16"]);

export const videoClipDurationSchema = z.union([
  z.literal(4),
  z.literal(6),
  z.literal(8),
]);

/** Runtime check aligned with `VEO_DURATION_SECONDS`. */
export function isVeoDurationSeconds(
  value: number,
): value is (typeof VEO_DURATION_SECONDS)[number] {
  return (VEO_DURATION_SECONDS as readonly number[]).includes(value);
}

/** Form fields for image→video (file is validated in the action). Duration is fixed to 8s. */
export const videoClipGenerateFieldsSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(8, { message: "Prompt etwas genauer formulieren (mind. 8 Zeichen)." })
    .max(2000),
  durationSeconds: z
    .literal(VEO_IMAGE_TO_VIDEO_SECONDS)
    .default(VEO_IMAGE_TO_VIDEO_SECONDS),
  aspectRatio: videoClipAspectSchema.default("16:9"),
  modelSlug: z.string().trim().max(120).optional(),
});

export const videoClipIdSchema = z.object({
  clipId: z.string().uuid({ message: "Ungültige Clip-ID." }),
});

/** Form fields for uploading a finished MP4 (file validated in the action). */
export const videoClipUploadFieldsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { message: "Bitte einen Titel angeben." })
    .max(160),
  notes: z.string().trim().max(2000).default(""),
  durationSeconds: z.coerce
    .number()
    .int()
    .min(1, { message: "Dauer mind. 1 Sekunde." })
    .max(600, { message: "Dauer max. 600 Sekunden." })
    .default(8),
  aspectRatio: videoClipAspectSchema.default("16:9"),
});
