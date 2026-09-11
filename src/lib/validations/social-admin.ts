import "@/lib/validations/configure-zod";
import { z } from "zod";
import { SOCIAL_CHANNELS, SOCIAL_POST_KINDS } from "@/lib/social/types";

const postDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: "Datum als JJJJ-MM-TT angeben.",
});

const angleIdSchema = z
  .string()
  .trim()
  .min(1, { message: "Winkel oder Funktionen auswählen." })
  .max(120);

const channelSchema = z.enum(SOCIAL_CHANNELS);
const postKindSchema = z.enum(SOCIAL_POST_KINDS).default("winkel");

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
  postKind: postKindSchema,
  channel: channelSchema.default("instagram"),
  /** Overlay question — required when `postKind` is `frage`. */
  frageQuestion: z.string().trim().max(500).optional(),
});

export const socialGenerateFrageSchema = z.object({
  postDate: postDateSchema,
  channel: channelSchema.default("instagram"),
});

export const socialRefineCaptionSchema = z.object({
  postDate: postDateSchema,
  angleId: angleIdSchema,
  postKind: postKindSchema,
  channel: channelSchema.default("instagram"),
  refineInstruction: z
    .string()
    .trim()
    .min(3, { message: "Überarbeitungs-Hinweis angeben." })
    .max(2000),
  frageQuestion: z.string().trim().max(500).optional(),
});

export const socialSaveCaptionSchema = z.object({
  postDate: postDateSchema,
  angleId: angleIdSchema,
  postKind: postKindSchema,
  channel: channelSchema.default("instagram"),
  caption: z.string().max(8000),
});

export const socialGenerateImageSchema = z.object({
  postDate: postDateSchema,
  angleId: angleIdSchema,
  postKind: postKindSchema,
  channel: channelSchema.default("instagram"),
  /** Draft caption from the create form — required when the post is not saved yet. */
  caption: z.string().max(8000).optional(),
  /** Overlay question for `frage` posts (also stored as last_image_prompt). */
  frageQuestion: z.string().trim().max(500).optional(),
  extraInstruction: z.string().trim().max(2000).optional(),
});

/** Persist create-form draft (caption + optional image) — only on „Übernehmen“. */
export const socialCommitPostSchema = z.object({
  postDate: postDateSchema,
  angleId: angleIdSchema,
  postKind: postKindSchema,
  channel: channelSchema.default("instagram"),
  caption: z
    .string()
    .trim()
    .min(1, { message: "Caption fehlt — zuerst Text erzeugen." })
    .max(8000),
  imageDataUrl: z.string().max(12_000_000).nullable().optional(),
  lastImagePrompt: z.string().max(16_000).nullable().optional(),
  /** Frage overlay text — stored in last_image_prompt when set. */
  frageQuestion: z.string().trim().max(500).optional(),
});

export const socialClearImageSchema = z.object({
  postDate: postDateSchema,
  angleId: angleIdSchema,
  postKind: postKindSchema,
  channel: channelSchema.default("instagram"),
});

export const socialSetPublishedSchema = z.object({
  postDate: postDateSchema,
  angleId: angleIdSchema,
  postKind: postKindSchema,
  channel: channelSchema.default("instagram"),
  published: z.boolean(),
});

export const socialDeletePostSchema = z.object({
  postId: z.string().uuid({ message: "Ungültiger Beitrag." }),
});
