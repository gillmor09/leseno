import "@/lib/validations/configure-zod";
import { z } from "zod";
import { STORY_LENGTH_STEP_IDS } from "@/lib/stories/length";
import {
  STORY_MOODS,
  STORY_SCHOOL_STAGES,
  STORY_TOPIC_MIX_PATTERNS,
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

const mixPatternIds = STORY_TOPIC_MIX_PATTERNS.map((pattern) => pattern.id) as [
  (typeof STORY_TOPIC_MIX_PATTERNS)[number]["id"],
  ...(typeof STORY_TOPIC_MIX_PATTERNS)[number]["id"][],
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
    /** Optional second theme; requires `topicMixPattern`. */
    topicSecondary: z.string().trim().optional(),
    topicMixPattern: z.enum(mixPatternIds).optional(),
    /** Realistic conflict depth (lingering emotions / compromise). */
    conflictDepth: z.boolean().default(false),
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
      return;
    }
    const secondary = value.topicSecondary?.trim() ?? "";
    if (!secondary) {
      if (value.topicMixPattern) {
        ctx.addIssue({
          code: "custom",
          path: ["topicMixPattern"],
          message: "Ein Mix-Muster braucht ein Nebenthema.",
        });
      }
      return;
    }
    if (!(topTopicIds as string[]).includes(secondary)) {
      ctx.addIssue({
        code: "custom",
        path: ["topicSecondary"],
        message: "Bitte wähl ein gültiges Nebenthema.",
      });
      return;
    }
    if (secondary === value.topic) {
      ctx.addIssue({
        code: "custom",
        path: ["topicSecondary"],
        message: "Haupt- und Nebenthema müssen verschieden sein.",
      });
      return;
    }
    if (!value.topicMixPattern) {
      ctx.addIssue({
        code: "custom",
        path: ["topicMixPattern"],
        message: "Bitte wähl, wie die beiden Themen verbunden werden.",
      });
    }
  });

export type StoryGenerateFormInput = z.infer<typeof storyGenerateSchema>;
