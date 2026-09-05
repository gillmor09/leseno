import "@/lib/validations/configure-zod";
import { z } from "zod";
import { STORY_LENGTH_STEP_IDS } from "@/lib/stories/length";
import {
  STORY_MOODS,
  STORY_SCHOOL_STAGES,
  STORY_TOP_TOPICS,
} from "@/lib/stories/options";

const schoolStageIds = STORY_SCHOOL_STAGES.map((stage) => stage.id) as [
  (typeof STORY_SCHOOL_STAGES)[number]["id"],
  ...(typeof STORY_SCHOOL_STAGES)[number]["id"][],
];

const moodIds = STORY_MOODS.map((mood) => mood.id) as [
  (typeof STORY_MOODS)[number]["id"],
  ...(typeof STORY_MOODS)[number]["id"][],
];

const lengthStepIds = [...STORY_LENGTH_STEP_IDS] as [
  (typeof STORY_LENGTH_STEP_IDS)[number],
  ...(typeof STORY_LENGTH_STEP_IDS)[number][],
];

const topTopicIds = [...STORY_TOP_TOPICS] as [
  (typeof STORY_TOP_TOPICS)[number],
  ...(typeof STORY_TOP_TOPICS)[number][],
];

export const storyGenerateSchema = z
  .object({
    /** When true, topic is optional; server loads Meine Welt for the profile. */
    personalMode: z.boolean().default(false),
    /** Selected child profile id (required when personalMode). */
    profileId: z.string().uuid().optional(),
    syllableHelp: z.boolean().default(false),
    /** When false, skip FLUX generation and layout embedding. */
    includeImages: z.boolean().default(false),
    /**
     * Public `/kostenlos` try-out: stricter options + IP daily quota.
     * Must not be combined with personalMode.
     */
    trialMode: z.boolean().default(false),
    topic: z.string().trim().optional(),
    schoolStage: z.enum(schoolStageIds, {
      message: "Bitte eine gültige Schulstufe wählen.",
    }),
    lengthStep: z.enum(lengthStepIds, {
      message: "Bitte eine gültige Textlänge wählen.",
    }),
    mood: z.enum(moodIds, {
      message: "Bitte eine gültige Stimmung wählen.",
    }),
  })
  .superRefine((value, ctx) => {
    if (value.trialMode && value.personalMode) {
      ctx.addIssue({
        code: "custom",
        path: ["trialMode"],
        message: "Der Testmodus gilt nur für Freies Lesen.",
      });
    }
    if (value.personalMode) {
      if (!value.profileId) {
        ctx.addIssue({
          code: "custom",
          path: ["profileId"],
          message: "Bitte wähl ein Kinder-Profil für „Ganz persönlich“.",
        });
      }
      return;
    }
    if (!value.topic || !(topTopicIds as string[]).includes(value.topic)) {
      ctx.addIssue({
        code: "custom",
        path: ["topic"],
        message: "Bitte wähl ein Thema oder schalte „Ganz persönlich“ ein.",
      });
    }
  });

export type StoryGenerateFormInput = z.infer<typeof storyGenerateSchema>;
