import { z } from "zod";
import { STORY_SCHOOL_STAGES } from "@/lib/stories/options";

const stageIds = STORY_SCHOOL_STAGES.map((stage) => stage.id) as [
  (typeof STORY_SCHOOL_STAGES)[number]["id"],
  ...(typeof STORY_SCHOOL_STAGES)[number]["id"][],
];

const prefsSchema = z.object({
  fontScale: z.number().positive().max(3),
  lineHeight: z.number().positive().max(4),
  letterSpacingEm: z.number().min(0).max(0.2),
  fontWeight: z.number().int().min(100).max(900),
  contentMaxWidthRem: z.number().positive().max(80),
});

export const readingTypographyDefaultsFormSchema = z.object({
  defaults: z.array(
    z.object({
      schoolStage: z.enum(stageIds),
      prefs: prefsSchema,
    }),
  ),
});
