import "@/lib/validations/configure-zod";
import { z } from "zod";
import { SOCIAL_CHANNELS } from "@/lib/social/types";

const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "Monat als JJJJ-MM angeben.",
  });

const channelSchema = z.enum(SOCIAL_CHANNELS);

export const socialGlobalSettingsSchema = z.object({
  storyline: z.string().max(8000),
  role: z.string().max(2000),
  format: z.string().max(2000),
  action: z.string().max(2000),
  imagePrompt: z.string().max(4000),
});

export const socialYearMonthSchema = z.object({
  yearMonth: yearMonthSchema,
});

export const socialGenerateCaptionSchema = z.object({
  yearMonth: yearMonthSchema,
  postDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  channel: channelSchema.default("instagram"),
});

export const socialRefineCaptionSchema = z.object({
  yearMonth: yearMonthSchema,
  postDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  channel: channelSchema.default("instagram"),
  refineInstruction: z
    .string()
    .trim()
    .min(3, { message: "Überarbeitungs-Hinweis angeben." })
    .max(2000),
});

export const socialSaveCaptionSchema = z.object({
  yearMonth: yearMonthSchema,
  postDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  channel: channelSchema.default("instagram"),
  caption: z.string().max(8000),
});

export const socialGenerateImageSchema = z.object({
  yearMonth: yearMonthSchema,
  postDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  channel: channelSchema.default("instagram"),
  extraInstruction: z.string().trim().max(2000).optional(),
});
