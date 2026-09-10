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

const pinSchema = z
  .string()
  .trim()
  .regex(/^\d{4,8}$/, { message: "PIN: 4 bis 8 Ziffern." });

export const adventBookCreateSchema = z
  .object({
    personalMode: z.boolean().default(false),
    profileId: z.string().uuid().optional(),
    syllableHelp: z.boolean().default(false),
    includeImages: z.boolean().default(false),
    topic: z.string().trim().optional(),
    topicSecondary: z.string().trim().optional(),
    topicMixPattern: z.enum(mixPatternIds).optional(),
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
    pin: pinSchema,
    pinConfirm: pinSchema,
  })
  .superRefine((value, ctx) => {
    if (value.pin !== value.pinConfirm) {
      ctx.addIssue({
        code: "custom",
        path: ["pinConfirm"],
        message: "Die PIN-Wiederholung stimmt nicht.",
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

export const adventGenerateDaySchema = z.object({
  bookId: z.string().uuid({ message: "Ungültiges Adventskalenderbuch." }),
  dayNumber: z
    .number()
    .int()
    .min(1, { message: "Tag muss 1–24 sein." })
    .max(24, { message: "Tag muss 1–24 sein." }),
});

export const adventBookIdSchema = z.object({
  bookId: z.string().uuid({ message: "Ungültiges Adventskalenderbuch." }),
});

export const adventUnlockPreviewSchema = z.object({
  bookId: z.string().uuid({ message: "Ungültiges Adventskalenderbuch." }),
  pin: pinSchema,
});

export const adventGetDaySchema = z.object({
  bookId: z.string().uuid({ message: "Ungültiges Adventskalenderbuch." }),
  dayNumber: z
    .number()
    .int()
    .min(1)
    .max(24),
});

export type AdventBookCreateInput = z.infer<typeof adventBookCreateSchema>;
