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
