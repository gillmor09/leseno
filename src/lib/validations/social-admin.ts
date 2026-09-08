import "@/lib/validations/configure-zod";
import { z } from "zod";
import { SOCIAL_CHANNELS } from "@/lib/social/types";

const postDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: "Datum als JJJJ-MM-TT angeben.",
});

const angleIdSchema = z
  .string()
  .trim()
  .min(1, { message: "Winkel auswählen." })
  .max(80);

const channelSchema = z.enum(SOCIAL_CHANNELS);

export const socialGlobalSettingsSchema = z.object({
  storyline: z.string().max(8000),
  role: z.string().max(2000),
  format: z.string().max(2000),
  action: z.string().max(2000),
  imagePrompt: z.string().max(4000),
});

export const socialGenerateCaptionSchema = z.object({
  postDate: postDateSchema,
  angleId: angleIdSchema,
  channel: channelSchema.default("instagram"),
});

export const socialRefineCaptionSchema = z.object({
  postDate: postDateSchema,
  angleId: angleIdSchema,
  channel: channelSchema.default("instagram"),
  refineInstruction: z
    .string()
    .trim()
    .min(3, { message: "Überarbeitungs-Hinweis angeben." })
    .max(2000),
});

export const socialSaveCaptionSchema = z.object({
  postDate: postDateSchema,
  angleId: angleIdSchema,
  channel: channelSchema.default("instagram"),
  caption: z.string().max(8000),
});

export const socialGenerateImageSchema = z.object({
  postDate: postDateSchema,
  angleId: angleIdSchema,
  channel: channelSchema.default("instagram"),
  extraInstruction: z.string().trim().max(2000).optional(),
});

export const socialClearImageSchema = z.object({
  postDate: postDateSchema,
  angleId: angleIdSchema,
  channel: channelSchema.default("instagram"),
});

export const socialSetPublishedSchema = z.object({
  postDate: postDateSchema,
  angleId: angleIdSchema,
  channel: channelSchema.default("instagram"),
  published: z.boolean(),
});
