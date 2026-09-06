import { z } from "zod";
import { STORY_LENGTH_STEP_IDS } from "@/lib/stories/length";
import { STORY_MOODS, STORY_SCHOOL_STAGES } from "@/lib/stories/options";

const listItemSchema = z
  .string()
  .trim()
  .min(1, "Eintrag darf nicht leer sein.")
  .max(120, "Eintrag ist zu lang (max. 120 Zeichen).");

const schoolStageIds = STORY_SCHOOL_STAGES.map((stage) => stage.id) as [
  (typeof STORY_SCHOOL_STAGES)[number]["id"],
  ...(typeof STORY_SCHOOL_STAGES)[number]["id"][],
];

const lengthStepIds = [...STORY_LENGTH_STEP_IDS] as [
  (typeof STORY_LENGTH_STEP_IDS)[number],
  ...(typeof STORY_LENGTH_STEP_IDS)[number][],
];

const moodIds = STORY_MOODS.map((mood) => mood.id) as [
  (typeof STORY_MOODS)[number]["id"],
  ...(typeof STORY_MOODS)[number]["id"][],
];

export const childProfileFieldsSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Bitte gib den Namen des Kindes ein.")
    .max(80, "Name ist zu lang (max. 80 Zeichen)."),
  schoolStage: z.enum(schoolStageIds, {
    message: "Bitte eine gültige Schulstufe wählen.",
  }),
  lengthStep: z.enum(lengthStepIds, {
    message: "Bitte eine gültige Textlänge wählen.",
  }),
  mood: z.enum(moodIds, {
    message: "Bitte eine gültige Art der Geschichte wählen.",
  }),
  friends: z.array(listItemSchema).max(50, "Maximal 50 Freunde."),
  interests: z.array(listItemSchema).max(50, "Maximal 50 Interessen."),
  experiences: z
    .array(listItemSchema)
    .max(50, "Maximal 50 Einträge unter „Das möchte ich mal erleben“."),
  fears: z
    .array(listItemSchema)
    .max(50, "Maximal 50 Einträge unter „Davor habe ich Angst“."),
  fearsGentle: z.boolean().default(false),
  includeImages: z.boolean(),
  syllableHelp: z.boolean(),
  wordHighlight: z.boolean(),
  readableAloud: z.boolean(),
  isDefault: z.boolean(),
});

export const saveChildProfileSchema = childProfileFieldsSchema.extend({
  id: z.string().uuid().nullable(),
});

export const deleteChildProfileSchema = z.object({
  id: z.string().uuid({ message: "Ungültige Profil-ID." }),
});

export const saveChildReadingModePrefsSchema = z.object({
  profileId: z.string().uuid({ message: "Ungültige Profil-ID." }),
  /** null clears the override (admin stage Standard). */
  prefs: z
    .object({
      fontScale: z.number().positive(),
      lineHeight: z.number().positive(),
      letterSpacingEm: z.number().min(0).max(0.2),
      fontWeight: z.number().int().min(100).max(900),
      contentMaxWidthRem: z.number().positive().max(80),
    })
    .nullable(),
});

const pinSchema = z
  .string()
  .trim()
  .regex(/^\d{4,8}$/, { message: "PIN: 4 bis 8 Ziffern." });

export const unlockChildProfilePinSchema = z.object({
  profileId: z.string().uuid({ message: "Ungültige Profil-ID." }),
  pin: pinSchema,
});

export const lockChildProfilePinSchema = z.object({
  profileId: z.string().uuid({ message: "Ungültige Profil-ID." }),
});

export const setChildProfilePinSchema = z
  .object({
    profileId: z.string().uuid({ message: "Ungültige Profil-ID." }),
    pin: pinSchema,
    pinConfirm: pinSchema,
    /** Required when a PIN already exists. */
    currentPin: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.pin !== value.pinConfirm) {
      ctx.addIssue({
        code: "custom",
        path: ["pinConfirm"],
        message: "Die PIN-Wiederholung stimmt nicht.",
      });
    }
  });

export const removeChildProfilePinSchema = z.object({
  profileId: z.string().uuid({ message: "Ungültige Profil-ID." }),
  currentPin: pinSchema,
});

/** @deprecated Use childProfileFieldsSchema */
export const userWorldSchema = childProfileFieldsSchema;
