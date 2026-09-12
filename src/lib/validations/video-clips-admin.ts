import "@/lib/validations/configure-zod";
import { z } from "zod";
import { VEO_DURATION_SECONDS } from "@/lib/ai/gemini-video";

export const videoClipAspectSchema = z.enum(["16:9", "9:16"]);

export const videoClipDurationSchema = z.union([
  z.literal(4),
  z.literal(6),
  z.literal(8),
  z.literal(10),
  z.literal(12),
  z.literal(15),
  z.literal(20),
]);

/** Runtime check aligned with `VEO_DURATION_SECONDS`. */
export function isVeoDurationSeconds(
  value: number,
): value is (typeof VEO_DURATION_SECONDS)[number] {
  return (VEO_DURATION_SECONDS as readonly number[]).includes(value);
}

/** Form fields for image→video (file is validated in the action). */
export const videoClipGenerateFieldsSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(8, { message: "Prompt etwas genauer formulieren (mind. 8 Zeichen)." })
    .max(2000),
  durationSeconds: videoClipDurationSchema.default(8),
  aspectRatio: videoClipAspectSchema.default("16:9"),
  modelSlug: z.string().trim().max(120).optional(),
});

/** Extend a stored Veo clip via its Gemini file URI. */
export const videoClipExtendFieldsSchema = z.object({
  sourceClipId: z.string().uuid({ message: "Ungültige Clip-ID." }),
  prompt: z
    .string()
    .trim()
    .min(8, { message: "Prompt etwas genauer formulieren (mind. 8 Zeichen)." })
    .max(2000),
  durationSeconds: videoClipDurationSchema.default(8),
  aspectRatio: videoClipAspectSchema.default("16:9"),
  modelSlug: z.string().trim().max(120).optional(),
});

export const videoClipIdSchema = z.object({
  clipId: z.string().uuid({ message: "Ungültige Clip-ID." }),
});
